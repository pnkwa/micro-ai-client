import { useMediaQuery } from '@vueuse/core'

/**
 * Which of the annotator's three layouts applies.
 *
 * The breakpoints are the mockup's, and the names say what changes rather than what size it is:
 *
 *  - `full`    (>= 1280) three columns, keyboard shortcuts live, hover states real, no loupe
 *  - `medium`  (768-1279) one panel docked at a time; the queue becomes a drawer
 *  - `compact` (< 768)    the canvas IS the screen; tools and classes are bottom bars, the queue
 *                         and the shape list are sheets
 *
 * Orientation matters only in the middle band, where a landscape tablet has the width for a docked
 * labels panel and a portrait one does not.
 */
export type AnnotatorLayout = 'compact' | 'medium' | 'full'

export function useAnnotatorLayout() {
    const isFull = useMediaQuery('(min-width: 1280px)')
    const isCompact = useMediaQuery('(max-width: 767px)')
    const isPortrait = useMediaQuery('(orientation: portrait)')

    const layout = computed<AnnotatorLayout>(() =>
        isFull.value ? 'full' : isCompact.value ? 'compact' : 'medium',
    )

    /** Panels dock rather than float only where there is width for both the picture and them. */
    const canDockLabels = computed(() => layout.value === 'full' || !isPortrait.value)

    /**
     * Touch-first surfaces: the loupe, finger-sized targets, bottom bars.
     *
     * Keyed on the LAYOUT rather than on a pointer query, because a small window on a desktop wants
     * the same one-pane arrangement, and a tablet with a trackpad still has fingers.
     */
    const isTouchLayout = computed(() => layout.value !== 'full')

    return { layout, isPortrait, canDockLabels, isTouchLayout }
}
