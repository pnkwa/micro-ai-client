/**
 * Dates, written the way this product is read.
 *
 * *** ALWAYS `29 Aug 2026`, NEVER `8/29/2026`. *** This is used in Thailand, where a slashed date is
 * read day-first by half the room, so `8/29` is either the 8th of a month that does not exist or the
 * 29th of August depending on who is looking. Spelling the month removes the ambiguity outright,
 * which is why this exists as a helper rather than as a `toLocaleDateString()` call per component.
 *
 * `en-GB` for the ordering (day, month, year) rather than the browser's locale: a shared teaching
 * machine set to `en-US` would otherwise render a different order to the person beside it.
 */

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const DAY_NO_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

/**
 * An empty string for anything unparseable, rather than `Invalid Date` on the screen.
 *
 * A date that cannot be read is a row that renders without one; the caller's layout survives, and
 * nobody is shown a word that looks like a bug in their data.
 */
const parse = (iso: string | null | undefined): Date | null => {
    if (!iso) return null
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? null : date
}

/** `29 Aug 2026`. */
export function formatDay(iso: string | null | undefined): string {
    const date = parse(iso)
    return date ? DAY.format(date) : ''
}

/**
 * `29 Aug` this year, `29 Aug 2025` in any other.
 *
 * For the card footer, where the year is noise on a library someone uploaded to last week and the
 * one fact that matters on a picture from last term. Dropping it unconditionally would make those
 * two look the same.
 */
export function formatDayShort(iso: string | null | undefined, now: Date = new Date()): string {
    const date = parse(iso)
    if (!date) return ''
    return date.getFullYear() === now.getFullYear() ? DAY_NO_YEAR.format(date) : DAY.format(date)
}

/** `29 Aug 2026, 14:02`, for the inspector where the exact moment is the point. */
export function formatDayTime(iso: string | null | undefined): string {
    const date = parse(iso)
    return date ? `${DAY.format(date)}, ${TIME.format(date)}` : ''
}
