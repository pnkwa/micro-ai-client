import { describe, expect, it } from 'vitest'
import {
    assignmentChipFor,
    assignmentCounts,
    assignmentRowView,
    assignmentStatusOf,
    matchesAssignmentChip,
    matchesReviewChip,
    reviewCounts,
    reviewRowView,
    reviewVerdictOf,
    type AssignmentStatus,
    type ReviewVerdict,
} from './assignmentQueue'

describe('assignmentRowView', () => {
    it('is to do with nothing on it', () => {
        expect(assignmentRowView({ status: 'pending', shapeCount: 0 })).toEqual({
            status: 'todo',
            badge: null,
            meta: 'to do',
        })
    })

    it('counts boxes on a started image', () => {
        expect(assignmentRowView({ status: 'pending', shapeCount: 3 })).toEqual({
            status: 'progress',
            badge: 3,
            meta: '3 boxes',
        })
    })

    it('pluralises a single box', () => {
        expect(assignmentRowView({ status: 'pending', shapeCount: 1 }).meta).toBe('1 box')
    })

    it('reads done with its count once marked', () => {
        expect(assignmentRowView({ status: 'completed', shapeCount: 2 })).toEqual({
            status: 'done',
            badge: 2,
            meta: 'done',
        })
    })

    it('reads skipped with no count', () => {
        expect(assignmentRowView({ status: 'skipped', shapeCount: 0 })).toEqual({
            status: 'skipped',
            badge: null,
            meta: 'skipped',
        })
    })
})

describe('assignmentChipFor', () => {
    it.each([
        ['done', 'done'],
        ['skipped', 'skipped'],
        ['progress', 'todo'],
        ['todo', 'todo'],
    ])('puts %s under %s', (status, chip) => {
        expect(assignmentChipFor(status as AssignmentStatus)).toBe(chip)
    })
})

describe('assignmentCounts', () => {
    const statuses: AssignmentStatus[] = ['done', 'skipped', 'progress', 'todo', 'todo']

    it('partitions: To do + Done + Skipped add up to all', () => {
        const c = assignmentCounts(statuses)
        expect(c.todo + c.done + c.skipped).toBe(c.all)
    })

    it('counts each chip, folding in-progress into To do', () => {
        expect(assignmentCounts(statuses)).toEqual({ all: 5, todo: 3, done: 1, skipped: 1 })
    })

    it('is all zeroes for an empty queue', () => {
        expect(assignmentCounts([])).toEqual({ all: 0, todo: 0, done: 0, skipped: 0 })
    })

    it('agrees with matchesAssignmentChip', () => {
        const c = assignmentCounts(statuses)
        expect(statuses.filter((s) => matchesAssignmentChip(s, 'todo'))).toHaveLength(c.todo)
        expect(statuses.filter((s) => matchesAssignmentChip(s, 'done'))).toHaveLength(c.done)
        expect(statuses.filter((s) => matchesAssignmentChip(s, 'skipped'))).toHaveLength(c.skipped)
        expect(statuses.filter((s) => matchesAssignmentChip(s, 'all'))).toHaveLength(c.all)
    })
})

describe('assignmentStatusOf', () => {
    it('is progress only when pending with shapes', () => {
        expect(assignmentStatusOf({ status: 'pending', shapeCount: 1 })).toBe('progress')
        expect(assignmentStatusOf({ status: 'pending', shapeCount: 0 })).toBe('todo')
        expect(assignmentStatusOf({ status: 'completed', shapeCount: 0 })).toBe('done')
    })
})

describe('reviewRowView', () => {
    it('is unreviewed and unattempted with no field', () => {
        expect(reviewRowView({ field: null })).toEqual({
            verdict: 'unreviewed',
            badge: null,
            meta: 'not attempted',
        })
    })

    it('carries the verdict and box count of a worked image', () => {
        expect(
            reviewRowView({
                field: { review_status: 'flagged', status: 'completed', boxCount: 4 },
            }),
        ).toEqual({ verdict: 'flagged', badge: 4, meta: '4 boxes' })
    })

    it('shows a skipped image, still with its verdict, but no count', () => {
        expect(
            reviewRowView({
                field: { review_status: 'unreviewed', status: 'skipped', boxCount: 0 },
            }),
        ).toEqual({ verdict: 'unreviewed', badge: null, meta: 'skipped' })
    })
})

describe('reviewVerdictOf', () => {
    it('falls back to unreviewed for an unattempted image', () => {
        expect(reviewVerdictOf({ field: null })).toBe('unreviewed')
    })
})

describe('reviewCounts', () => {
    const verdicts: ReviewVerdict[] = [
        'unreviewed',
        'unreviewed',
        'approved',
        'flagged',
        'incorrect',
    ]

    it('counts all and the three hunted verdicts (approved is not a chip)', () => {
        expect(reviewCounts(verdicts)).toEqual({ all: 5, unreviewed: 2, flagged: 1, incorrect: 1 })
    })

    /** Approved falls only under `all`, so the three chips deliberately do NOT sum to all. */
    it('does not count approved under any chip but all', () => {
        const c = reviewCounts(verdicts)
        expect(c.unreviewed + c.flagged + c.incorrect).toBeLessThan(c.all)
    })

    it('agrees with matchesReviewChip', () => {
        const c = reviewCounts(verdicts)
        expect(verdicts.filter((v) => matchesReviewChip(v, 'unreviewed'))).toHaveLength(
            c.unreviewed,
        )
        expect(verdicts.filter((v) => matchesReviewChip(v, 'flagged'))).toHaveLength(c.flagged)
        expect(verdicts.filter((v) => matchesReviewChip(v, 'incorrect'))).toHaveLength(c.incorrect)
        expect(verdicts.filter((v) => matchesReviewChip(v, 'all'))).toHaveLength(c.all)
    })
})
