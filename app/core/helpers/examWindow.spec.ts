import { describe, expect, it } from 'vitest'
import {
    detectionReleaseText,
    isExamOpen,
    pickBlockingExam,
    releasesOnSubmit,
    type BlockingExamLike,
} from './examWindow'

const at = (iso: string) => new Date(iso)

const exam = (over: Partial<BlockingExamLike> = {}): BlockingExamLike => ({
    id: 1,
    class_id: 7,
    name: 'Midterm',
    exam_opens_at: '2026-08-18T09:00:00.000Z',
    exam_closes_at: '2026-08-18T11:00:00.000Z',
    ...over,
})

const none = new Set<number>()

describe('isExamOpen', () => {
    it('is closed before the window and open inside it', () => {
        expect(isExamOpen(exam(), at('2026-08-18T08:59:59.000Z'))).toBe(false)
        expect(isExamOpen(exam(), at('2026-08-18T10:00:00.000Z'))).toBe(true)
    })

    it('is closed after the window', () => {
        expect(isExamOpen(exam(), at('2026-08-18T11:00:01.000Z'))).toBe(false)
    })

    /** The server is inclusive at both ends, so a student on the boundary is still inside. */
    it('includes both boundary instants', () => {
        expect(isExamOpen(exam(), at('2026-08-18T09:00:00.000Z'))).toBe(true)
        expect(isExamOpen(exam(), at('2026-08-18T11:00:00.000Z'))).toBe(true)
    })

    it('treats a missing bound as unbounded', () => {
        const noClose = exam({ exam_closes_at: null })
        expect(isExamOpen(noClose, at('2036-01-01T00:00:00.000Z'))).toBe(true)

        const noOpen = exam({ exam_opens_at: null })
        expect(isExamOpen(noOpen, at('1999-01-01T00:00:00.000Z'))).toBe(true)

        const unbounded = exam({ exam_opens_at: null, exam_closes_at: null })
        expect(isExamOpen(unbounded, at('2026-08-18T10:00:00.000Z'))).toBe(true)
    })

    /** A malformed date must not read as "open forever" through a NaN comparison. */
    it('ignores an unparseable bound rather than blocking on it', () => {
        expect(isExamOpen(exam({ exam_opens_at: 'not a date' }), at('2026-08-18T10:00:00Z'))).toBe(
            true,
        )
        expect(isExamOpen(exam({ exam_closes_at: 'not a date' }), at('2036-01-01T00:00:00Z'))).toBe(
            true,
        )
    })
})

describe('pickBlockingExam', () => {
    const now = at('2026-08-18T10:00:00.000Z')

    it('finds the open, unsubmitted exam', () => {
        expect(pickBlockingExam([exam()], none, now)?.id).toBe(1)
    })

    it('is null when there are no exams at all', () => {
        expect(pickBlockingExam([], none, now)).toBeNull()
    })

    it('ignores an exam whose window is not open', () => {
        const later = exam({ id: 2, exam_opens_at: '2026-08-19T09:00:00.000Z' })
        expect(pickBlockingExam([later], none, now)).toBeNull()
    })

    /**
     * The case that used to be wrong. Submitting stopped releasing the tool on 2026-08-19
     * (BE-ADR-022, amended), so filtering the exam out here left the student locked with nothing
     * named and no way back to the exam.
     */
    it('still names a windowed exam the student has already submitted', () => {
        expect(pickBlockingExam([exam()], new Set([1]), now)?.id).toBe(1)
    })

    /** The anti-lockout valve: with no end, handing it in IS the release, so it blocks no longer. */
    it('drops a submitted exam that has no closing time', () => {
        const openEnded = exam({ exam_closes_at: null })
        expect(pickBlockingExam([openEnded], new Set([1]), now)).toBeNull()
        expect(pickBlockingExam([openEnded], none, now)?.id).toBe(1)
    })

    it('picks the one closing soonest', () => {
        const late = exam({ id: 1, exam_closes_at: '2026-08-18T18:00:00.000Z' })
        const soon = exam({ id: 2, exam_closes_at: '2026-08-18T10:30:00.000Z' })
        expect(pickBlockingExam([late, soon], none, now)?.id).toBe(2)
    })

    /** An exam with no closing time is not running out, so it never outranks one that is. */
    it('sorts an open-ended exam last', () => {
        const openEnded = exam({ id: 1, exam_closes_at: null })
        const closing = exam({ id: 2, exam_closes_at: '2026-08-18T23:00:00.000Z' })
        expect(pickBlockingExam([openEnded, closing], none, now)?.id).toBe(2)
    })

    it('does not mutate the callers array order', () => {
        const late = exam({ id: 1, exam_closes_at: '2026-08-18T18:00:00.000Z' })
        const soon = exam({ id: 2, exam_closes_at: '2026-08-18T10:30:00.000Z' })
        const input = [late, soon]
        pickBlockingExam(input, none, now)
        expect(input.map((e) => e.id)).toEqual([1, 2])
    })
})

describe('releasesOnSubmit', () => {
    it('is true only when the exam has no closing bound', () => {
        expect(releasesOnSubmit(exam())).toBe(false)
        expect(releasesOnSubmit(exam({ exam_closes_at: null }))).toBe(true)
    })

    /** Same rule isExamOpen uses: a bound it cannot parse is no bound at all. */
    it('treats an unparseable closing time as no bound', () => {
        expect(releasesOnSubmit(exam({ exam_closes_at: 'not a date' }))).toBe(true)
    })
})

describe('detectionReleaseText', () => {
    it('promises nothing about submitting when the exam cannot be named', () => {
        expect(detectionReleaseText(null, null)).toBe('It returns when the exam closes.')
    })

    it('names the closing time when there is one', () => {
        expect(detectionReleaseText(exam(), 'closes at 18:30')).toBe(
            'It returns when the exam closes at 18:30.',
        )
    })

    it('falls back to the plain sentence when the time was not formatted', () => {
        expect(detectionReleaseText(exam(), null)).toBe('It returns when the exam closes.')
    })

    /** The valve case, and the only one where submitting is still the answer. */
    it('says submitting releases an exam with no closing time', () => {
        expect(detectionReleaseText(exam({ exam_closes_at: null }), null)).toBe(
            'It returns once you submit.',
        )
    })
})
