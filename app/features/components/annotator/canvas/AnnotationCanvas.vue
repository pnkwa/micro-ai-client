<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { Images, ImageOff, Loader2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { colorForShape } from '~/core/helpers/annotationClasses'
import AnnotationOverlay from '~/features/components/shared/AnnotationOverlay.vue'
import { useCanvasViewport } from '~/core/composables/useCanvasViewport'
import {
    CORNERS,
    bboxOfPolygon,
    clampPoint,
    cornerPoint,
    edgeAt,
    insertPointOnEdge,
    isDegenerate,
    isNear,
    nearestEdge,
    polygonSelfIntersects,
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
import { enforceMinSpacing, simplifyPath, smoothClosedPath } from '~/core/helpers/pathSimplify'
import type { AnnotationLabel } from '~/services/annotationLabelService'
// Imported explicitly rather than left to `imports.dirs: ['core/**']`, like every other helper this
// file uses. Auto-import resolves at BUILD time: a helper added while the dev server is running is
// typed (so typecheck passes) but undefined at runtime, which is exactly how the whole pointer
// pipeline came to throw `pointerDraws is not defined` on every press while every check stayed green.
import {
    HANDLE_DRAWN,
    TOUCH_TARGET,
    isTouchPointer,
    pointerDraws,
} from '~/core/helpers/annotatorHotkeys'

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
export type Tool = 'select' | 'rectangle' | 'polygon' | 'pencil' | 'delete'

const props = withDefaults(
    defineProps<{
        src: string | null
        tool: Tool
        /** What `expert_curated` starts as on a newly drawn shape. See the page for who gets true. */
        defaultCurated: boolean
        /** The caller's own label rows. Each shape's colour is looked up here by its `labelId`. */
        palette: AnnotationLabel[]
        /** Shapes the labels panel has hidden. Not drawn, and not hit-testable while hidden. */
        hiddenIds: Set<string>
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

const emit = defineEmits<{
    commit: []
    retry: []
    undo: []
    /**
     * A class typed onto the shape's own chip.
     *
     * The page handles it rather than this component writing the label directly, because naming a
     * class is two facts: what this shape is, and that the class now exists. Only the page owns the
     * class list, and a label written here alone would render amber until something else happened
     * to fold it in.
     */
    'label-shape': [id: string, label: string]
}>()

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
 * Naming a shape without leaving the picture.
 *
 * The chip over a box is where the eye already is when you decide what the thing is, so it is also
 * where the name should be typeable. Only the SELECTED shape's chip accepts a pointer - every other
 * chip stays inert, because a chip that swallows clicks is a hole in the drawing surface, and a
 * field opens under the tool the moment you drew a box.
 */
const editingId = ref<string | null>(null)
const draftLabel = ref('')

const startEditing = (shape: Shape) => {
    if (shape.id !== selectedId.value) return
    editingId.value = shape.id
    draftLabel.value = shape.label
    // Focused after the input exists. A `ref` inside a v-for would have to be an array keyed by
    // shape, and there is only ever one field open.
    void nextTick(() => {
        const field = container.value?.querySelector<HTMLInputElement>('[data-label-input]')
        field?.focus()
        field?.select()
    })
}

const stopEditing = () => {
    editingId.value = null
    draftLabel.value = ''
}

const commitLabel = () => {
    const id = editingId.value
    if (!id) return
    const label = draftLabel.value.trim()
    stopEditing()
    // A blank is a cancel, not a way to unname a shape: clearing a class is what the labels panel
    // and the delete tool are for, and an empty chip would look like the edit simply failed.
    if (label) emit('label-shape', id, label)
}

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
// Takes a bare pair rather than the event, because a trace has to start from where the finger went
// DOWN, and by the time it is known to be a trace that event is gone.
const normalized = (event: { clientX: number; clientY: number }): Point => view.toNormalized(event)

/**
 * The wheel SCROLLS the picture, on both axes. Zoom is the modified gesture.
 *
 * Scrolling is what lets the picture be moved without leaving the tool being drawn with, and it is
 * the reading every other viewer takes. The alternatives both cost the drawing hand something: a
 * trip to the select tool abandons a ring in progress, and holding Space means holding a key with
 * the hand that is holding the pencil.
 *
 * Ctrl/Cmd zooms, which is the convention everywhere and also how a trackpad PINCH arrives: the
 * browser synthesises a wheel event with `ctrlKey` set rather than exposing a gesture of its own,
 * so one branch serves both without a separate listener.
 *
 * Shift means horizontal, for a mouse with only one axis. Platforms disagree about whether it
 * arrives already transposed onto `deltaX` or left on `deltaY` with the modifier set, so both
 * readings are accepted.
 */
const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
        view.zoomAtCursor(event, event.deltaY)
        return
    }
    const x = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX
    const y = event.shiftKey ? 0 : event.deltaY
    // Negated: scrolling down moves the VIEWPORT down, which moves the picture up.
    view.pan({ x: -x, y: -y })
}

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
/** Where the two fingers were centred last frame, which is what a two-finger pan moves by. */
let lastMid: { x: number; y: number } | null = null
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

/**
 * AIMING: press, hold, then drag to place a polygon point exactly.
 *
 * A tap places a point wherever the finger lifts, which is fine for a rough outline and hopeless
 * for a cell wall: the fingertip covers the very thing it is aiming at. Holding for a third of a
 * second switches the finger from panning to aiming - the loupe opens, a crosshair follows, and the
 * point lands when the finger lifts, so you can see what you are doing before committing to it.
 *
 * A HOLD rather than making every drag aim, because the one-finger drag has to stay panning: a ring
 * is placed tap by tap and the picture must be able to move under a half-finished one. Below the
 * hold, nothing changes; past it, panning is suspended until release.
 */
const AIM_HOLD_MS = 350
const aiming = ref<Point | null>(null)
let aimTimer: ReturnType<typeof setTimeout> | null = null

/**
 * TRACING: drag a finger around the thing and let go.
 *
 * Tap by tap is precise and slow, and a cell wall is not a polygon anyone wants to tap out twelve
 * times on a phone. Dragging draws the outline directly, which is the gesture this domain actually
 * wants: the shapes are organic, and a finger following a membrane is doing exactly what the eye
 * is doing.
 *
 * It takes the one-finger drag ONLY when no ring is in progress. Once points have been placed by
 * hand the drag goes back to panning, because a half-built ring has to be able to move under the
 * finger. Two fingers pan either way, which is the escape hatch that makes taking the drag safe.
 *
 * The raw path is thinned on release (`simplifyPath`): a drag emits hundreds of points, and a
 * polygon with hundreds of vertices is one nobody can adjust afterwards.
 */
/**
 * ERASING BY DRAG, on touch.
 *
 * The erase tool paints its target red before removing it, which is the whole safety of the tool -
 * and on a phone that guarantee was hollow: with no hover, the first time anything turned red was
 * the frame it was deleted in, under a fingertip that was covering it.
 *
 * So a press on a target starts an erase rather than committing one. The target follows the finger,
 * the loupe opens over it, and the release removes whatever is red at that moment. Sliding off
 * every shape and letting go deletes nothing, which is the way out.
 */
const erasing = ref(false)

const tracing = ref<Point[] | null>(null)
/** Screen pixels between recorded points. Below this a slow hand records the same spot twice, and
 *  a little higher than the old floor so a stylus's micro-jitter is not sampled as detail. */
const TRACE_STEP = 4
/** Trace smoothing (pencil and the polygon tool's drag). Coarse-simplify to shed jitter vertices,
 *  round the closed ring with Chaikin, then re-simplify tightly to keep it editable. Screen px. */
const TRACE_COARSE_PX = 3.5
const TRACE_SMOOTH_ITERATIONS = 2
const TRACE_FINE_PX = 1.2
/** Minimum node spacing, PROPORTIONAL to the drawing's size (a fraction of its bounding-box
 *  diagonal) so a small shape keeps its nodes close and only a large one spaces them out. Bounded
 *  by a floor, so a tiny scribble is not left with nodes on top of each other, and a cap, so a
 *  full-image outline is not decimated to a few corners. All normalised units. */
const TRACE_MIN_NODE_FRACTION = 0.04
const TRACE_MIN_NODE_FLOOR = 0.006
const TRACE_MIN_NODE_CAP = 0.05

const cancelAim = () => {
    if (aimTimer) clearTimeout(aimTimer)
    aimTimer = null
}

/**
 * One point, from a tap or from the end of an aim.
 *
 * Tapping the first dot closes the ring, the gesture every other polygon tool uses. Three points
 * minimum, because that is the least the server accepts.
 */
const placePolygonPoint = (at: Point) => {
    const draft = draftPolygon.value
    if (draft && draft.length >= 3 && isNear(at, draft[0]!, closeTolerance.value)) closePolygon()
    else draftPolygon.value = [...(draft ?? []), clampPoint(at)]
}

const abandonPinch = () => {
    // A second finger during any other gesture cancels it rather than blending with it: a box being
    // resized while the canvas zooms under it ends up somewhere nobody asked for.
    //
    // A box being DRAWN has to be taken back with it. Now that a finger draws rectangles, the first
    // finger has already pushed a shape by the time the second lands, and the pinch path returns
    // before the release ever reaches the degenerate-shape sweep - so without this a two-finger
    // zoom that started on the canvas leaves a phantom row in the shape list and in undo.
    const g = gesture.value
    if (g.kind === 'draw') {
        shapes.value = shapes.value.filter((shape) => shape.id !== g.id)
        if (selectedId.value === g.id) selectedId.value = null
    }
    // A trace, an aim and an erase all belong to one finger, so a second one abandons them.
    tracing.value = null
    aiming.value = null
    erasing.value = false
    cancelAim()
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
        lastMid = pinchMidpoint()
        abandonPinch()
        return
    }
    if (active.size > 2 || event.button !== 0) return

    const at = normalized(event)
    tapOrigin = { x: event.clientX, y: event.clientY }
    // A finger has no hover, so nothing has moved the cursor yet: without this the erase tool asks
    // "what is under the cursor" and gets wherever the LAST pointer event happened to be.
    cursor.value = at

    // Ahead of every tool: a held Space means "move the picture", whatever is armed.
    if (props.spacePanning) {
        gesture.value = { kind: 'pan', last: { x: event.clientX, y: event.clientY } }
        return
    }

    /*
     * The pencil tool TRACES. A drag with any pointer records an outline that is thinned into a
     * polygon on release (the same trace the polygon tool offers a finger, made the whole tool).
     *
     * Deliberately the drawing route that works with an Apple Pencil: iPadOS reports the pencil as
     * an ordinary touch, so placing points one tap at a time inherited the finger's hold-to-aim and
     * was unusable, but a continuous drag is a gesture a mouse, a finger and a stylus all make
     * identically. Two fingers still pinch (handled above), so the picture is reachable mid-drawing.
     */
    if (props.tool === 'pencil') {
        tracing.value = [at]
        gesture.value = { kind: 'none' }
        return
    }

    /*
     * A FINGER PANS, unless the rectangle tool is armed.
     *
     * A finger covers the thing it is placing, so a drag that draws means every attempt to move the
     * picture adds geometry instead - which is why panning keeps the one-finger drag for select,
     * for polygon (a ring is placed tap by tap and the picture still has to move under it) and for
     * delete. A rectangle has no second gesture: it is a drag or it is nothing, so under that tool
     * the finger draws and two fingers navigate.
     *
     * A tap is meaningful either way - it selects, or places a polygon point - and that is handled
     * on release, where a tap can be told from the start of a pan.
     */
    if (!pointerDraws(event.pointerType, props.tool)) {
        gesture.value = { kind: 'pan', last: { x: event.clientX, y: event.clientY } }
        // Only the polygon tool aims: it is the one that places a point at an exact spot, and the
        // one where the finger is directly on top of the thing being aimed at.
        if (props.tool === 'polygon' && isTouchPointer(event.pointerType)) {
            cancelAim()
            aimTimer = setTimeout(() => {
                aimTimer = null
                aiming.value = at
                // Aiming replaces the pan it grew out of, so the picture holds still while the
                // crosshair is being placed.
                gesture.value = { kind: 'none' }
            }, AIM_HOLD_MS)
        }
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
        if (deleteHover.value) erasing.value = isTouchPointer(event.pointerType)
        else gesture.value = { kind: 'pan', last: { x: event.clientX, y: event.clientY } }
        return
    }

    if (props.tool === 'rectangle') {
        const id = newId()
        shapes.value.push({
            id,
            // Unnamed on purpose: you draw the region, then name it on its own chip. The picked
            // class no longer leaks into new geometry, so a shape is never labelled by something
            // you set several images ago and forgot about.
            label: '',
            labelId: null,
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
        isTouchPointer(event.pointerType) &&
        // Aiming included, which is what makes the FIRST point of a ring placeable: before this the
        // loupe only opened once a draft existed, so the one point with nothing to line up against
        // was also the one point placed blind.
        (aiming.value ||
            erasing.value ||
            g0.kind === 'vertex' ||
            g0.kind === 'move' ||
            draftPolygon.value?.length)
            ? view.toNormalized(event)
            : null
    if (active.has(event.pointerId)) {
        active.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }

    // Zoom only while two fingers are down. Panning as well would make the image lurch on the frame
    // a pinch usually ends with, when one finger lifts a moment before the other.
    if (active.size >= 2) {
        /*
         * TWO FINGERS PAN AS WELL AS ZOOM.
         *
         * They only zoomed before, and that was defensible while one finger always panned. It is
         * not now: with the polygon tool the one-finger drag traces, so without this there is no
         * way to move the picture while outlining, and the lurch this was avoiding - one finger
         * lifting a frame before the other - cannot happen, because the branch stops the moment
         * fewer than two are down.
         */
        const mid = pinchMidpoint()
        if (lastMid) view.pan({ x: mid.x - lastMid.x, y: mid.y - lastMid.y })
        lastMid = mid

        if (pinchStart && pinchStart.dist > 0) {
            // How far the fingers travelled relative to each other, so a two-finger TAP (no
            // travel) can be told from a pinch when they lift.
            pinchTravel = Math.max(pinchTravel, Math.abs(pointerDistance() - pinchStart.dist))
            // Slightly more than the fingers actually travelled. A 1:1 ratio is honest and feels
            // stiff, because the span a thumb and forefinger can cover on a held tablet is a good
            // deal smaller than the zoom range being asked for. The exponent is applied to the
            // RATIO rather than to the distance, so 1 is still 1: pinching back to where the
            // fingers started returns the exact scale it started at.
            const target = pinchStart.scale * Math.pow(pointerDistance() / pinchStart.dist, 1.3)
            view.zoomAtPoint(pinchMidpoint(), target / transform.value.scale)
        }
        return
    }

    const at = normalized(event)
    cursor.value = at
    const g = gesture.value

    // Past the hold: the crosshair follows the finger and nothing else moves.
    if (aiming.value) {
        aiming.value = at
        return
    }
    // Before it: travel means this was a drag rather than a hold, so the aim is called off - and
    // with the polygon tool on an empty canvas, that drag becomes a trace.
    if (aimTimer && tapOrigin) {
        const travelled = Math.hypot(event.clientX - tapOrigin.x, event.clientY - tapOrigin.y)
        if (travelled > TAP_SLOP) {
            cancelAim()
            if (!draftPolygon.value?.length) {
                tracing.value = [normalized({ clientX: tapOrigin.x, clientY: tapOrigin.y }), at]
                // The trace owns the gesture from here, so the picture stops panning under it.
                gesture.value = { kind: 'none' }
            }
        }
    }

    if (tracing.value) {
        const path = tracing.value
        const previous = view.toScreen(path[path.length - 1]!)
        const local = view.localPoint(event)
        // One point every few pixels: a finger held still would otherwise record the same spot
        // hundreds of times and hand the simplifier a pile of duplicates.
        if (Math.hypot(local.x - previous.x, local.y - previous.y) >= TRACE_STEP) {
            path.push(clampPoint(at))
        }
        return
    }

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
    cancelAim()

    // A trace becomes a ring, thinned to the points that carry its shape.
    if (tracing.value) {
        const path = tracing.value
        tracing.value = null
        gesture.value = { kind: 'none' }
        tapOrigin = null
        // Shed the hand's jitter, round the outline, then thin it back to an editable ring.
        // Tolerances are normalised from screen distances, so a trace at 400% zoom keeps the detail
        // the zoom was for and one at fit is not left with a hundred points nobody can edit.
        //  1. a coarse simplify drops the wobble RDP would otherwise keep as little angular vertices;
        //  2. Chaikin rounds every corner of the CLOSED ring, so the edges - and the start-end
        //     terminal, which used to close as a hard chord - come out smooth;
        //  3. a fine simplify collapses the runs Chaikin adds, keeping the vertex count adjustable;
        //  4. a min-spacing pass drops any node crowding the one before it, at a distance scaled to
        //     the drawing's size so a small shape keeps closer nodes than a large one.
        const coarse = simplifyPath(path, screenTolerance(TRACE_COARSE_PX))
        // Under three points there is no polygon: a stray flick lands here and is dropped rather
        // than leaving a sliver on the picture.
        if (coarse.length >= 3) {
            const smoothed = simplifyPath(
                smoothClosedPath(coarse, TRACE_SMOOTH_ITERATIONS),
                screenTolerance(TRACE_FINE_PX),
            )
            // Spacing proportional to the outline's own diagonal, so it is closer on a small trace
            // and wider on a large one, clamped so neither extreme runs away.
            const bbox = bboxOfPolygon(smoothed)
            const minNodeDist = Math.min(
                TRACE_MIN_NODE_CAP,
                Math.max(
                    TRACE_MIN_NODE_FLOOR,
                    TRACE_MIN_NODE_FRACTION * Math.hypot(bbox.w, bbox.h),
                ),
            )
            const spaced = enforceMinSpacing(smoothed, minNodeDist)
            // Spacing can trim a shape smaller than the radius below a ring; drop it rather than
            // leave a stub. A trace that loops back over itself is not a simple region, so it is
            // refused rather than turned into a polygon whose area is ambiguous.
            if (spaced.length >= 3) {
                if (polygonSelfIntersects(spaced)) {
                    toast.error(
                        'That outline crosses over itself. Trace a loop that does not cross.',
                    )
                } else {
                    draftPolygon.value = spaced
                    closePolygon()
                }
            }
        }
        return
    }

    // An aim ends where the crosshair is, not where the finger is: the two are the same point, but
    // only one of them was visible while it was being chosen.
    if (aiming.value) {
        placePolygonPoint(aiming.value)
        aiming.value = null
        gesture.value = { kind: 'none' }
        tapOrigin = null
        emit('commit')
        return
    }
    if (active.size < 2) {
        pinchStart = null
        lastMid = null
    }

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
    if (isTouchPointer(event.pointerType) && wasTap(event)) {
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

    if (props.tool === 'delete' && natural.value && (wasTap(event) || erasing.value)) {
        erasing.value = false
        deleteAtCursor()
        tapOrigin = null
        endGesture()
        return
    }

    // Not while a node is being dragged. A press on a handle is captured by the handle, but the
    // release still bubbles to here, and without this a tap that merely grabbed a node would go on
    // to read the edge under it and insert a second node in the same place.
    if (
        props.tool === 'polygon' &&
        natural.value &&
        wasTap(event) &&
        gesture.value.kind !== 'vertex'
    ) {
        const at = normalized(event)

        // No ring in progress and the tap landed on a polygon's edge: add a vertex there. Starting
        // a second polygon on top of an existing one is almost never what was meant, and it is the
        // reading this tool used to take.
        const target = insertTargetAt(at)
        const onEdge = target ? shapeById(target.shapeId) : null
        if (target && onEdge) {
            const withPoint = insertPointOnEdge(onEdge, at, handleTolerance.value)
            if (withPoint) {
                replaceShape(onEdge.id, withPoint)
                selectedId.value = onEdge.id
                // The inserted vertex becomes the delete target, so a misplaced one is undone by
                // the same key that removes any other. On the next tick because selecting a shape
                // clears the vertex, and set synchronously the two assignments would race.
                void nextTick(() => (selectedVertex.value = target.index + 1))
                emit('commit')
                tapOrigin = null
                endGesture()
                return
            }
        }
        placePolygonPoint(at)
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
            // Unnamed on purpose: you draw the region, then name it on its own chip. The picked
            // class no longer leaks into new geometry, so a shape is never labelled by something
            // you set several images ago and forgot about.
            label: '',
            labelId: null,
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

const cancelPolygon = () => {
    draftPolygon.value = null
    aiming.value = null
    cancelAim()
}

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
 * Which polygon edge would a click at `point` add a vertex to, if any?
 *
 * The two tools ask different questions of it. SELECT offers only the edge of the polygon ALREADY
 * selected, because with that tool a click on an unselected shape means "select this", and taking
 * that click to grow a ring would make a polygon unreachable by its own outline. POLYGON offers any
 * polygon's edge: the tool is about ring geometry and nothing else it does needs a selection, so
 * requiring one first puts the node behind a step that is invisible from the tool that places it.
 *
 * Takes the point rather than reading `cursor` so a TAP can ask it too - on touch there is often no
 * pointermove before the release, and `cursor` would still be wherever the last one left it.
 */
const insertTargetAt = (point: Point): { shapeId: string; index: number } | null => {
    if (draftPolygon.value?.length) return null
    if (props.tool === 'polygon') return edgeAt(visibleShapes.value, point, handleTolerance.value)
    if (props.tool !== 'select') return null
    const shape = selectedId.value ? shapeById(selectedId.value) : null
    if (!shape?.polygon) return null
    const edge = nearestEdge(shape.polygon, point)
    return edge && edge.distance <= handleTolerance.value
        ? { shapeId: shape.id, index: edge.index }
        : null
}

/**
 * Would a click right now add a vertex?
 *
 * Drives the cursor as well as the behaviour, so the affordance and the action come from ONE
 * predicate. Previously an edge that would accept a node looked exactly like empty space that would
 * pan, and the only way to find out was to click.
 */
const canInsertAtCursor = computed(
    () => cursor.value !== null && insertTargetAt(cursor.value) !== null,
)

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

/**
 * Does the current tool DRAG a node, or only point at one?
 *
 * Only erase points: it removes whatever it is over, and a handle that grabbed the press would
 * swallow that. Every other tool moves the node, the POLYGON tool included - it already puts a node
 * on an edge, and a tool that adds nodes but cannot nudge one is a tool with a hole in it.
 *
 * The conflict this looks like it should have does not arise. Handles are only drawn for the
 * polygon tool while NO ring is in progress, so a point placed on top of an existing node while
 * drawing still lands on the canvas rather than grabbing what is underneath it.
 */
const vertexDragTool = computed(() => props.tool !== 'delete')

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
    // The label field owns both keys while it is open: Escape abandons the edit, Enter commits it.
    if (editingId.value) return
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
/** Screen height a chip needs above its anchor to clear the top edge; below it, the chip flips under. */
const CHIP_CLEARANCE = 26

/** A label chip may run to this multiple of its shape's on-screen width before it truncates... */
const LABEL_WIDTH_MULT = 3
/** ...but never narrower than this, so a small box still shows a few characters and an ellipsis. */
const LABEL_WIDTH_FLOOR = 56

/** A shape's width on screen, in CSS pixels, at the current zoom (polygons measured by bbox). */
const shapeWidthPx = (shape: Shape): number => {
    const xs = shape.polygon?.length ? shape.polygon.map((p) => p.x) : [shape.x, shape.x + shape.w]
    const left = view.toScreen({ x: Math.min(...xs), y: 0 }).x
    const right = view.toScreen({ x: Math.max(...xs), y: 0 }).x
    return right - left
}

/**
 * The point a shape's label hangs from.
 *
 * A rectangle keeps its top-left corner, which is a real corner of the shape. A polygon's bbox
 * top-left corner, though, is usually EMPTY SPACE - no vertex lives there - so a chip pinned to it
 * floats off the outline. The highest vertex instead always sits ON an edge, which is where the
 * name belongs.
 */
const topAnchor = (shape: Shape): Point => {
    const poly = shape.polygon
    if (!poly?.length) return { x: shape.x, y: shape.y }
    return poly.reduce((top, p) => (p.y < top.y ? p : top), poly[0]!)
}

const labelBoxes = computed(() => {
    const nat = natural.value
    if (!nat) return []
    const vw = viewport.value.w
    return visibleShapes.value
        .filter((shape) => shape.label || shape.id === selectedId.value)
        .map((shape) => {
            const at = view.toScreen(topAnchor(shape))
            const confidence = props.seeded?.[shape.id]
            return {
                id: shape.id,
                label: shape.label,
                // Centre the chip over a polygon's peak vertex (a box keeps its left-aligned
                // corner); flip it below when the peak is too near the top to clear the chip.
                center: !!shape.polygon,
                below: !!shape.polygon && at.y < CHIP_CLEARANCE,
                // A seeded shape shows what the model thought; nothing else earns the width. The
                // polygon's point count used to show here and read as a graded score, so it is gone.
                detail: confidence !== undefined ? confidence.toFixed(2) : null,
                // How wide the chip may grow: at most three times the shape's own on-screen width
                // (a floor so a tiny box still shows a few characters, and never past the old 40%
                // cap), so a long name is truncated rather than sprawling across the picture.
                maxWidth: Math.round(
                    Math.min(
                        vw * 0.4,
                        Math.max(LABEL_WIDTH_FLOOR, LABEL_WIDTH_MULT * shapeWidthPx(shape)),
                    ),
                ),
                // White when there is no class, matching the outline. The chip then needs dark
                // text, since white on white is nothing at all.
                color: colorForShape(props.palette, shape) ?? NEUTRAL,
                onWhite: !colorForShape(props.palette, shape),
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

/**
 * The colour a shape paints in, as a CSS value rather than a class.
 *
 * A class colour is AUTHORED and arrives as data on the label row (BE-ADR-038), so it can never be
 * a Tailwind utility: a class name built by concatenation is never emitted. It is also not the
 * app-wide `colorForLabel` that McAnnotatedImage and McConfidenceBar share - that one hashes a name
 * and is still right for model output, where nobody chose anything.
 *
 * Two states override the class colour because they say something more urgent: about to be deleted,
 * and selected.
 */
/** Unnamed, and the selection: white, which belongs to no class and so cannot be mistaken for one. */
const NEUTRAL = '#ffffff'

/**
 * A grey halo under any white outline.
 *
 * White alone fails on this imagery - the fields are roughly half bright, and the bright half is
 * the pale cytoplasm where the cells are - so every white line gets a casing beneath it. That is
 * the same trick as the white casing under a coloured line, inverted: the halo disappears into the
 * dark rim and separates the line from everything else.
 *
 * GREY rather than near-black. Black reads as a border in its own right, so the shape stops looking
 * like a white outline and starts looking like a black one with a white core; the neutral slate
 * carries the same separation without competing with the class colours beside it.
 */
const CASING = 'rgba(60, 67, 76, 0.55)'

/**
 * The ring in progress: white, on a BLACK casing rather than the grey one above it.
 *
 * It used to be drawn in the accent green, which made it one more coloured outline on a picture
 * already full of them - and the one colour it could never be mistaken for was the thing it needs
 * to say, that nothing here is committed yet. White says that (it is what an unnamed shape wears),
 * and black under it is the one casing no finished shape uses, so a draft is distinguishable from
 * a saved white outline at a glance rather than by counting vertices.
 *
 * The argument against black in CASING does not apply here: that halo has class colours beside it
 * to compete with. This one is drawn over the picture alone, and for a few seconds.
 */
const DRAFT_LINE = '#ffffff'
const DRAFT_CASING = 'rgba(0, 0, 0, 0.75)'

/** Casing first, line second: the same geometry painted twice, widest underneath. */
const DRAFT_LAYERS = [
    { color: DRAFT_CASING, width: 4.5 },
    { color: DRAFT_LINE, width: 2 },
] as const

const strokeFor = (shape: Shape): string => {
    if (isDeleteTargetShape(shape)) return '#dc2626'
    if (shape.id === selectedId.value) return NEUTRAL
    return colorForShape(props.palette, shape) ?? NEUTRAL
}

/**
 * The handle's own outline.
 *
 * Handles are white squares, so a white shape would give them a white border on a pale field and
 * they would disappear into it. Dark edge in that case, the shape's own colour otherwise.
 */
const handleStroke = (shape: Shape): string => {
    const stroke = strokeFor(shape)
    return stroke === NEUTRAL ? '#3c434c' : stroke
}

/** White reads on nothing bright, so anything drawn white is cased. */
const isCased = (shape: Shape): boolean => shape.id === selectedId.value || !shape.label.trim()

/**
 * The chip's type size, as a class put on EVERY text node inside it rather than on the chip.
 *
 * Font size does not inherit in this app - something sets it per element - so a size on the wrapper
 * styles the wrapper and nothing within it. The label span fell back to 16px and the input to the
 * UA's own ~13px, which is why the chip changed size the moment it was clicked. The metadata rows
 * in ImageMetaCard had the same fault.
 */
const chipText = computed(() => (isTouchCapable.value ? 'tw:text-sm' : 'tw:text-xs'))

/**
 * The field's floor: one LINE tall and one CHARACTER wide.
 *
 * The pill fits its text and is the same height whether or not it is being edited - a label is a
 * thing you click into, and growing it on click moves the target out from under the pointer aiming
 * at it. This minimum changes nothing while there is text, since the line already provides that
 * height; it exists for the empty field, whose invisible mirror has no content and would otherwise
 * collapse the typing area to nothing. The width floor is `1ch` on the wrapper for the same reason
 * and in the same spirit: the smallest thing the field could ever hold, rather than a round number
 * that would make an emptied pill wider than the label it replaced.
 */
const fieldMinH = computed(() => (isTouchCapable.value ? 'tw:min-h-5' : 'tw:min-h-4'))

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
    /** A label field is open on a chip. The page pauses auto-save while one is. */
    editingLabel: computed(() => editingId.value !== null),
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
                    <!--
                        THE SHAPES THEMSELVES ARE PAINTED BY THE SHARED OVERLAY, which the library's
                        inspector uses too. One renderer, so a box cannot look like one thing here
                        and another thing there.

                        What stays below is INTERACTION rather than display - the vertex a click
                        would add, the handles that resize and move. The callbacks carry this page's
                        own states across: a selection is thicker, a delete target is red, an
                        unnamed shape takes the casing.

                        THE CASING is a wider stroke drawn under a shape's own. These fields are
                        roughly half bright and half dark, measured across the batch, so no single
                        outline colour reads everywhere; the halo separates the line from whichever
                        it landed on without costing the shape the colour that says which class it
                        is.
                    -->
                    <AnnotationOverlay
                        :shapes="visibleShapes"
                        :natural="natural"
                        :stroke-for="strokeFor"
                        :width-for="(shape) => px(shape.id === selectedId ? 3 : 2)"
                        :cased="isCased"
                        :casing="CASING"
                        :casing-width-for="(shape) => px(shape.id === selectedId ? 6 : 5)"
                    />

                    <g v-for="shape in visibleShapes" :key="shape.id">
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
                                :stroke="handleStroke(shape)"
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
                             the erase or polygon tool is armed: a node you cannot see is a node you
                             cannot aim at, and both of those tools act on whichever polygon is
                             under the cursor rather than on the selection. Not while a ring is
                             being drawn - there the nodes that matter are the draft's own. -->
                        <template
                            v-if="
                                (shape.id === selectedId ||
                                    tool === 'delete' ||
                                    (tool === 'polygon' && !draftPolygon?.length)) &&
                                shape.polygon
                            "
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
                                        : handleStroke(shape)
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
                                :class="vertexDragTool ? 'tw:cursor-move' : 'tw:cursor-pointer'"
                                @pointerdown="
                                    vertexDragTool
                                        ? startVertex($event, shape.id, index)
                                        : undefined
                                "
                            />
                        </template>
                    </g>

                    <!-- The trace, while a finger is drawing it. Same white-on-black as the ring
                         it is about to become, so nothing changes appearance on release. -->
                    <g v-if="tracing && tracing.length > 1">
                        <polyline
                            v-for="layer in DRAFT_LAYERS"
                            :key="layer.color"
                            :points="polygonPoints(tracing)"
                            fill="none"
                            :stroke="layer.color"
                            :stroke-width="px(layer.width)"
                            stroke-linejoin="round"
                            stroke-linecap="round"
                        />
                    </g>

                    <!--
                        THE PENDING POINT, while a finger is aiming. Drawn on the picture as well as
                        magnified in the loupe: the loupe says what is under the fingertip, this
                        says where the point will land, and at a glance those are different
                        questions.
                    -->
                    <g v-if="aiming">
                        <circle
                            :cx="aiming.x * natural.w"
                            :cy="aiming.y * natural.h"
                            :r="px(9)"
                            fill="none"
                            :stroke="DRAFT_CASING"
                            :stroke-width="px(3)"
                        />
                        <circle
                            :cx="aiming.x * natural.w"
                            :cy="aiming.y * natural.h"
                            :r="px(9)"
                            fill="none"
                            :stroke="DRAFT_LINE"
                            :stroke-width="px(1.5)"
                        />
                        <circle
                            :cx="aiming.x * natural.w"
                            :cy="aiming.y * natural.h"
                            :r="px(1.5)"
                            :fill="DRAFT_LINE"
                        />
                    </g>

                    <!-- The polygon in progress: an open path plus its vertices, so it is obvious
                         it is unfinished and obvious where the next click continues from. -->
                    <g v-if="draftPolygon?.length">
                        <!-- Every segment twice, black casing then white line, so one v-for keeps
                             the two layers in step: geometry edited on one is edited on both. -->
                        <g
                            v-for="layer in DRAFT_LAYERS"
                            :key="layer.color"
                            :stroke="layer.color"
                            :stroke-width="px(layer.width)"
                            fill="none"
                        >
                            <!-- The committed part of the ring: solid, because those points are
                                 placed. -->
                            <polyline
                                :points="polygonPoints(draftPolygon)"
                                stroke-linejoin="round"
                                stroke-linecap="round"
                            />

                            <!--
                                The rubber band: last placed point to the cursor, dashed because it
                                is a preview rather than an edge. Without it, placing a point is
                                aiming at nothing - you cannot see the segment you are about to
                                create until after you have created it.
                            -->
                            <line
                                v-if="cursor"
                                :x1="draftPolygon[draftPolygon.length - 1]!.x * natural.w"
                                :y1="draftPolygon[draftPolygon.length - 1]!.y * natural.h"
                                :x2="(canCloseAtCursor ? draftPolygon[0]!.x : cursor.x) * natural.w"
                                :y2="(canCloseAtCursor ? draftPolygon[0]!.y : cursor.y) * natural.h"
                                :style="{ strokeDasharray: `${px(6)} ${px(4)}` }"
                            />
                            <!-- The closing edge, previewed only while a click would actually
                                 close. -->
                            <line
                                v-if="canCloseAtCursor && draftPolygon.length >= 3"
                                :x1="draftPolygon[0]!.x * natural.w"
                                :y1="draftPolygon[0]!.y * natural.h"
                                :x2="draftPolygon[draftPolygon.length - 1]!.x * natural.w"
                                :y2="draftPolygon[draftPolygon.length - 1]!.y * natural.h"
                                :style="{ strokeDasharray: `${px(6)} ${px(4)}` }"
                            />
                        </g>

                        <!-- The points themselves are already white-on-black, so they need no
                             second pass. The first one still swells when a click would close the
                             ring: that is the affordance, and it never depended on the colour. -->
                        <circle
                            v-for="(point, index) in draftPolygon"
                            :key="index"
                            :cx="point.x * natural.w"
                            :cy="point.y * natural.h"
                            :r="index === 0 && canCloseAtCursor ? px(7) : px(4)"
                            :fill="DRAFT_LINE"
                            :stroke="DRAFT_CASING"
                            :stroke-width="px(1.5)"
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
                class="tw:absolute tw:z-[5] tw:flex tw:max-w-[40%] tw:items-center tw:gap-1 tw:rounded tw:px-1.5 tw:py-0.5 tw:font-semibold tw:whitespace-nowrap tw:shadow-sm"
                :class="[
                    isTouchCapable ? 'tw:text-sm' : 'tw:text-xs',
                    // A white chip carries dark text and a hairline, or it is an invisible pill
                    // floating over a pale field.
                    entry.onWhite ? 'tw:text-an-text tw:ring-1 tw:ring-black/15' : 'tw:text-white',
                    // Only the selection takes a pointer. Every other chip stays inert so it can
                    // never eat a press meant for the picture underneath it.
                    entry.shape.id === selectedId
                        ? 'tw:pointer-events-auto tw:cursor-text'
                        : 'tw:pointer-events-none',
                ]"
                :style="{
                    left: `${entry.x}px`,
                    top: `${entry.y}px`,
                    // Pinned OUTSIDE the shape's top edge, so a chip never covers the thing it
                    // names. Solid class colour, which is what ties it to its outline at a glance.
                    // A polygon centres over its peak vertex, and flips below it near the top edge.
                    transform: `${entry.center ? 'translateX(-50%) ' : ''}${entry.below ? 'translateY(3px)' : 'translateY(-100%)'}`,
                    background: entry.color,
                    // Capped to a few times the shape's width so a long name truncates; lifted
                    // while editing so a name being typed is never clipped mid-word.
                    maxWidth: editingId === entry.id ? undefined : `${entry.maxWidth}px`,
                }"
                :title="entry.shape.id === selectedId ? 'Click to name this shape' : undefined"
                @pointerdown.stop
                @click.stop="startEditing(entry.shape)"
            >
                <!--
                    The field is sized by an INVISIBLE MIRROR of its own text.

                    An input carries an intrinsic width of roughly twenty characters that has
                    nothing to do with its contents, so left in flow it sets the wrapper's size and
                    the pill jumped from 31px to 139px the moment it was clicked. The input is
                    therefore taken OUT OF FLOW and the mirror alone decides the width, which makes
                    the chip identical in both states and grow only as the name is typed.

                    `v-text` rather than an interpolated child: the formatter puts a child on its
                    own line, and under `whitespace-pre` that indentation would render as real
                    space and as extra lines. There is no placeholder, so a `min-w` is what keeps
                    an empty field wide enough to aim at.
                -->
                <span
                    v-if="editingId === entry.id"
                    class="tw:relative tw:block tw:min-w-[1ch]"
                    :class="fieldMinH"
                    @pointerdown.stop
                >
                    <span
                        class="tw:invisible tw:block tw:font-semibold tw:whitespace-pre"
                        :class="chipText"
                        aria-hidden="true"
                        v-text="draftLabel"
                    ></span>
                    <input
                        v-model="draftLabel"
                        data-label-input
                        size="1"
                        class="tw:absolute tw:inset-0 tw:w-full tw:min-w-0 tw:border-0 tw:bg-transparent tw:p-0 tw:font-semibold tw:outline-none"
                        :class="[chipText, entry.onWhite ? 'tw:text-an-text' : 'tw:text-white']"
                        @keydown.enter.prevent="commitLabel"
                        @keydown.esc.prevent="stopEditing"
                        @blur="commitLabel"
                    />
                </span>
                <template v-else>
                    <span
                        class="tw:truncate"
                        :class="[chipText, entry.label ? '' : 'tw:font-normal tw:italic']"
                    >
                        {{ entry.label || 'Add class' }}
                    </span>
                    <span
                        v-if="entry.detail"
                        class="tw:font-mono tw:font-normal tw:opacity-80"
                        :class="chipText"
                    >
                        {{ entry.detail }}
                    </span>
                </template>
            </div>

            <!--
                The one line that says the fast gesture exists.

                Only before a ring is started, because that is the only moment the drag traces: once
                points are placed by hand the drag pans again, and a hint naming a gesture that is
                no longer live is worse than none.
            -->
            <div
                v-if="isTouchCapable && tool === 'polygon' && !draftPolygon?.length && !tracing"
                class="tw:pointer-events-none tw:absolute tw:top-2 tw:flex tw:-translate-x-1/2 tw:items-center tw:gap-1.5 tw:rounded-lg tw:bg-an-overlay/95 tw:px-2.5 tw:py-1.5 tw:text-[12px] tw:text-an-d-text"
                :style="{ left: `${viewport.w / 2}px` }"
            >
                Drag to trace, or tap to place points
            </div>

            <!-- The pencil tool's line: a stylus (or finger) traces, so this is the tool an Apple
                 Pencil draws with. Same placement and reason as the others. -->
            <div
                v-if="isTouchCapable && tool === 'pencil' && !tracing"
                class="tw:pointer-events-none tw:absolute tw:top-2 tw:flex tw:-translate-x-1/2 tw:items-center tw:gap-1.5 tw:rounded-lg tw:bg-an-overlay/95 tw:px-2.5 tw:py-1.5 tw:text-[12px] tw:text-an-d-text"
                :style="{ left: `${viewport.w / 2}px` }"
            >
                Drag to trace an outline
            </div>

            <!-- The erase tool's own line. Same place, same reason: there is no hint bar on a
                 stacked layout and no tooltip a finger can reach. -->
            <div
                v-if="isTouchCapable && tool === 'delete' && !erasing"
                class="tw:pointer-events-none tw:absolute tw:top-2 tw:flex tw:-translate-x-1/2 tw:items-center tw:gap-1.5 tw:rounded-lg tw:bg-an-overlay/95 tw:px-2.5 tw:py-1.5 tw:text-[12px] tw:text-an-d-text"
                :style="{ left: `${viewport.w / 2}px` }"
            >
                Press a shape or a point, then lift to erase it
            </div>

            <!--
                The draft controls, and they are not a convenience: on a touch device there is no
                right-click and no Escape key, so without these a polygon can be started and then
                neither corrected nor abandoned. The keyboard and mouse gestures still work and are
                named in the tooltips, but they are shortcuts rather than the only way in.
            -->
            <div
                v-if="draftPolygon?.length"
                class="tw:absolute tw:top-2 tw:flex tw:-translate-x-1/2 tw:items-center tw:gap-2 tw:rounded-lg tw:bg-an-overlay/95 tw:text-white"
                :class="
                    isTouchCapable
                        ? 'tw:px-2 tw:py-1 tw:text-[13px]'
                        : 'tw:px-2 tw:py-1.5 tw:text-xs'
                "
                :style="{ left: `${viewport.w / 2}px` }"
            >
                <span>{{ draftPolygon.length }} point(s)</span>
                <!-- Hold-to-aim is invisible otherwise: there is no hint bar on a stacked layout
                     and no tooltip a finger can reach, so the one place it can be said is here. -->
                <span v-if="isTouchCapable" class="tw:text-white/55">hold to aim</span>
                <button
                    type="button"
                    class="tw:rounded-md tw:bg-white/15 tw:hover:bg-white/25 tw:disabled:opacity-40"
                    :class="isTouchCapable ? 'tw:h-9 tw:px-3' : 'tw:px-2 tw:py-0.5'"
                    :disabled="draftPolygon.length < 3"
                    title="Close the ring (or tap the first dot, double-click, or press Enter)"
                    @pointerdown.stop
                    @click.stop="closePolygon"
                >
                    Close
                </button>
                <button
                    type="button"
                    class="tw:rounded-md tw:bg-white/15 tw:hover:bg-white/25"
                    :class="isTouchCapable ? 'tw:h-9 tw:px-3' : 'tw:px-2 tw:py-0.5'"
                    title="Remove the last point (or right-click). Right-click a vertex of a finished polygon to remove that one."
                    @pointerdown.stop
                    @click.stop="undoDraftPoint"
                >
                    Undo point
                </button>
                <button
                    type="button"
                    class="tw:rounded-md tw:bg-white/15 tw:hover:bg-white/25"
                    :class="isTouchCapable ? 'tw:h-9 tw:px-3' : 'tw:px-2 tw:py-0.5'"
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
