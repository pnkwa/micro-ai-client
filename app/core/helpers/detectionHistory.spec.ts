import { describe, expect, it } from 'vitest'
import {
    boxCount,
    canBrowseAllDetections,
    filterHistory,
    formatHistoryDate,
    historyClassLabel,
    historyClassOptions,
    recordClasses,
    sortNewestFirst,
    submitterName,
    withinDateRange,
    NO_FINDINGS,
    type HistoryRecord,
} from './detectionHistory'

const step = (predicted: string, boxes: number) => ({
    id: 1,
    step: 'detect',
    step_order: 0,
    predicted_class: predicted,
    confidence: 0.9,
    probs: [],
    labels: null,
    boxes: Array.from({ length: boxes }, (_, i) => ({
        id: i,
        label: predicted,
        confidence: 0.9,
        x: 0,
        y: 0,
        w: 0.1,
        h: 0.1,
        polygon: null,
    })),
    created_at: '2026-08-14T00:00:00.000Z',
})

const record = (over: Partial<HistoryRecord> = {}): HistoryRecord =>
    ({
        id: 1,
        source: 'upload',
        img_path: '/x.jpg',
        model: 'best__rtdetr_v2',
        steps: [step('BV', 3)],
        created_at: '2026-08-14T03:31:00.000Z',
        ...over,
    }) as HistoryRecord

describe('canBrowseAllDetections', () => {
    /**
     * Mirrors the `requiredRole === 'admin'` arm of middleware/auth.global.ts. If these drift,
     * the panel offers a scope toggle the API will 403 — or hides one it would have allowed.
     */
    it.each([
        ['staff', 'admin', true],
        ['staff', 'instructor', false],
        ['staff', undefined, false],
        ['student', 'admin', false],
        [undefined, 'admin', false],
        [undefined, undefined, false],
    ])('user_type=%s role=%s -> %s', (userType, role, expected) => {
        expect(canBrowseAllDetections(userType, role)).toBe(expected)
    })
})

describe('submitterName', () => {
    it('prefers the full name', () => {
        expect(
            submitterName(
                record({
                    creator: {
                        userID: 2,
                        firstname: 'Sara',
                        lastname: 'W',
                        email: 'a@b.c',
                        user_type: 'staff',
                    },
                } as Partial<HistoryRecord>),
            ),
        ).toBe('Sara W')
    })

    it('falls back to the email when the name is blank', () => {
        expect(
            submitterName(
                record({
                    creator: {
                        userID: 2,
                        firstname: '',
                        lastname: '',
                        email: 'a@b.c',
                        user_type: 'student',
                    },
                } as Partial<HistoryRecord>),
            ),
        ).toBe('a@b.c')
    })

    it('is null in the own-history scope, where there is no creator', () => {
        expect(submitterName(record())).toBeNull()
    })

    it('is null for an anonymous run', () => {
        expect(submitterName(record({ creator: null } as Partial<HistoryRecord>))).toBeNull()
    })
})

describe('boxCount', () => {
    it('sums across every step', () => {
        expect(boxCount(record({ steps: [step('BV', 3), step('fungus', 4)] }))).toBe(7)
    })

    it('is zero when nothing was found — a real answer, not a failure', () => {
        expect(boxCount(record({ steps: [step('none', 0)] }))).toBe(0)
    })
})

describe('recordClasses', () => {
    it('lists the classes in step order', () => {
        expect(recordClasses(record({ steps: [step('BV', 1), step('fungus', 1)] }))).toEqual([
            'BV',
            'fungus',
        ])
    })

    it('drops the "none" of a pass that found nothing', () => {
        expect(recordClasses(record({ steps: [step('BV', 1), step('none', 0)] }))).toEqual(['BV'])
    })
})

describe('sortNewestFirst', () => {
    it('orders newest first', () => {
        const out = sortNewestFirst([
            record({ id: 1, created_at: '2026-08-10T00:00:00.000Z' }),
            record({ id: 2, created_at: '2026-08-14T00:00:00.000Z' }),
            record({ id: 3, created_at: '2026-08-12T00:00:00.000Z' }),
        ])
        expect(out.map((r) => r.id)).toEqual([2, 3, 1])
    })

    it('does not mutate its input', () => {
        const input = [
            record({ id: 1, created_at: '2026-08-10T00:00:00.000Z' }),
            record({ id: 2, created_at: '2026-08-14T00:00:00.000Z' }),
        ]
        sortNewestFirst(input)
        expect(input.map((r) => r.id)).toEqual([1, 2])
    })
})

describe('formatHistoryDate', () => {
    it('is absolute, not relative', () => {
        const out = formatHistoryDate('2026-08-14T03:31:00.000Z')
        expect(out).toMatch(/14/)
        expect(out).toMatch(/Aug/)
        expect(out).toMatch(/2026/)
    })

    it('hands back an unparseable value rather than "Invalid Date"', () => {
        expect(formatHistoryDate('not-a-date')).toBe('not-a-date')
    })
})

