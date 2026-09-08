/**
 * Per-image status for the two assignment queues: the student's annotate queue and the instructor's
 * review list.
 *
 * Kept pure and out of the components (the same reasoning as `annotationQueue.ts`): the badge, the
 * meta line, the filter chips and the header progress all read one image's status, and they must
 * never disagree. Both queues get one source of truth here.
 */

// ---------------------------------------------------------------------------------------------------
// Student annotate queue
// ---------------------------------------------------------------------------------------------------

/** Where a student's image sits: signed off, passed over, started, or not touched. */
export type AssignmentStatus = 'done' | 'skipped' | 'progress' | 'todo'

/** The three chips (plus `all`, which is their sum). They PARTITION every image. */
export type AssignmentFilter = 'all' | 'todo' | 'done' | 'skipped'

export interface AssignmentRowInput {
    /** The per-image status the student set: pending / completed / skipped. */
    status: 'pending' | 'completed' | 'skipped'
    /** Boxes drawn on this image. */
    shapeCount: number
}

export interface AssignmentRowView {
    status: AssignmentStatus
    /** The trailing count, or null when there is nothing to count (the dash is drawn by the row). */
    badge: number | null
    /** The line under the filename. */
    meta: string
}

/** The status enum for one image, used for counting and filtering. */
export function assignmentStatusOf(input: AssignmentRowInput): AssignmentStatus {
    if (input.status === 'completed') return 'done'
    if (input.status === 'skipped') return 'skipped'
    return input.shapeCount > 0 ? 'progress' : 'todo'
}

export function assignmentRowView(input: AssignmentRowInput): AssignmentRowView {
    const status = assignmentStatusOf(input)
    switch (status) {
        case 'done':
            return { status, badge: input.shapeCount || null, meta: 'done' }
        case 'skipped':
            return { status, badge: null, meta: 'skipped' }
        case 'progress':
            return {
                status,
                badge: input.shapeCount,
                meta: `${input.shapeCount} box${input.shapeCount === 1 ? '' : 'es'}`,
            }
        default:
            return { status, badge: null, meta: 'to do' }
    }
}

/**
 * The one place a status becomes a chip, so the counts and the list can never disagree.
 *
 * `progress` (started, not signed off) folds into `todo`: the chips are To do / Done / Skipped, and
 * an image with boxes that is not marked done is still "to do". That keeps the three a partition.
 */
export function assignmentChipFor(status: AssignmentStatus): Exclude<AssignmentFilter, 'all'> {
    if (status === 'done') return 'done'
    if (status === 'skipped') return 'skipped'
    return 'todo'
}

export function matchesAssignmentChip(status: AssignmentStatus, filter: AssignmentFilter): boolean {
    return filter === 'all' || assignmentChipFor(status) === filter
}

/** Every chip's count from one pass, so All = To do + Done + Skipped. */
export function assignmentCounts(statuses: AssignmentStatus[]): Record<AssignmentFilter, number> {
    const counts: Record<AssignmentFilter, number> = {
        all: statuses.length,
        todo: 0,
        done: 0,
        skipped: 0,
    }
    for (const status of statuses) counts[assignmentChipFor(status)] += 1
    return counts
}

// ---------------------------------------------------------------------------------------------------
// Instructor review list
// ---------------------------------------------------------------------------------------------------

/** The four verdict states. No fifth; a skipped image still needs one. */
export type ReviewVerdict = 'unreviewed' | 'approved' | 'flagged' | 'incorrect'

/**
 * The chips an instructor traverses. `approved` is deliberately NOT a chip: verdict state is what an
 * instructor hunts for, and "already approved" is not something they go looking for. So these do not
 * partition (approved falls only under `all`).
 */
export type ReviewFilter = 'all' | 'unreviewed' | 'flagged' | 'incorrect'

export interface ReviewRowInput {
    /** null for an album image the student never attempted (there is nothing to review). */
    field: { review_status: ReviewVerdict; status: string; boxCount: number } | null
}

export interface ReviewRowView {
    verdict: ReviewVerdict
    /** Box count, or null when there is nothing to count. */
    badge: number | null
    meta: string
}

/** An unattempted image (no field) reads as unreviewed for the chips, but carries no box count. */
export function reviewVerdictOf(input: ReviewRowInput): ReviewVerdict {
    return input.field?.review_status ?? 'unreviewed'
}

export function reviewRowView(input: ReviewRowInput): ReviewRowView {
    const verdict = reviewVerdictOf(input)
    if (!input.field) return { verdict, badge: null, meta: 'not attempted' }
    if (input.field.status === 'skipped') return { verdict, badge: null, meta: 'skipped' }
    const n = input.field.boxCount
    return { verdict, badge: n || null, meta: `${n} box${n === 1 ? '' : 'es'}` }
}

export function matchesReviewChip(verdict: ReviewVerdict, filter: ReviewFilter): boolean {
    return filter === 'all' || verdict === filter
}

/**
 * Chip counts. `all` is the whole list; the other three count their verdict. They do NOT sum to
 * `all`, because approved images are counted under none of them (see `ReviewFilter`).
 */
export function reviewCounts(verdicts: ReviewVerdict[]): Record<ReviewFilter, number> {
    const counts: Record<ReviewFilter, number> = {
        all: verdicts.length,
        unreviewed: 0,
        flagged: 0,
        incorrect: 0,
    }
    for (const verdict of verdicts) {
        if (verdict === 'unreviewed') counts.unreviewed += 1
        else if (verdict === 'flagged') counts.flagged += 1
        else if (verdict === 'incorrect') counts.incorrect += 1
    }
    return counts
}
