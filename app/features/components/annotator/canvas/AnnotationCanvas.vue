<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { Images, ImageOff, Loader2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { colorForShape } from '~/core/helpers/annotationClasses'
import { useCanvasViewport } from '~/core/composables/useCanvasViewport'
import {
    CORNERS,
    clampPoint,
    cornerPoint,
    insertPointOnEdge,
    isDegenerate,
    isNear,
    nearestEdge,
    removePolygonPoint,
    rectFromDrag,
    resizeRect,
    topmostAt,
    vertexAt,
    translateShape,
    withDerivedBbox,
    type Corner,
    type Point,
    type Shape,
} from '~/core/helpers/annotationShapes'
import { localId } from '~/core/helpers/localId'

/**
 * The zoomable, pannable, drawable image surface.
 *
 * The geometry lives in two unit-tested DOM-free modules - `viewportTransform` for pan/zoom,
 * `annotationShapes` for the shapes - and this file owns only pointers and DOM. Same split as
 * `ImageCropper.vue` / `imageCrop.ts`, and it is what makes the part that decides where a box
 * actually is testable at all, since vitest here runs with no DOM.
 *
 * THE OVERLAY IS INSIDE THE TRANSFORMED ELEMENT, deliberately. Shapes inherit the picture's own
 * transform, so they cannot drift from it at any zoom. `AnnotatedImage.vue` takes the opposite
 * approach - it recomputes the browser's layout and has to agree with the CSS exactly - and its
 * comments record what happens when two descriptions of one rectangle disagree.
 */
export type Tool = 'select' | 'rectangle' | 'polygon' | 'delete'

const props = withDefaults(
    defineProps<{
        src: string | null
        tool: Tool
        /** What `expert_curated` starts as on a newly drawn shape. See the page for who gets true. */
        defaultCurated: boolean
        /** The class list, in order. Position decides colour, so this must stay append-only. */
        classLabels: string[]
        /** Shapes the labels panel has hidden. Not drawn, and not hit-testable while hidden. */
        hiddenIds: Set<string>
        /** The class a newly drawn shape takes, so drawing lands labelled rather than blank. */
        activeClass: string | null
        /** The image's name, so a failure says WHICH image rather than "an image". */
        name?: string
        /** Shape id to model confidence, for the ones seeded and not yet judged. */
        seeded?: Record<string, number>
        /**
         * A touch-first layout (below 1280px).
         *
         * Gates the loupe and the finger-sized hit areas. Keyed on the LAYOUT rather than only on
         * the pointer, because a tablet with a trackpad attached still has fingers, and a narrow
         * desktop window wants the same generous targets.
         */
        touchLayout?: boolean
        /**
         * Space is held.
         *
         * Pans regardless of the active tool, so the picture can be moved without leaving the
         * polygon being drawn. A modifier for a gesture, which is why it arrives as STATE rather
         * than as an action - it is true for as long as the key is down.
         */
        spacePanning?: boolean
        /**
         * Width in CSS pixels that something else is covering on the RIGHT, i.e. the labels panel.
         *
         * The picture centres in what is left rather than under the panel. Handled as an inset on
         * the viewport instead of by shrinking the element, because every piece of the pan/zoom
         * arithmetic is expressed against a viewport rectangle - so narrowing that rectangle moves
         * the fit, the pan bounds, the pointer mapping and the label positions together, and none
         * of them can disagree about where the middle is.
         */
        insetRight?: number
    }>(),
    { insetRight: 0 },
)

const shapes = defineModel<Shape[]>('shapes', { required: true })
const selectedId = defineModel<string | null>('selectedId', { required: true })

const emit = defineEmits<{ commit: []; retry: []; undo: [] }>()

const container = useTemplateRef<HTMLElement>('container')

/**
 * Fit, zoom, pan and the coordinate mappings, all from one composable.
 *
 * This file owns pointers and DOM; `useCanvasViewport` owns the transform, and the arithmetic under
 * it is DOM-free and unit tested. Extracted because the two concerns had grown into one 1100-line
 * component where the part worth trusting was inseparable from the part that only handles clicks.
 */
const view = useCanvasViewport(container, {
    src: computed(() => props.src),
    insetRight: computed(() => props.insetRight),
})

const transform = view.transform
const natural = view.natural
const viewport = view.viewport
const ready = view.ready

const cursor = ref<Point | null>(null)

/**
 * Load state, driven by the `<img>` itself.
 *
 * A dark canvas with nothing on it is indistinguishable from a bug, which is exactly how the
 * zero-height regression went unnoticed - so every moment before the picture appears says which
 * moment it is: loading, or failed and why.
 */
const loadState = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')

watch(
    () => props.src,
    (src) => (loadState.value = src ? 'loading' : 'idle'),
    { immediate: true },
)

const onLoad = (event: Event) => {
    const img = event.target as HTMLImageElement
    // A decoded image with no dimensions is a broken decode, not a success.
    if (!img.naturalWidth || !img.naturalHeight) {
        loadState.value = 'failed'
        return
    }
    view.measure(img)
    loadState.value = 'ready'
}

const onError = () => (loadState.value = 'failed')

const emitRetry = () => emit('retry')

/**
 * The loupe: a magnified circle of what the finger is covering.
 *
 * Only on touch, and only while a vertex is being dragged or a ring drawn - the two moments where
 * the thing being placed is directly under the fingertip and therefore invisible. Offset UP-LEFT of
 * the touch point for the same reason: anywhere else and the loupe covers what the loupe is for.
 */
const LOUPE_SIZE = 112
const LOUPE_ZOOM = 2.5

const loupe = ref<{ x: number; y: number } | null>(null)

const loupeStyle = computed(() => {
    const at = loupe.value
    const nat = natural.value
    if (!at || !nat) return undefined
    const scale = transform.value.scale * LOUPE_ZOOM
    return {
        // The picture, scaled up and shifted so the touched point sits at the loupe's centre.
        width: `${nat.w * scale}px`,
        height: `${nat.h * scale}px`,
        transform: `translate(${LOUPE_SIZE / 2 - at.x * nat.w * scale}px, ${
            LOUPE_SIZE / 2 - at.y * nat.h * scale
        }px)`,
    }
})

/** Named so the failure says which image, which is the first thing anyone needs. */
const failureLabel = computed(() => `Could not load ${props.name || 'this image'}`)

/** Pointer position in the normalized [0,1] space every shape is stored in. */
const normalized = (event: PointerEvent): Point => view.toNormalized(event)

const onWheel = (event: WheelEvent) => view.zoomAtCursor(event, event.deltaY)

// ---- interaction ------------------------------------------------------------------------------

/**
 * What the pointer is currently doing. One discriminated value rather than several booleans,
 * because "panning AND resizing" is not a state that should be representable.
 */
type Gesture =
    | { kind: 'none' }
    | { kind: 'pan'; last: { x: number; y: number } }
    | { kind: 'draw'; origin: Point; id: string }
    | { kind: 'move'; id: string; last: Point }
    | { kind: 'resize'; id: string; corner: Corner }
    | { kind: 'vertex'; id: string; index: number }
    /** Two fingers down. Nothing else may happen until both lift. */
    | { kind: 'pinch' }

const gesture = ref<Gesture>({ kind: 'none' })

/** The polygon being built, if any. */
const draftPolygon = ref<Point[] | null>(null)

/**
 * The vertex the next Delete would remove, if any.
 *
 * Selecting a POINT as well as a shape is what lets one key mean both "remove this node" and
 * "remove this shape" without a modifier: touching a handle narrows the target, touching anything
 * else widens it back. Cleared whenever the selected shape changes, so a stale index can never
 * address a vertex on a different polygon.
 */
const selectedVertex = ref<number | null>(null)

watch(selectedId, () => (selectedVertex.value = null))

const newId = () => localId('s')

const shapeById = (id: string) => shapes.value.find((shape) => shape.id === id)

const replaceShape = (id: string, next: Shape) => {
    const index = shapes.value.findIndex((shape) => shape.id === id)
    if (index !== -1) shapes.value[index] = next
}

/**
 * Pointer Events rather than touch/mouse pairs: one code path for a finger, a stylus and a mouse,
 * and pinch falls out of tracking two active pointers instead of a separate gesture API. Mirrors
 * `ImageCropper.vue`, which solved the same problem for the camera crop.
 */
const active = new Map<number, { x: number; y: number }>()
let pinchStart: { dist: number; scale: number } | null = null
/** When the second finger landed, so a quick two-finger tap can be told from a pinch. */
let twoFingerStart = 0
/** Greatest change in finger separation during a pinch, so a tap is not read as a zoom. */
let pinchTravel = 0
/** The last single-finger tap, for double-tap-to-fit. */
let lastTapAt = 0

const pointerDistance = () => {
    const [a, b] = [...active.values()]
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Midpoint of the two active pointers, in container-local coordinates. */
const pinchMidpoint = () => {
    const [a, b] = [...active.values()]
    const rect = container.value?.getBoundingClientRect()
    if (!a || !b || !rect) return { x: 0, y: 0 }
    return { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top }
}

/**
 * Where a tap started, so a release can tell a tap from a drag.
 *
 * Polygon points land on RELEASE rather than on press, which is what makes the tool usable with a
 * finger: the rubber band follows while you are still touching, so you can see the segment you are
 * about to create and adjust before committing to it. A mouse gets the same behaviour, and it costs
 * nothing there because the preview was already following the cursor on hover.
 */
let tapOrigin: { x: number; y: number } | null = null
const TAP_SLOP = 10

const abandonPinch = () => {
    // A second finger during any other gesture cancels it rather than blending with it: a box being
    // resized while the canvas zooms under it ends up somewhere nobody asked for.
    gesture.value = { kind: 'pinch' }
    tapOrigin = null
}

const onPointerDown = (event: PointerEvent) => {
    if (!natural.value) return
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
    active.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (active.size === 2) {
        pinchStart = { dist: pointerDistance(), scale: transform.value.scale }
        twoFingerStart = performance.now()
        pinchTravel = 0
        abandonPinch()
        return
    }
    if (active.size > 2 || event.button !== 0) return

    const at = normalized(event)
    tapOrigin = { x: event.clientX, y: event.clientY }

    // Ahead of every tool: a held Space means "move the picture", whatever is armed.
    if (props.spacePanning) {
        gesture.value = { kind: 'pan', last: { x: event.clientX, y: event.clientY } }
        return
    }

    /*
     * A FINGER NEVER DRAWS. It pans, whatever tool is armed, even mid-polygon.
     *
     * A finger covers the thing it is placing, and a drag that draws means every attempt to move
     * the picture adds geometry instead. Drawing belongs to the pencil and the mouse. A tap is
     * still meaningful - it selects, or places a polygon point - and that is handled on release,
     * where a tap can be told from the start of a pan.
     */
    if (!pointerDraws(event.pointerType)) {
        gesture.value = { kind: 'pan', last: { x: event.clientX, y: event.clientY } }
        return
    }

    // A press that reaches the canvas did not land on a handle - those stop propagation - so the
    // delete target widens back to the shape.
    selectedVertex.value = null

    // The point is placed on release; this only records where the finger went down so the rubber
    // band has somewhere to run from.
    if (props.tool === 'polygon') return

    // Delete acts on release too, so a tap can be told from a drag. Empty space still pans, which
    // is what keeps the canvas navigable without leaving the tool.
    if (props.tool === 'delete') {
        if (!deleteHover.value) {
            gesture.value = { kind: 'pan', last: { x: event.clientX, y: event.clientY } }
        }
        return
    }

    if (props.tool === 'rectangle') {
        const id = newId()
        shapes.value.push({
            id,
            label: props.activeClass ?? '',
            ...rectFromDrag(at, at),
            polygon: null,
            expert_curated: props.defaultCurated,
        })
        selectedId.value = id
        gesture.value = { kind: 'draw', origin: at, id }
        return
    }

    // Select tool. Clicking an edge of the ALREADY SELECTED polygon adds a vertex there, which is
    // why this is tested before the ordinary hit test: the click is inside the shape either way,
    // and treating it as a move would make the edge unreachable.
    const selected = selectedId.value ? shapeById(selectedId.value) : null
    if (selected?.polygon) {
        const withPoint = insertPointOnEdge(selected, at, handleTolerance.value)
        if (withPoint) {
            replaceShape(selected.id, withPoint)
            emit('commit')
            return
        }
    }

    const hit = topmostAt(shapes.value, at)
    if (hit) {
        selectedId.value = hit.id
        gesture.value = { kind: 'move', id: hit.id, last: at }
    } else {
        selectedId.value = null
        gesture.value = { kind: 'pan', last: { x: event.clientX, y: event.clientY } }
    }
}

const startResize = (event: PointerEvent, id: string, corner: Corner) => {
    event.stopPropagation()
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
    selectedId.value = id
    gesture.value = { kind: 'resize', id, corner }
}

const startVertex = (event: PointerEvent, id: string, index: number) => {
    event.stopPropagation()
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
    selectedId.value = id
    // Set AFTER selectedId, whose watcher clears this - order matters, and reversing it silently
    // deselects the vertex that was just grabbed.
    selectedVertex.value = index
    gesture.value = { kind: 'vertex', id, index }
}

const onPointerMove = (event: PointerEvent) => {
    if (!natural.value) return

    // Shown for the gestures where the fingertip is on top of the work.
    const g0 = gesture.value
    // Off in the full layout, where there is a cursor rather than a fingertip covering the work.
    loupe.value =
        (props.touchLayout ?? isCoarsePointer.value) &&
        !pointerDraws(event.pointerType) &&
        (g0.kind === 'vertex' || g0.kind === 'move' || draftPolygon.value?.length)
            ? view.toNormalized(event)
            : null
    if (active.has(event.pointerId)) {
        active.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }

    // Zoom only while two fingers are down. Panning as well would make the image lurch on the frame
    // a pinch usually ends with, when one finger lifts a moment before the other.
    if (active.size >= 2) {
        if (pinchStart && pinchStart.dist > 0) {
            // How far the fingers travelled relative to each other, so a two-finger TAP (no
            // travel) can be told from a pinch when they lift.
            pinchTravel = Math.max(pinchTravel, Math.abs(pointerDistance() - pinchStart.dist))
            const target = (pointerDistance() / pinchStart.dist) * pinchStart.scale
            view.zoomAtPoint(pinchMidpoint(), target / transform.value.scale)
        }
        return
    }

    const at = normalized(event)
    cursor.value = at
    const g = gesture.value

    if (g.kind === 'pan') {
        const delta = { x: event.clientX - g.last.x, y: event.clientY - g.last.y }
        gesture.value = { kind: 'pan', last: { x: event.clientX, y: event.clientY } }
        view.pan(delta)
        return
    }

    const shape = 'id' in g ? shapeById(g.id) : undefined
    if (!shape) return

    if (g.kind === 'draw') {
        replaceShape(g.id, { ...shape, ...rectFromDrag(g.origin, at) })
    } else if (g.kind === 'move') {
        replaceShape(g.id, translateShape(shape, at.x - g.last.x, at.y - g.last.y))
        gesture.value = { ...g, last: at }
    } else if (g.kind === 'resize') {
        replaceShape(g.id, resizeRect(shape, g.corner, at))
    } else if (g.kind === 'vertex' && shape.polygon) {
        const polygon = shape.polygon.map((p, i) => (i === g.index ? clampPoint(at) : p))
        replaceShape(g.id, withDerivedBbox({ ...shape, polygon }))
    }
}

/** A release that never travelled far enough to be a drag. */
const wasTap = (event: PointerEvent): boolean =>
    tapOrigin !== null &&
    Math.hypot(event.clientX - tapOrigin.x, event.clientY - tapOrigin.y) <= TAP_SLOP

const onPointerUp = (event: PointerEvent) => {
    const wasPinching = active.size >= 2
    active.delete(event.pointerId)
    if (active.size < 2) pinchStart = null

    // The gesture stays dead until every finger is up, so the second lift of a pinch does not get
    // read as a tap and drop a stray polygon point.
    if (wasPinching || gesture.value.kind === 'pinch') {
        // A two-finger TAP - both down and up again quickly with no pinch worth the name - is undo.
        // It is the touch stand-in for the keyboard nobody has on a tablet.
        if (
            wasPinching &&
            active.size === 0 &&
            performance.now() - twoFingerStart < 250 &&
            pinchTravel < 12
        ) {
            emit('undo')
        }
        if (active.size === 0) gesture.value = { kind: 'none' }
        tapOrigin = null
        return
    }

    // Double tap fits. Checked before the tool's own tap handling, so the second tap cannot also
    // place a point.
    if (!pointerDraws(event.pointerType) && wasTap(event)) {
        const now = performance.now()
        if (now - lastTapAt < 300) {
            lastTapAt = 0
            view.fit()
            tapOrigin = null
            endGesture()
            return
        }
        lastTapAt = now
    }

    if (props.tool === 'delete' && natural.value && wasTap(event)) {
        deleteAtCursor()
        tapOrigin = null
        endGesture()
        return
    }

    if (props.tool === 'polygon' && natural.value && wasTap(event)) {
        const at = normalized(event)
        const draft = draftPolygon.value

        // No ring in progress and the tap landed on an edge of the selected polygon: add a vertex
        // there. Starting a second polygon on top of the one being edited is almost never what was
        // meant, and it is the reading this tool used to take.
        if (!draft?.length) {
            const selected = selectedId.value ? shapeById(selectedId.value) : null
            if (selected?.polygon) {
                const withPoint = insertPointOnEdge(selected, at, handleTolerance.value)
                if (withPoint) {
                    replaceShape(selected.id, withPoint)
                    // The inserted vertex becomes the delete target, so a misplaced one is undone
                    // by the same key that removes any other.
                    const edge = nearestEdge(selected.polygon, at)
                    if (edge) selectedVertex.value = edge.index + 1
                    emit('commit')
                    tapOrigin = null
                    endGesture()
                    return
                }
            }
        }
        // Tapping the first dot closes the ring, the gesture every other polygon tool uses. Three
        // points minimum, because that is the least the server accepts.
        if (draft && draft.length >= 3 && isNear(at, draft[0]!, closeTolerance.value)) {
            closePolygon()
        } else {
            draftPolygon.value = [...(draft ?? []), clampPoint(at)]
        }
    }

    tapOrigin = null
    endGesture()
}

const endGesture = () => {
    loupe.value = null

    /*
     * A shape too small to mean anything is discarded, not kept and flagged.
     *
     * Two ways to make one: a click with the rectangle tool, which is a zero-area box, and dragging
     * a corner onto its opposite, which collapses an existing one. The second used to survive and
     * sit in the list as "too small to save" - an entry you could select and label but never send.
     *
     * `isDegenerate` rather than a threshold repeated here, so this and the payload builder cannot
     * drift about what counts as too small. The removal goes through the normal commit below, so
     * undo brings it back.
     */
    const g = gesture.value
    if (g.kind === 'draw' || g.kind === 'resize') {
        const shape = shapeById(g.id)
        if (shape && isDegenerate(shape)) {
            shapes.value = shapes.value.filter((other) => other.id !== shape.id)
            if (selectedId.value === shape.id) selectedId.value = null
        }
    }
    if (gesture.value.kind !== 'none' && gesture.value.kind !== 'pan') emit('commit')
    gesture.value = { kind: 'none' }
}

/** Close the polygon being drawn. Needs three points, which is what the server accepts. */
const closePolygon = () => {
    const points = draftPolygon.value
    draftPolygon.value = null
    if (!points || points.length < 3) return
    const id = newId()
    shapes.value.push(
        withDerivedBbox({
            id,
            label: props.activeClass ?? '',
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            polygon: points,
            expert_curated: props.defaultCurated,
        }),
    )
    selectedId.value = id
    emit('commit')
}

const cancelPolygon = () => (draftPolygon.value = null)

/**
 * Right-click: take back the last draft point, or remove a vertex from the selected polygon.
 *
 * Two jobs on one gesture because they are the same intent at two stages - "not that point" -
 * and which one applies is never ambiguous: a draft is either in progress or it is not.
 *
 * Undo proper works on COMMITTED shapes, and a polygon in progress is not one yet, so without the
 * first half one misplaced click meant restarting the ring.
 */
const onContextMenu = (event: MouseEvent) => {
    const draft = draftPolygon.value
    if (draft?.length) {
        draftPolygon.value = draft.length === 1 ? null : draft.slice(0, -1)
        return
    }

    const shape = selectedId.value ? shapeById(selectedId.value) : null
    if (!shape?.polygon || !natural.value) return

    const at = view.toNormalized(event)
    const index = shape.polygon.findIndex((point) => isNear(at, point, handleTolerance.value))
    if (index === -1) return

    const next = removePolygonPoint(shape, index)
    if (!next) {
        toast.error('A polygon needs at least three points.')
        return
    }
    replaceShape(shape.id, next)
    selectedVertex.value = null
    emit('commit')
}

/**
 * What Delete would remove right now: a vertex if one is picked, otherwise the whole shape.
 *
 * Exposed so the toolbar can SAY which, rather than offering one button whose meaning the person
 * has to infer from what they last touched.
 */
const deleteTarget = computed<'vertex' | 'shape' | null>(() => {
    if (!selectedId.value) return null
    const shape = shapeById(selectedId.value)
    if (!shape) return null
    return shape.polygon && selectedVertex.value !== null ? 'vertex' : 'shape'
})

/**
 * Delete, narrowed to a vertex when one is picked.
 *
 * The refusal below three points is a message rather than a silent no-op, because three is what the
 * server accepts and a two-point polygon would otherwise be drawn here and rejected on save.
 */
const deleteSelection = () => {
    const id = selectedId.value
    if (!id) return
    const shape = shapeById(id)
    if (!shape) return

    if (shape.polygon && selectedVertex.value !== null) {
        const next = removePolygonPoint(shape, selectedVertex.value)
        if (!next) {
            toast.error('A polygon needs at least three points.')
            return
        }
        replaceShape(id, next)
        selectedVertex.value = null
        emit('commit')
        return
    }

    shapes.value = shapes.value.filter((other) => other.id !== id)
    selectedId.value = null
    emit('commit')
}

/** Kept for the toolbar's Undo point button, which is the touch route to the same thing. */
const undoDraftPoint = () => {
    const draft = draftPolygon.value
    if (!draft?.length) return
    draftPolygon.value = draft.length === 1 ? null : draft.slice(0, -1)
}

/**
 * How close a tap has to be to count as hitting a dot or an edge, in normalized units.
 *
 * Derived from the zoom so the target is a constant number of SCREEN pixels: a fixed normalized
 * tolerance would demand a pixel-perfect tap zoomed out and swallow half the image zoomed in.
 * Bigger on a coarse pointer, because a fingertip is not a cursor.
 */
const screenTolerance = view.screenTolerance

/**
 * Two different questions, so two different queries.
 *
 * `pointer: coarse` asks what the PRIMARY input is, which is the right test for hit tolerances: an
 * iPad driven from a Magic Keyboard trackpad should get cursor-sized targets, not fingertip-sized
 * ones.
 */
const isCoarsePointer = useMediaQuery('(pointer: coarse)')

/**
 * `any-pointer: coarse` asks whether the device can be touched AT ALL, which is the right test for
 * legibility: an iPad is held at arm's length and read at arm's length whether or not a trackpad
 * happens to be attached. Being wrong here costs slightly large text on a touchscreen laptop, which
 * is the cheap direction to be wrong in.
 */
const isTouchCapable = useMediaQuery('(any-pointer: coarse)')

const closeTolerance = computed(() => screenTolerance(isCoarsePointer.value ? 22 : 10))
const handleTolerance = computed(() => screenTolerance(isCoarsePointer.value ? 18 : 8))

/**
 * Would a click right now add a vertex to the selected polygon?
 *
 * Drives the cursor as well as the behaviour, so the affordance and the action come from ONE
 * predicate. Previously an edge that would accept a node looked exactly like empty space that would
 * pan, and the only way to find out was to click.
 */
const canInsertAtCursor = computed(() => {
    if (draftPolygon.value?.length) return false
    if (props.tool !== 'select' && props.tool !== 'polygon') return false
    const shape = selectedId.value ? shapeById(selectedId.value) : null
    if (!shape?.polygon || !cursor.value) return false
    const edge = nearestEdge(shape.polygon, cursor.value)
    return Boolean(edge && edge.distance <= handleTolerance.value)
})

/**
 * What the delete tool would remove at the cursor.
 *
 * A vertex is looked for BEFORE a shape, because a vertex sits on the outline and point-in-polygon
 * is undecided exactly there - asking "which shape is this?" first would answer for the ring when
 * the intent was its corner.
 *
 * The highlight and the action read this same value, so what turns red is what goes.
 */
const deleteHover = computed<
    { kind: 'vertex'; shapeId: string; index: number } | { kind: 'shape'; shapeId: string } | null
>(() => {
    if (props.tool !== 'delete' || !cursor.value) return null
    const vertex = vertexAt(shapes.value, cursor.value, handleTolerance.value)
    if (vertex) return { kind: 'vertex', ...vertex }
    const shape = topmostAt(shapes.value, cursor.value)
    return shape ? { kind: 'shape', shapeId: shape.id } : null
})

/** Is this shape about to be removed whole? Drives the red outline. */
const isDeleteTargetShape = (shape: Shape) =>
    deleteHover.value?.kind === 'shape' && deleteHover.value.shapeId === shape.id

/** Is this vertex about to be removed? */
const isDeleteTargetVertex = (shape: Shape, index: number) =>
    deleteHover.value?.kind === 'vertex' &&
    deleteHover.value.shapeId === shape.id &&
    deleteHover.value.index === index

/**
 * Remove whatever the cursor is over. The tool's whole behaviour.
 *
 * A polygon that would drop below three points refuses with a message rather than silently, since
 * three is the least the server accepts.
 */
const deleteAtCursor = () => {
    const target = deleteHover.value
    if (!target) return
    const shape = shapeById(target.shapeId)
    if (!shape) return

    if (target.kind === 'vertex') {
        const next = removePolygonPoint(shape, target.index)
        if (!next) {
            toast.error('A polygon needs at least three points. Delete the whole shape instead.')
            return
        }
        replaceShape(shape.id, next)
    } else {
        shapes.value = shapes.value.filter((other) => other.id !== shape.id)
        if (selectedId.value === shape.id) selectedId.value = null
    }
    emit('commit')
}

/** The first dot, highlighted when a tap there would close the ring. */
const canCloseAtCursor = computed(() => {
    const draft = draftPolygon.value
    if (!draft || draft.length < 3 || !cursor.value) return false
    return isNear(cursor.value, draft[0]!, closeTolerance.value)
})

// Abandon a half-drawn polygon when the tool changes, rather than leaving points that reappear the
// next time the tool is picked.
watch(() => props.tool, cancelPolygon)

useEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') cancelPolygon()
    if (event.key === 'Enter' && draftPolygon.value) closePolygon()
})

