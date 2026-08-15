import { describe, expect, it } from 'vitest'
import {
    boxCount,
    canBrowseAllDetections,
    formatHistoryDate,
    recordClasses,
    sortNewestFirst,
    submitterName,
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
