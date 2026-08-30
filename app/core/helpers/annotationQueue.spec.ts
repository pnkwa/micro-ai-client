import { describe, expect, it } from 'vitest'
import {
    chipFor,
    matchesChip,
    matchesFilter,
    queueCounts,
    queueProgress,
    queueRowView,
    type QueueStatus,
} from './annotationQueue'

const input = (over: Partial<Parameters<typeof queueRowView>[0]> = {}) =>
    queueRowView({
        annotationCount: 0,
        reviewed: false,
        seededUnreviewed: false,
        unsavedEdits: 0,
        ...over,
    })

describe('queueRowView', () => {
    it('is empty with nothing on it', () => {
        expect(input()).toEqual({ status: 'empty', badge: null, meta: 'no shapes yet' })
    })

    it('counts saved shapes', () => {
        expect(input({ annotationCount: 3 })).toMatchObject({
            status: 'labelled',
            badge: 3,
            meta: '3 shapes',
        })
    })

    it('says reviewed once a human has marked it', () => {
        expect(input({ annotationCount: 3, reviewed: true })).toMatchObject({
            status: 'reviewed',
            meta: 'reviewed',
        })
    })

    it('says seeded while model output is unreviewed', () => {
        expect(input({ annotationCount: 5, seededUnreviewed: true })).toMatchObject({
            status: 'seeded',
            meta: 'seeded · unreviewed',
        })
    })

    /**
     * The precedence that matters: unsaved work is the only state that can be LOST, so a row must
     * never report "reviewed" beside edits nobody has saved.
     */
    it('lets unsaved edits outrank reviewed', () => {
        expect(input({ annotationCount: 3, reviewed: true, unsavedEdits: 2 })).toMatchObject({
            status: 'editing',
            meta: '2 unsaved edits',
        })
    })

    it('lets seeded outrank reviewed, because a seeded pass is what still needs a human', () => {
        expect(input({ annotationCount: 3, reviewed: true, seededUnreviewed: true })).toMatchObject(
            { status: 'seeded' },
        )
    })

    it.each([
        [1, '1 unsaved edit'],
        [2, '2 unsaved edits'],
    ])('pluralises %s correctly', (count, meta) => {
        expect(input({ unsavedEdits: count })).toMatchObject({ meta })
    })

    it('shows no badge when there is nothing to count', () => {
        expect(input({ unsavedEdits: 1 }).badge).toBeNull()
    })
})

describe('chipFor', () => {
    it.each([
        ['reviewed', 'done'],
        ['empty', 'todo'],
        ['labelled', 'progress'],
        ['seeded', 'progress'],
        ['editing', 'progress'],
    ])('puts %s under %s', (status, chip) => {
        expect(chipFor(status as QueueStatus)).toBe(chip)
    })
})

describe('queueCounts', () => {
    const statuses: QueueStatus[] = [
        'reviewed',
        'reviewed',
        'labelled',
        'seeded',
        'editing',
        'empty',
        'empty',
    ]

    /**
     * The bug this exists for: the old three chips reported All 22 / To label 22 / Done 0 on a
     * batch with three annotated images, because "to label" meant "not reviewed" and swallowed
     * everything already started.
     */
    it('partitions: the three chips add up to all', () => {
        const counts = queueCounts(statuses)
        expect(counts.todo + counts.progress + counts.done).toBe(counts.all)
    })

    it('counts each state', () => {
        expect(queueCounts(statuses)).toEqual({ all: 7, todo: 2, progress: 3, done: 2 })
    })

    /** The UI shows three chips, so "To label" has to catch the in-progress ones too. */
    it('folds in-progress into To label as a FILTER, and the three still add up', () => {
        const shown = statuses.filter((s) => matchesFilter(s, 'todo')).length
        const done = statuses.filter((s) => matchesFilter(s, 'done')).length
        expect(shown + done).toBe(statuses.length)
    })

    it('is all zeroes for an empty queue', () => {
        expect(queueCounts([])).toEqual({ all: 0, todo: 0, progress: 0, done: 0 })
    })
})

describe('matchesChip', () => {
    const statuses: QueueStatus[] = ['reviewed', 'seeded', 'editing', 'labelled', 'empty']

    it('passes everything under all', () => {
        expect(statuses.every((s) => matchesChip(s, 'all'))).toBe(true)
    })

    /**
     * The library's four chips, where Unlabelled means EXACTLY empty.
     *
     * `matchesFilter` folds in-progress into "To label" for the annotator's three-chip worklist.
     * Fold here and a library of 22 would report All 22 / Unlabelled 19 / In progress 3 /
     * Reviewed 3, which is the same "counts that cannot all be true" bug in a new place.
     */
    it('does not fold in-progress into Unlabelled, so the counted chips partition', () => {
        expect(matchesChip('labelled', 'todo')).toBe(false)
        expect(matchesChip('empty', 'todo')).toBe(true)
        expect(matchesFilter('labelled', 'todo')).toBe(true)
    })

    it('catches each status exactly once across the three chips', () => {
        for (const status of statuses) {
            const hits = (['todo', 'progress', 'done'] as const).filter((chip) =>
                matchesChip(status, chip),
            )
            expect(hits).toHaveLength(1)
        }
    })

    it('agrees with queueCounts, which is what the chips display', () => {
        const counts = queueCounts(statuses)
        expect(statuses.filter((s) => matchesChip(s, 'done'))).toHaveLength(counts.done)
        expect(statuses.filter((s) => matchesChip(s, 'progress'))).toHaveLength(counts.progress)
        expect(statuses.filter((s) => matchesChip(s, 'todo'))).toHaveLength(counts.todo)
    })
})

describe('matchesFilter', () => {
    const statuses: QueueStatus[] = ['reviewed', 'seeded', 'editing', 'labelled', 'empty']

    it('passes everything under all', () => {
        expect(statuses.every((s) => matchesFilter(s, 'all'))).toBe(true)
    })

    it('shows every unreviewed image under To label', () => {
        expect(statuses.filter((s) => matchesFilter(s, 'todo'))).toEqual([
            'seeded',
            'editing',
            'labelled',
            'empty',
        ])
    })
})

describe('queueProgress', () => {
    /** Two numbers, because reporting one under the other's name is what read 0/22 on a live batch. */
    it('separates reviewed from annotated', () => {
        expect(queueProgress(['reviewed', 'labelled', 'seeded', 'empty'])).toEqual({
            reviewed: 1,
            annotated: 3,
            total: 4,
            percent: 25,
        })
    })

    it('is zero rather than NaN for an empty queue', () => {
        expect(queueProgress([])).toEqual({ reviewed: 0, annotated: 0, total: 0, percent: 0 })
    })
})