// ---- rendering --------------------------------------------------------------------------------

// The SVG's user units are IMAGE pixels, so one unit is `scale` screen pixels. Strokes and handles
// are divided by scale to hold a constant on-screen size at any zoom - a 1px hairline that becomes
// 16px when you zoom in is not a hairline.
const px = (value: number) => value / transform.value.scale

/** A picked or about-to-be-deleted vertex is bigger, so the target you mean is the bigger one. */
const handleSize = (shape: Shape, index: number) =>
    isDeleteTargetVertex(shape, index) || index === selectedVertex.value
        ? HANDLE_DRAWN + 2
        : HANDLE_DRAWN

/**
 * The invisible square that actually catches the press.
 *
 * 44px on touch against a 12px drawn handle: a fingertip is roughly that wide, and a target the
 * size of the thing it is grabbing can only be hit by looking at where the finger is not. Drawn at
 * zero opacity rather than by enlarging the handle, so precision is unchanged and only the
 * catchment grows.
 */
const hitSize = computed(() => (isCoarsePointer.value || props.touchLayout ? TOUCH_TARGET : 18))

/**
 * Label size, in CSS pixels on screen.
 *
 * Worth being explicit about what this is NOT: it is not affected by the zoom. `px()` divides by
 * the transform scale and the SVG user unit is `scale` CSS pixels, so the two cancel and a label is
 * the same size at 13% as at 400%. A camera photo fitting at 13% therefore does not shrink the
 * text - it was always this size, and a desktop screen just made it easy to live with.
 *
 * What does change it is the device. A tablet is held further from the eye than a laptop screen,
 * and 12px over a dark microscopy field is not the same read as 12px of UI chrome on white.
 */
