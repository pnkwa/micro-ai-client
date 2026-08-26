<script setup lang="ts">
import { useElementSize, useMediaQuery } from '@vueuse/core'
import { Images } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { colorForLabel } from '~/core/helpers/colors'
import {
    fitTransform,
    panBy,
    toNormalizedPoint,
    toScreenPoint,
    zoomAt,
    zoomByStep,
    type ViewTransform,
} from '~/core/helpers/viewportTransform'
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
export type Tool = 'select' | 'rectangle' | 'polygon'

const props = withDefaults(
    defineProps<{
        src: string | null
        tool: Tool
        /** What `expert_curated` starts as on a newly drawn shape. See the page for who gets true. */
        defaultCurated: boolean
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

const emit = defineEmits<{ commit: [] }>()

const container = useTemplateRef<HTMLElement>('container')
const { width: viewportW, height: viewportH } = useElementSize(container)

const measured = ref<{ src: string; w: number; h: number } | null>(null)
const transform = ref<ViewTransform>({ scale: 1, x: 0, y: 0 })
const cursor = ref<Point | null>(null)

const natural = computed(() =>
    measured.value?.src === props.src ? { w: measured.value.w, h: measured.value.h } : null,
)
const viewport = computed(() => ({
    w: Math.max(0, viewportW.value - props.insetRight),
    h: viewportH.value,
}))
const ready = computed(() => natural.value !== null && viewportW.value > 0)

const fit = () => {
    if (natural.value) transform.value = fitTransform(natural.value, viewport.value)
}

const onLoad = (event: Event) => {
    const img = event.target as HTMLImageElement
    measured.value = { src: props.src ?? '', w: img.naturalWidth, h: img.naturalHeight }
    fit()
}

watch(
    () => props.src,
    () => (measured.value = null),
)
watch([viewportW, viewportH, () => props.insetRight], fit)

const localPoint = (event: PointerEvent | WheelEvent) => {
    const rect = container.value?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

/** Pointer position in the normalized [0,1] space every shape is stored in. */
const normalized = (event: PointerEvent): Point =>
    natural.value
        ? toNormalizedPoint(natural.value, viewport.value, transform.value, localPoint(event))
        : { x: 0, y: 0 }

// ---- zoom -------------------------------------------------------------------------------------

const onWheel = (event: WheelEvent) => {
    if (!natural.value) return
    // Exponential in the delta, so a trackpad's many small events and a mouse wheel's few large
    // ones cover comparable ground rather than the trackpad crawling.
    const factor = Math.exp(-event.deltaY * 0.0015)
    transform.value = zoomAt(
        natural.value,
        viewport.value,
        transform.value,
        factor,
        localPoint(event),
    )
}

const step = (factor: number) => {
    if (natural.value) {
        transform.value = zoomByStep(natural.value, viewport.value, transform.value, factor)
    }
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
        abandonPinch()
        return
    }
    if (active.size > 2 || event.button !== 0) return

    const at = normalized(event)
    tapOrigin = { x: event.clientX, y: event.clientY }

    // The point is placed on release; this only records where the finger went down so the rubber
    // band has somewhere to run from.
    if (props.tool === 'polygon') return

    if (props.tool === 'rectangle') {
        const id = newId()
        shapes.value.push({
            id,
            label: '',
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
    gesture.value = { kind: 'vertex', id, index }
}

const onPointerMove = (event: PointerEvent) => {
    if (!natural.value) return
    if (active.has(event.pointerId)) {
        active.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }

    // Zoom only while two fingers are down. Panning as well would make the image lurch on the frame
    // a pinch usually ends with, when one finger lifts a moment before the other.
    if (active.size >= 2) {
        if (pinchStart && pinchStart.dist > 0) {
            const target = (pointerDistance() / pinchStart.dist) * pinchStart.scale
            transform.value = zoomAt(
                natural.value,
                viewport.value,
                transform.value,
                target / transform.value.scale,
                pinchMidpoint(),
            )
        }
        return
    }

    const at = normalized(event)
    cursor.value = at
    const g = gesture.value

    if (g.kind === 'pan') {
        const delta = { x: event.clientX - g.last.x, y: event.clientY - g.last.y }
        gesture.value = { kind: 'pan', last: { x: event.clientX, y: event.clientY } }
        transform.value = panBy(natural.value, viewport.value, transform.value, delta)
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
        if (active.size === 0) gesture.value = { kind: 'none' }
        tapOrigin = null
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
            label: '',
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

    const at = toNormalizedPoint(natural.value, viewport.value, transform.value, {
        x: event.clientX - (container.value?.getBoundingClientRect().left ?? 0),
        y: event.clientY - (container.value?.getBoundingClientRect().top ?? 0),
    })
    const index = shape.polygon.findIndex((point) => isNear(at, point, handleTolerance.value))
    if (index === -1) return

    const next = removePolygonPoint(shape, index)
    if (!next) {
        toast.error('A polygon needs at least three points.')
        return
    }
    replaceShape(shape.id, next)
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
const screenTolerance = (pixels: number) => {
    const nat = natural.value
    if (!nat || !transform.value.scale) return 0.02
    return pixels / transform.value.scale / Math.max(nat.w, nat.h)
}

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
    return shapes.value
        .filter((shape) => shape.label)
        .map((shape) => {
            // Anchored to the shape's top-left corner, which is where the eye looks for it.
            const at = toScreenPoint(nat, viewport.value, transform.value, {
                x: shape.x,
                y: shape.y,
            })
            return { id: shape.id, label: shape.label, x: at.x, y: at.y, shape }
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
 * `colorForLabel` is the same deterministic label-to-palette map McAnnotatedImage and
 * McConfidenceBar use, so a human's "clue cell" is the same colour as a model's box carrying that
 * label. It returns CLASSES rather than hex, which is why this is bound to `class` and the SVG
 * paints with `currentColor` rather than a `stroke` attribute.
 *
 * Two states are not label colours and should not be: the selection is always primary so it is
 * findable, and an UNLABELLED shape is amber, because a region nobody has named yet is unfinished
 * work rather than a category.
 */
const colorClassFor = (shape: Shape): string => {
    if (shape.id === selectedId.value) return 'tw:text-primary'
    if (!shape.label) return 'tw:text-amber-400'
    return colorForLabel(shape.label).text
}

defineExpose({
    zoomIn: () => step(1.25),
    zoomOut: () => step(1 / 1.25),
    fit,
    actualSize: () => {
        if (natural.value) {
            transform.value = zoomAt(
                natural.value,
                viewport.value,
                transform.value,
                1 / transform.value.scale,
                { x: viewport.value.w / 2, y: viewport.value.h / 2 },
            )
        }
    },
    closePolygon,
    hasDraft: computed(() => (draftPolygon.value?.length ?? 0) > 0),
    transform: computed(() => transform.value),
    ready,
})
</script>

<template>
    <div
        ref="container"
        class="tw:relative tw:min-h-0 tw:flex-1 tw:touch-none tw:overflow-hidden tw:bg-slate-950 tw:select-none"
        :class="
            !src
                ? ''
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
                    @dragstart.prevent
                />

                <svg
                    v-if="natural"
                    class="tw:absolute tw:inset-0 tw:h-full tw:w-full"
                    :viewBox="`0 0 ${natural.w} ${natural.h}`"
                    preserveAspectRatio="none"
                >
                    <g v-for="shape in shapes" :key="shape.id">
                        <polygon
                            v-if="shape.polygon"
                            :points="polygonPoints(shape.polygon)"
                            fill="currentColor"
                            fill-opacity="0.12"
                            stroke="currentColor"
                            :stroke-width="px(2)"
                            stroke-linejoin="round"
                            :class="colorClassFor(shape)"
                        />
                        <rect
                            v-else
                            v-bind="shapeRect(shape)"
                            fill="currentColor"
                            fill-opacity="0.08"
                            stroke="currentColor"
                            :stroke-width="px(2)"
                            :class="colorClassFor(shape)"
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
                             them: a rectangle resizes by corners, a polygon by vertices. -->
                        <template v-if="shape.id === selectedId && !shape.polygon">
                            <circle
                                v-for="corner in CORNERS"
                                :key="corner"
                                :cx="cornerPoint(shape, corner).x * natural.w"
                                :cy="cornerPoint(shape, corner).y * natural.h"
                                :r="px(5)"
                                fill="#fff"
                                stroke="#249486"
                                :stroke-width="px(1.5)"
                                class="tw:cursor-nwse-resize"
                                @pointerdown="startResize($event, shape.id, corner)"
                            />
                        </template>
                        <template v-if="shape.id === selectedId && shape.polygon">
                            <circle
                                v-for="(point, index) in shape.polygon"
                                :key="index"
                                :cx="point.x * natural.w"
                                :cy="point.y * natural.h"
                                :r="px(5)"
                                fill="#fff"
                                stroke="#249486"
                                :stroke-width="px(1.5)"
                                class="tw:cursor-move"
                                @pointerdown="startVertex($event, shape.id, index)"
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
                class="tw:pointer-events-none tw:absolute tw:z-[5] tw:max-w-[40%] tw:truncate tw:rounded tw:px-1.5 tw:py-0.5 tw:font-semibold tw:whitespace-nowrap tw:text-white"
                :class="[
                    isTouchCapable ? 'tw:text-base' : 'tw:text-xs',
                    entry.shape.id === selectedId ? 'tw:bg-primary' : 'tw:bg-black/75',
                ]"
                :style="{
                    left: `${entry.x}px`,
                    top: `${entry.y}px`,
                    transform: 'translateY(-100%)',
                }"
            >
                {{ entry.label }}
            </div>

            <!--
                The draft controls, and they are not a convenience: on a touch device there is no
                right-click and no Escape key, so without these a polygon can be started and then
                neither corrected nor abandoned. The keyboard and mouse gestures still work and are
                named in the tooltips, but they are shortcuts rather than the only way in.
            -->
            <div
                v-if="draftPolygon?.length"
                class="tw:absolute tw:top-2 tw:flex tw:-translate-x-1/2 tw:items-center tw:gap-2 tw:rounded tw:bg-black/75 tw:px-2 tw:py-1.5 tw:text-xs tw:text-white"
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

            <div
                v-if="cursor"
                class="tw:pointer-events-none tw:absolute tw:right-2 tw:bottom-2 tw:rounded tw:bg-black/60 tw:px-2 tw:py-1 tw:font-mono tw:text-[10px] tw:text-white/80"
            >
                {{ cursor.x.toFixed(3) }}, {{ cursor.y.toFixed(3) }}
            </div>
        </template>

        <div
            v-else
            class="tw:flex tw:h-full tw:w-full tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:text-white/50"
        >
            <Images class="tw:h-6 tw:w-6" />
            <p class="tw:text-sm">Load an image below to start annotating.</p>
        </div>
    </div>
</template>
