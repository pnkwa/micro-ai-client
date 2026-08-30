import type { AppLayout } from '~/core/composables/useAppLayout'

/**
 * How big a card is, and how much air is around it, at each layout.
 *
 * *** DRIVEN OFF THE LAYOUT MODE, NOT A GLOBAL TOKEN. *** A phone needs smaller cards, tighter
 * gaps and a shorter footer than a desktop, and expressing that as one set of tokens would mean
 * touching every other page to change this one. Every number the grid uses comes from here, so a
 * layout that looks wrong is wrong in one table rather than in six class strings.
 *
 * The card width is FIXED at each mode rather than `minmax(x, 1fr)`: cards that stretch to fill a
 * row all resize the moment the inspector opens, which turns a click into a reflow of the whole
 * screen. Fixed, the grid drops a column and everything else holds still.
 */
export interface GridMetrics {
    /** Card width in px. `auto-fill` decides how many fit. */
    col: number
    gap: number
    /** Padding around the grid. */
    pad: number
    /** The name-and-meta strip under the picture. */
    footer: number
}

const BASE: Record<AppLayout, GridMetrics> = {
    full: { col: 208, gap: 16, pad: 20, footer: 44 },
    medium: { col: 180, gap: 14, pad: 16, footer: 44 },
    compact: { col: 148, gap: 10, pad: 12, footer: 40 },
}

/**
 * THE LAYOUT DECIDES THE CARD, and nothing else does.
 *
 * There was a comfortable/compact toggle in the toolbar for a while. It went because the mode
 * already picks the right card for the space: a second, manual axis meant two ways to be wrong
 * about the same number, and a control people set once and then wondered about.
 */
export function gridMetrics(layout: AppLayout): GridMetrics {
    return BASE[layout]
}
