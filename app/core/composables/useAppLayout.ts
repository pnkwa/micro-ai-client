import { useMediaQuery } from '@vueuse/core'
// Imported explicitly rather than left to Nuxt's auto-imports: the unit suite runs plain Vitest
// with no Nuxt context, and a composable that cannot be imported outside the app cannot be tested.
import { computed } from 'vue'

/**
 * Which of three layouts a page is in. WIDTH ONLY.
 *
 * *** NEVER ORIENTATION, NEVER USER-AGENT. *** A grid does not need a wide canvas the way an
 * outline tool does: iPad portrait at 820px shows four columns perfectly well, and an `isIPad`
 * check is a promise about a device rather than about the space it has. Pages that genuinely care
 * about orientation - the annotator, whose labels panel and picture compete for the same width -
 * layer that on top of this rather than replacing it.
 *
 * One implementation of the listener, one place to force a mode while developing, and the
 * thresholds passed in so a browsing page and a drawing page can disagree about where the breaks
 * are without either owning a second resize listener.
 */
export type AppLayout = 'compact' | 'medium' | 'full'

export interface LayoutThresholds {
    /** At or above this width the page has room for everything docked at once. */
    full?: number
    /** Below this width the page is one pane. */
    compact?: number
}

export function useAppLayout(thresholds: LayoutThresholds = {}) {
    const { full = 1280, compact = 768 } = thresholds

    const isFull = useMediaQuery(`(min-width: ${full}px)`)
    const isCompact = useMediaQuery(`(max-width: ${compact - 1}px)`)

    const layout = computed<AppLayout>(() =>
        isFull.value ? 'full' : isCompact.value ? 'compact' : 'medium',
    )

    /**
     * Touch-first surfaces: bigger targets, gestures instead of hover, sheets instead of panels.
     *
     * Keyed on the LAYOUT rather than on a pointer query, because a small window on a desktop wants
     * the same one-pane arrangement, and a tablet with a trackpad still has fingers.
     */
    const isTouchLayout = computed(() => layout.value !== 'full')

    return { layout, isFull, isCompact, isTouchLayout }
}
