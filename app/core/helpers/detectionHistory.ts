/**
 * Detection history browsing (BE-ADR-024).
 *
 * Two scopes over the same list: a user's own runs (`GET /detections`) and - for an admin -
 * everyone's, each row carrying its submitter (`GET /detections/all`). The panel that renders
 * them is `McDetectionHistory`; the pieces here are the parts worth testing without a DOM.
 *
 * The scope toggle is **UX only**. `listAll()` is enforced server-side by the RolesGuard, so a
 * student who forces the toggle gets a 403 and nothing else - same posture as the route guard in
 * `middleware/auth.global.ts`.
 */
import type { DetectionRecord, DetectionWithSubmitter } from '~/services/detectionService'

/** A row in either scope. `creator` is present only in the all-users scope. */
export type HistoryRecord = DetectionRecord | DetectionWithSubmitter

export type HistoryScope = 'mine' | 'all'

/**
 * May this caller browse *everyone's* history?
 *
 * Mirrors the `requiredRole === 'admin'` arm of `middleware/auth.global.ts`: staff **and** the
 * `admin` role claim, which is the same claim the backend's RolesGuard reads. Read from the JWT
 * in preference to the stored profile - both live in localStorage, but the token is what the API
 * judges the request on, so the two cannot drift.
 */
export function canBrowseAllDetections(
    userType: string | null | undefined,
    role: string | null | undefined,
): boolean {
    return userType === 'staff' && role === 'admin'
}

/** `creator` exists only on the admin payload, and is null for an anonymous run. */
export function submitterName(record: HistoryRecord): string | null {
    const creator = (record as DetectionWithSubmitter).creator
    if (!creator) return null
    const full = [creator.firstname, creator.lastname].filter(Boolean).join(' ').trim()
    return full || creator.email || null
}

/**
 * "14 Aug 2026, 03:31" - absolute, not relative.
 *
 * A lab session spans hours and a student compares runs against each other, so "2 hours ago"
 * forces mental arithmetic that an absolute stamp does not. Locale-fixed to en-GB for a stable
 * day-month order; the app is English-only (`htmlAttrs: { lang: 'en' }`).
 */
export function formatHistoryDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

/**
 * How many boxes a record found, across every step.
 *
 * An empty result is a real answer, not a failure (the segmenter is correctly silent on a
 * bacterial field), so this can legitimately be 0 and the panel says so rather than hiding it.
 */
export function boxCount(record: HistoryRecord): number {
    return record.steps.reduce((n, s) => n + s.boxes.length, 0)
}

/**
 * The classes a record called, in step order, skipping the `none` of a pass that found nothing.
 *
 * Codes, not display text: resolving them to diagnosis names is the caller's job, because the
 * student-vs-staff rule decides which vocabulary a given viewer is allowed to see (ML-ADR-001).
 */
export function recordClasses(record: HistoryRecord): string[] {
    return record.steps.map((s) => s.predicted_class).filter((c) => c && c !== 'none')
}

/**
 * Newest first.
 *
 * The API already orders this way; re-sorting client-side costs nothing and keeps the panel
 * correct if a caller ever merges scopes or appends a fresh run optimistically.
 */
export function sortNewestFirst<T extends HistoryRecord>(records: T[]): T[] {
    return [...records].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
}

/**
 * The one label a row is filed under: its classes joined, or `NO_FINDINGS` for a run that called
 * none.
 *
 * Deliberately the same string the row already prints as its title, so picking "BV" in the filter
 * keeps exactly the rows that say "BV" - a filter whose options do not match what is on screen
 * sends people looking for rows that were never labelled that way. A multi-class run is its own
 * combination ("VVC, fungus") rather than being counted under each part: the row is one analysis,
 * and splitting it would make the counts sum to more than the list.
 */
export const NO_FINDINGS = 'No findings'

export function historyClassLabel(record: HistoryRecord): string {
    return recordClasses(record).join(', ') || NO_FINDINGS
}

/** Every label present in a list, with how many rows carry it. Commonest first, ties by name. */
export function historyClassOptions(records: HistoryRecord[]): { label: string; count: number }[] {
    const counts = new Map<string, number>()
    for (const record of records) {
        const label = historyClassLabel(record)
        counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export type HistoryDateRange = 'all' | 'today' | '7d' | '30d'

/**
 * Is a record inside a range, counted in whole LOCAL days back from `now`?
 *
 * Days, not rolling 24-hour windows: "today" has to mean the calendar day a student is having a lab
 * session in, and a rolling window would drop this morning's runs by the afternoon. Local, not UTC,
 * for the same reason - the boundary that matters is the one on the wall.
 *
 * `now` is a parameter so this is testable without freezing the clock.
 */
export function withinDateRange(
    iso: string,
    range: HistoryDateRange,
    now: Date = new Date(),
): boolean {
    if (range === 'all') return true
    const at = new Date(iso)
    if (Number.isNaN(at.getTime())) return false

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const daysBack = range === 'today' ? 0 : range === '7d' ? 6 : 29
    const from = new Date(startOfToday)
    from.setDate(from.getDate() - daysBack)
    return at.getTime() >= from.getTime()
}

/**
 * The list as filtered, order preserved.
 *
 * `classLabel` of null means "every class" - null rather than an empty string because a class
 * label legitimately can be empty-ish, and `''` would be indistinguishable from "no filter".
 */
export function filterHistory<T extends HistoryRecord>(
    records: T[],
    filters: { classLabel?: string | null; range?: HistoryDateRange },
    now: Date = new Date(),
): T[] {
    const { classLabel = null, range = 'all' } = filters
    return records.filter(
        (record) =>
            (classLabel === null || historyClassLabel(record) === classLabel) &&
            withinDateRange(record.created_at, range, now),
    )
}