/**
 * Labels, positioned in viewport pixels and rendered as ORDINARY HTML.
 *
 * They used to be SVG `<text>` inside the transformed element, with the font size divided by the
 * scale to cancel it out. That is correct arithmetic and it did not survive contact with iPad
 * Safari, where the text stayed unreadable at every size we tried - the font size only reached the
 * glyphs after a viewBox mapping and a CSS transform, and something in that chain does not behave
 * the way it does on desktop.
 *
 * Positioning in screen space removes the question rather than answering it. A label is now a div
 * with a Tailwind text class: whatever it renders at is what CSS says, with no transform between
 * the two, so "fixed size" is true by construction and not by cancellation.
 */
const labelBoxes = computed(() => {
    const nat = natural.value
    if (!nat) return []
    return visibleShapes.value
        .filter((shape) => shape.label)
        .map((shape) => {
            // Anchored to the shape's top-left corner, which is where the eye looks for it.
            const at = view.toScreen({ x: shape.x, y: shape.y })
            const confidence = props.seeded?.[shape.id]
            return {
                id: shape.id,
                label: shape.label,
                // The detail the mockup carries: a seeded shape shows what the model thought, a
                // selected polygon shows its point count. Neither is worth the width on every chip
                // at once, so an unselected hand-drawn box shows nothing extra.
                detail:
                    confidence !== undefined
                        ? confidence.toFixed(2)
                        : shape.id === selectedId.value && shape.polygon
                          ? `${shape.polygon.length} pts`
                          : null,
                color: colorForShape(props.classLabels, shape) ?? '#D97706',
                x: at.x,
                y: at.y,
                shape,
            }
        })
})

