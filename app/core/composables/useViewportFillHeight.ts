import type { MaybeComputedElementRef } from '@vueuse/core'

/**
 * A CSS length that stretches `el` from where it sits down to the bottom of the viewport, so a
 * long list or table scrolls within the screen instead of stretching the page into a tall scroll.
 *
 * Measured rather than a hardcoded `calc()` offset: the element's own top comes from the layout,
 * so the result stays right as the page header, tab strip or filter row above it change height —
 * which they do between the class, assignment and exam pages — and it re-measures on scroll and
 * resize. That matters here because the window is the scroll container (nothing between the page
 * and <body> sets overflow; see SidebarMain), so a fixed offset is only ever correct at scroll-top.
 *
 * `min` keeps the region usable on a short viewport; `gap` is the breathing room left below it,
 * and is where a caller accounts for anything that must stay visible underneath — a pagination
 * bar, say — since only what's ABOVE the element can be measured from its top.
 */
export function useViewportFillHeight(
    el: MaybeComputedElementRef,
    options: { min?: number; gap?: number } = {},
) {
    const { min = 240, gap = 24 } = options
    const { top } = useElementBounding(el)
    const { height: windowHeight } = useWindowSize()

    return computed(() => `${Math.max(min, Math.round(windowHeight.value - top.value - gap))}px`)
}
