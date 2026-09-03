import type { Shape } from '~/core/helpers/annotationShapes'
import type { AnnotationFieldStatus } from '~/services/annotationAssignmentService'

/**
 * Pure model for a locally-cached, unsubmitted annotation assignment (BE-ADR-039 keeps nothing on
 * the server until Submit, so a refresh would otherwise lose every drawn box and form answer).
 *
 * Framework-free on purpose: the storage/auth glue lives in `useAnnotationDraft`, and the logic
 * worth testing — the version + staleness guard, the merge-by-imageId restore, the derivation of
 * student-added classes — lives here where the plain-node Vitest suite can reach it.
 */

/** Bump when the persisted shape changes; a record from an older version is discarded on read. */
export const DRAFT_VERSION = 1

/** Drafts older than this are treated as abandoned. useStorage has no TTL of its own. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/** One image's work. Deliberately excludes the blob object-URLs — they die on refresh anyway. */
export interface DraftField {
    imageId: number
    shapes: Shape[]
    responses: Record<string, string>
    status: AnnotationFieldStatus
}

/** A student-created label class, carried so a restored draft keeps its own vocabulary. */
export interface DraftClass {
    id: number
    label: string
    color_hex: string
}

export interface AnnotationDraftRecord {
    v: number
    savedAt: number
    currentIndex: number
    fields: DraftField[]
    extraClasses: DraftClass[]
}

/** A draft is usable only if it is the current shape and recent enough to still mean something. */
export function isUsableDraft(
    record: AnnotationDraftRecord | null | undefined,
    now = Date.now(),
): record is AnnotationDraftRecord {
    return (
        !!record &&
        record.v === DRAFT_VERSION &&
        Number.isFinite(record.savedAt) &&
        now - record.savedAt <= DRAFT_MAX_AGE_MS
    )
}

/** Assemble a record from the page's current state. */
export function buildDraftRecord(input: {
    currentIndex: number
    fields: DraftField[]
    extraClasses: DraftClass[]
    now?: number
}): AnnotationDraftRecord {
    return {
        v: DRAFT_VERSION,
        savedAt: input.now ?? Date.now(),
        currentIndex: input.currentIndex,
        fields: input.fields,
        extraClasses: input.extraClasses,
    }
}

/** The subset of a live per-image field this module reads and writes back. */
export interface RestorableField {
    imageId: number
    shapes: Shape[]
    responses: Record<string, string>
    status: AnnotationFieldStatus
}

/**
 * Copy a draft's work onto the fresh per-image skeleton, matched by `imageId` rather than position
 * because the album could have changed since the draft was written. Mutates `fields` in place (they
 * are the page's reactive state) and returns whether anything was applied. Images the draft does
 * not mention keep their pending skeleton; draft entries whose image has left the album are dropped.
 */
export function mergeDraftIntoFields(
    fields: RestorableField[],
    record: AnnotationDraftRecord,
): boolean {
    const byId = new Map(record.fields.map((f) => [f.imageId, f]))
    let applied = false
    for (const field of fields) {
        const saved = byId.get(field.imageId)
        if (!saved) continue
        field.shapes = saved.shapes
        field.responses = saved.responses
        field.status = saved.status
        applied = true
    }
    return applied
}

/**
 * The palette rows the student added beyond the assignment's fixed vocabulary (the first
 * `baseCount` rows are the config's `label_set`, seeded on load; anything after is student-created).
 */
export function extraClassesFromPalette(
    palette: DraftClass[],
    baseCount: number,
): DraftClass[] {
    return palette
        .slice(baseCount)
        .map((c) => ({ id: c.id, label: c.label, color_hex: c.color_hex }))
}
