import { useMediaQuery } from '@vueuse/core'
import { useAppLayout, type AppLayout } from './useAppLayout'

/**
 * Which of the annotator's three layouts applies.
 *
 * The BREAKPOINTS come from `useAppLayout`, shared with the library, so there is one resize
 * listener and one place to force a mode. What stays here is the part that is genuinely the
 * annotator's: orientation, which matters to a drawing surface and not to a grid.
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
export type AnnotatorLayout = AppLayout

export function useAnnotatorLayout() {
    const { layout, isFull } = useAppLayout()
    const isPortrait = useMediaQuery('(orientation: portrait)')

    /** Panels dock rather than float only where there is width for both the picture and them. */
    const canDockLabels = computed(() => isFull.value || !isPortrait.value)

    /**
     * Touch-first surfaces: the loupe, finger-sized targets, bottom bars.
     *
     * Keyed on the LAYOUT rather than on a pointer query, because a small window on a desktop wants
     * the same one-pane arrangement, and a tablet with a trackpad still has fingers.
     */
    const isTouchLayout = computed(() => layout.value !== 'full')

    /**
     * One pane, with the tools on BOTTOM BARS rather than in the floating dock.
     *
     * The shell lays the bars out and the page decides what floats over the canvas, so both have to
     * agree about this exact question: when they disagreed, a phone got the dock AND the bottom bar,
     * two copies of the same four tools on a 390px screen.
     */
    const stacked = computed(() => layout.value === 'compact' || !canDockLabels.value)

    return { layout, isPortrait, canDockLabels, isTouchLayout, stacked }
}
