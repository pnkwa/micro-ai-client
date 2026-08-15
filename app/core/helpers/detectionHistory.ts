/**
 * Detection history browsing (BE-ADR-024).
 *
 * Two scopes over the same list: a user's own runs (`GET /detections`) and — for an admin —
 * everyone's, each row carrying its submitter (`GET /detections/all`). The panel that renders
 * them is `McDetectionHistory`; the pieces here are the parts worth testing without a DOM.
 *
 * The scope toggle is **UX only**. `listAll()` is enforced server-side by the RolesGuard, so a
 * student who forces the toggle gets a 403 and nothing else — same posture as the route guard in
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
 * in preference to the stored profile — both live in localStorage, but the token is what the API
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
 * "14 Aug 2026, 03:31" — absolute, not relative.
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
