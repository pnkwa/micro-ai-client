/**
 * Per-image status in the annotator's queue.
 *
 * Three of the four states are derived from data the server actually has; the fourth is honest
 * about being session-only. Kept pure and out of the component because it is the column's whole
 * meaning - someone works a batch by reading these four badges - and it is the part that would
 * quietly rot if a status were computed in two places.
 */

export type QueueStatus =
    /** Saved and marked done by a human. `images.metadata.reviewed`. */
    | 'reviewed'
    /** Carries model output nobody has passed over yet. SESSION-ONLY, see below. */
    | 'seeded'
    /** Has shapes, and unsaved changes in this session. */
    | 'editing'
    /** Saved shapes, not marked reviewed. */
    | 'labelled'
    /** Nothing on it. */
    | 'empty'

export interface QueueRowInput {
    /**
     * `annotation_count` from the image row: what the SERVER has stored, FOR YOU.
     *
     * Caller-scoped since BE-ADR-038, so a row reading zero means you have not annotated it rather
     * than that nobody has. The queue is one person's worklist, which is the reading it wants.
     */
    annotationCount: number
    /** `metadata.reviewed`. */
    reviewed: boolean
    /**
     * Seeded in this session and not yet accepted/rejected.
     *
     * Nothing on the server records that an annotation came from a model, so this cannot survive a
     * reload. Recorded as a request rather than faked: `image_annotations` would need an origin
     * column for the amber state to mean anything tomorrow.
     */
    seededUnreviewed: boolean
    /** Shapes changed against the last save, in this session. */
    unsavedEdits: number
}

export interface QueueRowView {
    status: QueueStatus
    /** The right-hand count, or null when there is nothing to count. */
    badge: number | null
    /** The line under the filename. */
    meta: string
}

/**
 * Order matters and is not arbitrary.
 *
 * Unsaved work outranks everything, because it is the only state that can be LOST - a queue that
 * says "reviewed" next to edits nobody saved is actively misleading. Seeded outranks reviewed
 * because a seeded pass is exactly what still needs a human. Reviewed then outranks a plain count.
 */
export function queueRowView(input: QueueRowInput): QueueRowView {
    const { annotationCount, reviewed, seededUnreviewed, unsavedEdits } = input

    if (unsavedEdits > 0) {
        return {
            status: 'editing',
            badge: annotationCount || null,
            meta: `${unsavedEdits} unsaved edit${unsavedEdits === 1 ? '' : 's'}`,
        }
    }
    if (seededUnreviewed) {
        return { status: 'seeded', badge: annotationCount || null, meta: 'seeded · unreviewed' }
    }
    if (reviewed) {
        return { status: 'reviewed', badge: annotationCount || null, meta: 'reviewed' }
    }
    if (annotationCount > 0) {
        return {
            status: 'labelled',
            badge: annotationCount,
            meta: `${annotationCount} shape${annotationCount === 1 ? '' : 's'}`,
        }
    }
    return { status: 'empty', badge: null, meta: 'no shapes yet' }
}

/**
 * The chips. FOUR of them, and they PARTITION: every image is under exactly one of the last three.
 *
 * The previous three did not. "To label" was everything unreviewed, which included images that
 * already had shapes, so a batch of 22 with three annotated reported All 22 / To label 22 / Done 0
 * - three counts that cannot all be true. Splitting out "in progress" is what makes them add up,
 * and it is also the state someone actually wants to find: work started and not finished.
 */
export type QueueFilter = 'all' | 'todo' | 'progress' | 'done'

/*
 * `progress` stays in the type and in `chipFor` even though the UI shows three chips.
 *
 * It is a real STATE - has shapes, not signed off - and the row badge and meta line both key on it.
 * The design folds it into "To label" as a FILTER, which is only about which chip catches it, and
 * `matchesFilter` does that below. Collapsing the state itself would lose the amber badge with it.
 */

/**
 * The one place a status becomes a chip, so the counts and the row can never disagree.
 *
 * `all` is not part of the partition - it is the sum of the other three.
 */
export function chipFor(status: QueueStatus): Exclude<QueueFilter, 'all'> {
    if (status === 'reviewed') return 'done'
    if (status === 'empty') return 'todo'
    return 'progress'
}

/**
 * The STRICT reading: one chip catches each status, and the chips partition.
 *
 * The library shows four chips rather than the annotator's three, so "Unlabelled" there means
 * exactly `empty` and the three counts add up to All. `matchesFilter` below folds in-progress into
 * "To label" instead, which is right for a worklist and wrong for a set of counted chips: fold, and
 * a library of 22 reports All 22 / Unlabelled 19 / In progress 3 / Reviewed 3.
 *
 * Both readings share `chipFor`, so a status can never land in different chips on the two pages.
 */
export function matchesChip(status: QueueStatus, filter: QueueFilter): boolean {
    return filter === 'all' || chipFor(status) === filter
}

export function matchesFilter(status: QueueStatus, filter: QueueFilter): boolean {
    if (filter === 'all') return true
    // "To label" catches everything not done, in-progress included: the chips are three, and three
    // that partition beat four that are precise about a distinction nobody asked to filter on.
    if (filter === 'todo') return chipFor(status) !== 'done'
    return chipFor(status) === filter
}

/** Every chip's count, derived from one pass so they cannot drift apart. */
export function queueCounts(statuses: QueueStatus[]): Record<QueueFilter, number> {
    const counts: Record<QueueFilter, number> = {
        all: statuses.length,
        todo: 0,
        progress: 0,
        done: 0,
    }
    for (const status of statuses) counts[chipFor(status)] += 1
    return counts
}

/**
 * Progress across the batch.
 *
 * TWO numbers, because they answer different questions and reporting one under the other's name is
 * what made the bar read 0/22 on a batch with three annotated images. `reviewed` is how much is
 * signed off; `annotated` is how much has been touched at all.
 */
export function queueProgress(statuses: QueueStatus[]): {
    reviewed: number
    annotated: number
    total: number
    percent: number
} {
    const total = statuses.length
    const reviewed = statuses.filter((status) => status === 'reviewed').length
    const annotated = statuses.filter((status) => status !== 'empty').length
    return { reviewed, annotated, total, percent: total ? Math.round((reviewed / total) * 100) : 0 }
}
