import { useElementSize } from '@vueuse/core'
import {
    fitScale,
    fitTransform,
    panBy,
    toNormalizedPoint,
    toScreenPoint,
    zoomAt,
    zoomByStep,
    type ImageSize,
    type ViewTransform,
} from '~/core/helpers/viewportTransform'

/**
 * Fit, zoom, pan, and the two coordinate mappings, bound to one element.
 *
 * The arithmetic itself stays in `core/helpers/viewportTransform.ts`, where it is DOM-free and
 * unit tested - this only measures an element, holds the transform, and turns pointer events into
 * calls. The split is what makes the part that decides where a box actually is testable at all,
 * since vitest here runs with no DOM.
 *
 * The `insetRight` is a viewport inset rather than a smaller element: every piece of the arithmetic
 * is expressed against a viewport rectangle, so narrowing that rectangle moves the fit, the pan
 * bounds, the pointer mapping and the overlay positions together, and none of them can disagree
 * about where the middle is.
 */
export function useCanvasViewport(
    container: Ref<HTMLElement | null>,
    options: {
        /** The current image source, used to invalidate a stale measurement. */
        src: Ref<string | null>
        /** CSS pixels covered on the right, e.g. by a floating panel. */
        insetRight?: Ref<number>
    },
) {
    const { width: elementW, height: elementH } = useElementSize(container)

    /**
     * Natural size, TAGGED with the src it was measured from.
     *
     * A new source has not been measured yet, so the tag will not match and this reads as
     * unmeasured - which is what stops one frame of the next picture being laid out against the
     * last one's dimensions.
     */
    const measured = ref<{ src: string; w: number; h: number } | null>(null)
    const transform = ref<ViewTransform>({ scale: 1, x: 0, y: 0 })

    const natural = computed<ImageSize | null>(() =>
        measured.value?.src === options.src.value
            ? { w: measured.value.w, h: measured.value.h }
            : null,
    )

    const viewport = computed(() => ({
        w: Math.max(0, elementW.value - (options.insetRight?.value ?? 0)),
        h: elementH.value,
    }))

    const ready = computed(() => natural.value !== null && viewport.value.w > 0)

    const fit = () => {
        if (natural.value) transform.value = fitTransform(natural.value, viewport.value)
    }

    /** The scale at which the whole image fits, so a readout can say "Fit 13%" rather than "13%". */
    const fitAt = computed(() =>
        natural.value ? fitScale(natural.value, viewport.value) : undefined,
    )

    const atFit = computed(() => {
        const scale = transform.value.scale
        // A tolerance, because fit is a float division and any wheel tick lands a hair off it,
        // which would flicker the word away.
        return fitAt.value !== undefined && Math.abs(scale - fitAt.value) < 0.001
    })

    const measure = (img: HTMLImageElement) => {
        measured.value = {
            src: options.src.value ?? '',
            w: img.naturalWidth,
            h: img.naturalHeight,
        }
        fit()
    }

    watch(options.src, () => (measured.value = null))
    watch([elementW, elementH, () => options.insetRight?.value], fit)

    /** Event position relative to the element's top-left, which is where the arithmetic starts. */
    const localPoint = (event: { clientX: number; clientY: number }) => {
        const rect = container.value?.getBoundingClientRect()
        if (!rect) return { x: 0, y: 0 }
        return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    /** Pointer position in the normalized [0,1] space every shape is stored in. */
    const toNormalized = (event: { clientX: number; clientY: number }) =>
        natural.value
            ? toNormalizedPoint(natural.value, viewport.value, transform.value, localPoint(event))
            : { x: 0, y: 0 }

    /** A normalized point's place on screen, for overlays drawn outside the transform. */
    const toScreen = (point: { x: number; y: number }) =>
        natural.value
            ? toScreenPoint(natural.value, viewport.value, transform.value, point)
            : { x: 0, y: 0 }

    const zoomAtCursor = (event: { clientX: number; clientY: number }, deltaY: number) => {
        if (!natural.value) return
        // Exponential in the delta, so a trackpad's many small events and a mouse wheel's few large
        // ones cover comparable ground rather than the trackpad crawling.
        const factor = Math.exp(-deltaY * 0.0015)
        transform.value = zoomAt(
            natural.value,
            viewport.value,
            transform.value,
            factor,
            localPoint(event),
        )
    }

    /**
     * Zoom about an arbitrary viewport point, for pinch - whose anchor is the midpoint between two
     * fingers rather than a cursor.
     */
    const zoomAtPoint = (point: { x: number; y: number }, factor: number) => {
        if (natural.value) {
            transform.value = zoomAt(natural.value, viewport.value, transform.value, factor, point)
        }
    }

    const zoomStep = (factor: number) => {
        if (natural.value) {
            transform.value = zoomByStep(natural.value, viewport.value, transform.value, factor)
        }
    }

    const actualSize = () => {
        if (!natural.value) return
        transform.value = zoomAt(
            natural.value,
            viewport.value,
            transform.value,
            1 / transform.value.scale,
            { x: viewport.value.w / 2, y: viewport.value.h / 2 },
        )
    }

    const pan = (delta: { x: number; y: number }) => {
        if (natural.value) {
            transform.value = panBy(natural.value, viewport.value, transform.value, delta)
        }
    }

    /** Screen pixels expressed in normalized units, for hit tolerances that hold at any zoom. */
    const screenTolerance = (pixels: number) => {
        const nat = natural.value
        if (!nat || !transform.value.scale) return 0.02
        return pixels / transform.value.scale / Math.max(nat.w, nat.h)
    }

    return {
        transform,
        natural,
        viewport,
        ready,
        fitAt,
        atFit,
        measure,
        fit,
        localPoint,
        toNormalized,
        toScreen,
        zoomAtCursor,
        zoomAtPoint,
        zoomStep,
        actualSize,
        pan,
        screenTolerance,
    }
}