const toUser = (point: Point) => ({
    x: point.x * (natural.value?.w ?? 1),
    y: point.y * (natural.value?.h ?? 1),
})

const polygonPoints = (points: Point[]) =>
    points
        .map((p) => {
            const u = toUser(p)
            return `${u.x},${u.y}`
        })
        .join(' ')

const shapeRect = (shape: Shape) => ({
    x: shape.x * (natural.value?.w ?? 1),
    y: shape.y * (natural.value?.h ?? 1),
    width: shape.w * (natural.value?.w ?? 1),
    height: shape.h * (natural.value?.h ?? 1),
})

/**
 * The colour class for a shape, as a Tailwind TEXT class consumed via `currentColor`.
 *
 * Colours come from the annotator's OWN class palette (`annotationClasses`), assigned by position
 * in the class list, not from the app-wide `colorForLabel` that McAnnotatedImage and McConfidenceBar
 * share. Adopting that one would have restyled /image-detection and grading, which this rebuild was
 * not asked to touch.
 *
 * Two states are not label colours and should not be: the selection is always primary so it is
 * findable, and an UNLABELLED shape is amber, because a region nobody has named yet is unfinished
 * work rather than a category.
 */
/**
 * The colour a shape paints in, as a CSS value rather than a class.
 *
 * Class colours are assigned by position in the class list, so they cannot be Tailwind utilities -
 * a class built by concatenation is never emitted, and the palette is data. Two states override the
 * class colour because they say something more urgent: about to be deleted, and selected.
 */