describe('historyClassLabel', () => {
    it('is the same string the row prints as its title', () => {
        expect(historyClassLabel(record())).toBe('BV')
    })

    it('joins a multi-class run into one combined label, not two', () => {
        const multi = record({ steps: [step('VVC', 2), step('fungus', 4)] })
        expect(historyClassLabel(multi)).toBe('VVC, fungus')
    })

    it('files a run that called nothing under "No findings"', () => {
        expect(historyClassLabel(record({ steps: [step('none', 0)] }))).toBe(NO_FINDINGS)
        expect(historyClassLabel(record({ steps: [] }))).toBe(NO_FINDINGS)
    })
})

describe('historyClassOptions', () => {
    it('counts rows per label, commonest first', () => {
        const rows = [
            record({ id: 1 }),
            record({ id: 2 }),
            record({ id: 3, steps: [step('VVC', 1)] }),
            record({ id: 4, steps: [step('none', 0)] }),
        ]
        expect(historyClassOptions(rows)).toEqual([
            { label: 'BV', count: 2 },
            { label: NO_FINDINGS, count: 1 },
            { label: 'VVC', count: 1 },
        ])
    })

    /** Counts that summed to more than the list would read as a bug in the list, not the filter. */
    it('sums to the number of rows, never more', () => {
        const rows = [
            record({ id: 1 }),
            record({ id: 2, steps: [step('VVC', 1), step('fungus', 2)] }),
        ]
        const total = historyClassOptions(rows).reduce((n, o) => n + o.count, 0)
        expect(total).toBe(rows.length)
    })

    it('has nothing to offer for an empty list', () => {
        expect(historyClassOptions([])).toEqual([])
    })
})

describe('withinDateRange', () => {
    // Mid-afternoon, so "today" has hours on either side of it inside the same calendar day.
    const now = new Date(2026, 7, 17, 15, 0, 0)
    const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString()

    it('keeps everything when the range is "all"', () => {
        expect(withinDateRange(at(2020, 0, 1), 'all', now)).toBe(true)
    })

    it('counts whole local days, so this morning is still "today" by the afternoon', () => {
        expect(withinDateRange(at(2026, 7, 17, 8), 'today', now)).toBe(true)
    })

    it('excludes yesterday from "today" even when it is under 24 hours ago', () => {
        expect(withinDateRange(at(2026, 7, 16, 23), 'today', now)).toBe(false)
    })

    it('takes 7d as today plus the six days before it', () => {
        expect(withinDateRange(at(2026, 7, 11, 0), '7d', now)).toBe(true)
        expect(withinDateRange(at(2026, 7, 10, 23), '7d', now)).toBe(false)
    })

    it('takes 30d as today plus the twenty-nine days before it', () => {
        expect(withinDateRange(at(2026, 6, 19, 0), '30d', now)).toBe(true)
        expect(withinDateRange(at(2026, 6, 18, 23), '30d', now)).toBe(false)
    })

    it('drops an unparseable stamp rather than keeping it by accident', () => {
        expect(withinDateRange('not-a-date', 'today', now)).toBe(false)
    })
})

describe('filterHistory', () => {
    const now = new Date(2026, 7, 17, 15, 0, 0)
    const rows = [
        record({ id: 1, created_at: new Date(2026, 7, 17, 9).toISOString() }),
        record({ id: 2, created_at: new Date(2026, 7, 1, 9).toISOString() }),
        record({
            id: 3,
            steps: [step('VVC', 1)],
            created_at: new Date(2026, 7, 17, 10).toISOString(),
        }),
    ]

    it('is every row when nothing is asked for', () => {
        expect(filterHistory(rows, {}, now).map((r) => r.id)).toEqual([1, 2, 3])
    })

    it('narrows by class', () => {
        expect(filterHistory(rows, { classLabel: 'BV' }, now).map((r) => r.id)).toEqual([1, 2])
    })

    it('narrows by date', () => {
        expect(filterHistory(rows, { range: 'today' }, now).map((r) => r.id)).toEqual([1, 3])
    })

    it('applies both together, not either', () => {
        expect(
            filterHistory(rows, { classLabel: 'BV', range: 'today' }, now).map((r) => r.id),
        ).toEqual([1])
    })

    it('keeps the order it was given', () => {
        const reversed = [...rows].reverse()
        expect(filterHistory(reversed, {}, now).map((r) => r.id)).toEqual([3, 2, 1])
    })

    it('can legitimately match nothing', () => {
        expect(filterHistory(rows, { classLabel: 'nope' }, now)).toEqual([])
    })
})
