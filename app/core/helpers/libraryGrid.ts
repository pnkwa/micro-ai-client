import type { AppLayout } from '~/core/composables/useAppLayout'

/**
 * How big a card is, and how much air is around it, at each layout.
 *
 * *** DRIVEN OFF THE LAYOUT MODE, NOT A GLOBAL TOKEN. *** A phone needs smaller cards, tighter
 * gaps and a shorter footer than a desktop, and expressing that as one set of tokens would mean
 * touching every other page to change this one. Every number the grid uses comes from here, so a
 * layout that looks wrong is wrong in one table rather than in six class strings.
 *
 * On the DESKTOP the card width is used FIXED rather than `minmax(x, 1fr)`: cards that stretch to
 * fill a row all resize the moment the docked inspector opens, which turns a click into a reflow of
 * the whole screen. Fixed, the grid drops a column and everything else holds still. Below Full the
 * inspector is a full-screen overlay, not a docked column, so the grid there uses `col` as a MINIMUM
 * and fills the row (see ImageGrid) - which is why the touch cards are set smaller here, to pack more
 * of them across a tablet or phone instead of stranding a ribbon of dead space at the right edge.
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
    // `col` is a MINIMUM below Full (the grid fills the row), so these are set small on purpose: ~5
    // across a portrait tablet and ~3 across a phone, then stretched to leave no right-edge ribbon.
    medium: { col: 140, gap: 14, pad: 16, footer: 44 },
    compact: { col: 116, gap: 10, pad: 12, footer: 40 },
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