const strokeFor = (shape: Shape): string => {
    if (isDeleteTargetShape(shape)) return '#dc2626'
    if (shape.id === selectedId.value) return '#0E9384'
    return colorForShape(props.classLabels, shape) ?? '#D97706'
}

/** Hidden shapes are not drawn, and must not be hit-testable either. */
const visibleShapes = computed(() => shapes.value.filter((shape) => !props.hiddenIds.has(shape.id)))

defineExpose({
    zoomIn: () => view.zoomStep(1.25),
    zoomOut: () => view.zoomStep(1 / 1.25),
    fit: view.fit,
    actualSize: view.actualSize,
    closePolygon,
    cancelDraft: cancelPolygon,
    undoDraftPoint,
    deleteSelection,
    deleteTarget,
    hasDraft: computed(() => (draftPolygon.value?.length ?? 0) > 0),
    transform,
    /** Natural pixel size, for the image card. Undefined until the picture has loaded. */
    natural,
    /** So the zoom readout can say "Fit 13%" rather than a bare percentage that reads as a bug. */
    fitScale: view.fitAt,
    /** Already a tolerance-compared boolean; the page should not re-derive it. */
    atFit: view.atFit,
    ready,
})
</script>

<template>
    <div
        ref="container"
        class="tw:absolute tw:inset-0 tw:touch-none tw:overflow-hidden tw:select-none"
        :class="
            !src
                ? ''
                : spacePanning
                  ? gesture.kind === 'pan'
                      ? 'tw:cursor-grabbing'
                      : 'tw:cursor-grab'
                  : tool === 'delete'
                    ? deleteHover
                        ? 'tw:cursor-pointer'
                        : gesture.kind === 'pan'
                          ? 'tw:cursor-grabbing'
                          : 'tw:cursor-crosshair'
                    : canInsertAtCursor
                      ? 'tw:cursor-copy'
                      : tool === 'select'
                        ? gesture.kind === 'pan'
                            ? 'tw:cursor-grabbing'
                            : 'tw:cursor-grab'
                        : 'tw:cursor-crosshair'
        "
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="cursor = null"
        @dblclick.prevent="closePolygon"
        @contextmenu.prevent="onContextMenu"
    >
        <template v-if="src">
            <!-- `left` is half the VISIBLE width, not half the element: with the panel open those
                 are different numbers, and every piece of the arithmetic uses the former. -->
            <div
                class="tw:absolute tw:top-1/2 tw:origin-center"
                :style="{
                    width: `${(natural?.w ?? 0) * transform.scale}px`,
                    height: `${(natural?.h ?? 0) * transform.scale}px`,
                    left: `${viewport.w / 2}px`,
                    transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px))`,
                }"
            >
                <img
                    :src="src"
                    alt=""
                    class="tw:block tw:h-full tw:w-full tw:select-none"
                    draggable="false"
                    @load="onLoad"
                    @error="onError"
                    @dragstart.prevent
                />

                <svg
                    v-if="natural"
                    class="tw:absolute tw:inset-0 tw:h-full tw:w-full"
                    :viewBox="`0 0 ${natural.w} ${natural.h}`"
                    preserveAspectRatio="none"
                >
                    <g v-for="shape in visibleShapes" :key="shape.id">
                        <polygon
                            v-if="shape.polygon"
                            :points="polygonPoints(shape.polygon)"
                            :fill="strokeFor(shape)"
                            fill-opacity="0.18"
                            :stroke="strokeFor(shape)"
                            :stroke-width="px(shape.id === selectedId ? 3 : 2)"
                            stroke-linejoin="round"
                        />
                        <rect
                            v-else
                            v-bind="shapeRect(shape)"
                            :fill="strokeFor(shape)"
                            fill-opacity="0.18"
                            :stroke="strokeFor(shape)"
                            :stroke-width="px(shape.id === selectedId ? 3 : 2)"
                        />

                        <!-- The vertex a click would create. The cursor says a node can be
                             added; this says exactly where, which matters on a curve where the
                             nearest edge is not always the one you assumed. -->
                        <circle
                            v-if="canInsertAtCursor && cursor && shape.id === selectedId"
                            :cx="cursor.x * natural.w"
                            :cy="cursor.y * natural.h"
                            :r="px(5)"
                            fill="#249486"
                            fill-opacity="0.5"
                            stroke="#fff"
                            :stroke-width="px(1.5)"
                            class="tw:pointer-events-none"
                        />

                        <!-- Handles only on the selection, and only for the geometry that has
                             them: a rectangle resizes by corners, a polygon by vertices. Squares
                             rather than dots - a grab target reads as a square - white with the
                             class colour as its border so it shows on a pale field. -->
                        <template v-if="shape.id === selectedId && !shape.polygon">
                            <rect
                                v-for="corner in CORNERS"
                                :key="corner"
                                :x="cornerPoint(shape, corner).x * natural.w - px(4)"
                                :y="cornerPoint(shape, corner).y * natural.h - px(4)"
                                :width="px(8)"
                                :height="px(8)"
                                fill="#fff"
                                :stroke="strokeFor(shape)"
                                :stroke-width="px(2)"
                                class="tw:pointer-events-none"
                            />
                            <!-- The catchment: invisible and finger-sized. The square above is
                                 what you see, this is what you hit. -->
                            <rect
                                v-for="corner in CORNERS"
                                :key="`hit-${corner}`"
                                :x="cornerPoint(shape, corner).x * natural.w - px(hitSize / 2)"
                                :y="cornerPoint(shape, corner).y * natural.h - px(hitSize / 2)"
                                :width="px(hitSize)"
                                :height="px(hitSize)"
                                fill="transparent"
                                class="tw:cursor-nwse-resize"
                                @pointerdown="startResize($event, shape.id, corner)"
                            />
                        </template>
                        <!-- Vertices show for the selected polygon, and for EVERY polygon while
                             the delete tool is armed: a node you cannot see is a node you cannot
                             aim at. -->
                        <template
                            v-if="(shape.id === selectedId || tool === 'delete') && shape.polygon"
                        >
                            <!-- Squares, not dots: a vertex handle is a grab target and a square
                                 reads as one. White with the class colour as its border, so it is
                                 visible on a pale field and still tied to its shape. -->
                            <rect
                                v-for="(point, index) in shape.polygon"
                                :key="index"
                                :x="point.x * natural.w - px(handleSize(shape, index) / 2)"
                                :y="point.y * natural.h - px(handleSize(shape, index) / 2)"
                                :width="px(handleSize(shape, index))"
                                :height="px(handleSize(shape, index))"
                                :fill="
                                    isDeleteTargetVertex(shape, index)
                                        ? '#dc2626'
                                        : index === selectedVertex
                                          ? '#0E9384'
                                          : '#fff'
                                "
                                :stroke="
                                    isDeleteTargetVertex(shape, index) || index === selectedVertex
                                        ? '#fff'
                                        : strokeFor(shape)
                                "
                                :stroke-width="px(2)"
                                class="tw:pointer-events-none"
                            />
                            <rect
                                v-for="(point, index) in shape.polygon"
                                :key="`hit-${index}`"
                                :x="point.x * natural.w - px(hitSize / 2)"
                                :y="point.y * natural.h - px(hitSize / 2)"
                                :width="px(hitSize)"
                                :height="px(hitSize)"
                                fill="transparent"
                                :class="tool === 'delete' ? 'tw:cursor-pointer' : 'tw:cursor-move'"
                                @pointerdown="
                                    tool === 'delete'
                                        ? undefined
                                        : startVertex($event, shape.id, index)
                                "
                            />
                        </template>
                    </g>

                    <!-- The polygon in progress: an open path plus its vertices, so it is obvious
                         it is unfinished and obvious where the next click continues from. -->
                    <g v-if="draftPolygon?.length">
                        <!-- The committed part of the ring: solid, because those points are
                             placed. -->
                        <polyline
                            :points="polygonPoints(draftPolygon)"
                            fill="none"
                            stroke="#249486"
                            :stroke-width="px(2)"
                            stroke-linejoin="round"
                        />

                        <!--
                            The rubber band: last placed point to the cursor, dashed because it is
                            a preview rather than an edge. Without it, placing a point is aiming at
                            nothing - you cannot see the segment you are about to create until
                            after you have created it.
                        -->
                        <line
                            v-if="cursor"
                            :x1="draftPolygon[draftPolygon.length - 1]!.x * natural.w"
                            :y1="draftPolygon[draftPolygon.length - 1]!.y * natural.h"
                            :x2="(canCloseAtCursor ? draftPolygon[0]!.x : cursor.x) * natural.w"
                            :y2="(canCloseAtCursor ? draftPolygon[0]!.y : cursor.y) * natural.h"
                            stroke="#249486"
                            :stroke-width="px(2)"
                            :style="{ strokeDasharray: `${px(6)} ${px(4)}` }"
                        />
                        <!-- The closing edge, previewed only while a click would actually close. -->
                        <line
                            v-if="canCloseAtCursor && draftPolygon.length >= 3"
                            :x1="draftPolygon[0]!.x * natural.w"
                            :y1="draftPolygon[0]!.y * natural.h"
                            :x2="draftPolygon[draftPolygon.length - 1]!.x * natural.w"
                            :y2="draftPolygon[draftPolygon.length - 1]!.y * natural.h"
                            stroke="#249486"
                            :stroke-width="px(2)"
                            :style="{ strokeDasharray: `${px(6)} ${px(4)}` }"
                        />

                        <circle
                            v-for="(point, index) in draftPolygon"
                            :key="index"
                            :cx="point.x * natural.w"
                            :cy="point.y * natural.h"
                            :r="index === 0 && canCloseAtCursor ? px(7) : px(4)"
                            :fill="index === 0 && canCloseAtCursor ? '#fff' : '#249486'"
                            :stroke="index === 0 && canCloseAtCursor ? '#249486' : 'none'"
                            :stroke-width="px(2)"
                        />
                    </g>
                </svg>
            </div>

            <!--
                Labels, OUTSIDE the transformed wrapper on purpose.

                Positioned in viewport pixels from `toScreenPoint`, so the transform moves them but
                never scales them. `tw:text-base` on touch and `tw:text-xs` with a mouse are plain
                CSS sizes that nothing rescales - which is the entire reason these are divs rather
                than SVG text.
            -->
            <div
                v-for="entry in labelBoxes"
                :key="entry.id"
                class="tw:pointer-events-none tw:absolute tw:z-[5] tw:flex tw:max-w-[40%] tw:items-center tw:gap-1 tw:rounded tw:px-1.5 tw:py-0.5 tw:font-semibold tw:whitespace-nowrap tw:text-white tw:shadow-sm"
                :class="isTouchCapable ? 'tw:text-sm' : 'tw:text-xs'"
                :style="{
                    left: `${entry.x}px`,
                    top: `${entry.y}px`,
                    // Pinned OUTSIDE the shape's top edge, so a chip never covers the thing it
                    // names. Solid class colour, which is what ties it to its outline at a glance.
                    transform: 'translateY(-100%)',
                    background: entry.color,
                }"
            >
                <span class="tw:truncate">{{ entry.label }}</span>
                <span v-if="entry.detail" class="tw:font-mono tw:font-normal tw:opacity-80">
                    {{ entry.detail }}
                </span>
            </div>

            <!--
                The draft controls, and they are not a convenience: on a touch device there is no
                right-click and no Escape key, so without these a polygon can be started and then
                neither corrected nor abandoned. The keyboard and mouse gestures still work and are
                named in the tooltips, but they are shortcuts rather than the only way in.
            -->
            <div
                v-if="draftPolygon?.length"
                class="tw:absolute tw:top-2 tw:flex tw:-translate-x-1/2 tw:items-center tw:gap-2 tw:rounded tw:bg-an-overlay/95 tw:px-2 tw:py-1.5 tw:text-xs tw:text-white"
                :style="{ left: `${viewport.w / 2}px` }"
            >
                <span>{{ draftPolygon.length }} point(s)</span>
                <button
                    type="button"
                    class="tw:rounded tw:bg-white/15 tw:px-2 tw:py-0.5 tw:hover:bg-white/25 tw:disabled:opacity-40"
                    :disabled="draftPolygon.length < 3"
                    title="Close the ring (or tap the first dot, double-click, or press Enter)"
                    @pointerdown.stop
                    @click.stop="closePolygon"
                >
                    Close
                </button>
                <button
                    type="button"
                    class="tw:rounded tw:bg-white/15 tw:px-2 tw:py-0.5 tw:hover:bg-white/25"
                    title="Remove the last point (or right-click). Right-click a vertex of a finished polygon to remove that one."
                    @pointerdown.stop
                    @click.stop="undoDraftPoint"
                >
                    Undo point
                </button>
                <button
                    type="button"
                    class="tw:rounded tw:bg-white/15 tw:px-2 tw:py-0.5 tw:hover:bg-white/25"
                    title="Discard this polygon (or press Escape)"
                    @pointerdown.stop
                    @click.stop="cancelPolygon"
                >
                    Cancel
                </button>
            </div>

            <!-- Offset up-left of the touch point, because the finger is on the spot itself. -->
            <div
                v-if="loupe && natural && src"
                class="tw:pointer-events-none tw:absolute tw:z-20 tw:overflow-hidden tw:rounded-full tw:border-2 tw:border-white/70 tw:bg-an-canvas tw:shadow-lg"
                :style="{
                    width: `${LOUPE_SIZE}px`,
                    height: `${LOUPE_SIZE}px`,
                    left: `${view.toScreen(loupe).x - LOUPE_SIZE - 12}px`,
                    top: `${view.toScreen(loupe).y - LOUPE_SIZE - 12}px`,
                }"
            >
                <img
                    :src="src"
                    alt=""
                    class="tw:max-w-none tw:origin-top-left"
                    :style="loupeStyle"
                />
                <svg
                    :width="LOUPE_SIZE"
                    :height="LOUPE_SIZE"
                    class="tw:absolute tw:inset-0"
                    :viewBox="`0 0 ${LOUPE_SIZE} ${LOUPE_SIZE}`"
                >
                    <path
                        :d="`M${LOUPE_SIZE / 2} 40v32M40 ${LOUPE_SIZE / 2}h32`"
                        stroke="rgba(255,255,255,0.75)"
                        stroke-width="1.5"
                    />
                    <circle
                        :cx="LOUPE_SIZE / 2"
                        :cy="LOUPE_SIZE / 2"
                        r="7"
                        fill="none"
                        stroke="#0E9384"
                        stroke-width="3"
                    />
                </svg>
            </div>

            <div
                v-if="cursor"
                class="tw:pointer-events-none tw:absolute tw:right-2 tw:bottom-2 tw:rounded tw:bg-black/60 tw:px-2 tw:py-1 tw:font-mono tw:text-[10px] tw:text-white/80"
            >
                {{ cursor.x.toFixed(3) }}, {{ cursor.y.toFixed(3) }}
            </div>
        </template>

        <div
            v-else
            class="tw:flex tw:h-full tw:w-full tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:text-an-d-disabled"
        >
            <Images class="tw:h-6 tw:w-6" />
            <p class="tw:text-sm">Pick an image from the queue to start annotating.</p>
        </div>

        <!-- Over the picture rather than instead of it, so a slow decode does not blank a canvas
             the person is already looking at. -->
        <div
            v-if="loadState === 'loading'"
            class="tw:absolute tw:inset-0 tw:z-20 tw:flex tw:items-center tw:justify-center tw:bg-an-canvas"
        >
            <Loader2 class="tw:h-6 tw:w-6 tw:animate-spin tw:text-an-d-icon" />
        </div>

        <div
            v-else-if="loadState === 'failed'"
            class="tw:absolute tw:inset-0 tw:z-20 tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:bg-an-canvas tw:px-8 tw:text-center"
        >
            <ImageOff class="tw:h-6 tw:w-6 tw:text-an-d-disabled" />
            <p class="tw:text-sm tw:text-an-d-text">{{ failureLabel }}</p>
            <McButton variant="outline" size="sm" @click="emitRetry">Retry</McButton>
            <p class="tw:max-w-full tw:truncate tw:font-mono tw:text-[10px] tw:text-an-d-disabled">
                {{ src }}
            </p>
        </div>
    </div>
</template>
