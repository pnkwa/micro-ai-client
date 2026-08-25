import { describe, it, expect } from 'vitest'
import {
    dueDateText,
    isAnswerFormLocked,
    isLateSubmission,
    submissionBadges,
} from './studentAssignmentStatus'

const at = (status: 'submitted' | 'graded' | 'rejected') => ({
    status,
    submitted_at: '2026-08-01T09:00:00.000Z',
})

describe('dueDateText', () => {
    it('formats a due date', () => {
        expect(dueDateText('2026-08-24T09:00:00.000Z', 'YYYY-MM-DD')).toBe('2026-08-24')
    })

    /**
     * A blank here is a decision, not missing data: an assignment with no deadline is one nothing
     * can be late for. A dash would read as a value that failed to load.
     */
    it('says "Never due" rather than a dash when there is no deadline', () => {
        expect(dueDateText(null)).toBe('Never due')
        expect(dueDateText(undefined)).toBe('Never due')
        expect(dueDateText('')).toBe('Never due')
    })
})

describe('isLateSubmission', () => {
    const at = (iso: string) => ({ status: 'submitted' as const, submitted_at: iso })

    it('compares instants, not calendar days', () => {
        const due = '2026-08-24T09:00:00.000Z'
        expect(isLateSubmission(at('2026-08-24T08:59:59.000Z'), due)).toBe(false)
        expect(isLateSubmission(at('2026-08-24T17:00:00.000Z'), due)).toBe(true)
    })

    /**
     * The grace period v0.7 makes expressible: `due_date < closes_at` means a submission between
     * the two LANDS and is late. Lateness is derived here and nowhere else - the server does not
     * store it and does not flag it (BE-ADR-033), it only enforces the hard window.
     */
    it('is late inside the grace period, which is the point of one', () => {
        // due Monday, closes Friday, handed in Wednesday
        expect(isLateSubmission(at('2026-08-26T12:00:00.000Z'), '2026-08-24T09:00:00.000Z')).toBe(
            true,
        )
    })

    it('is not late without a due date to be late against', () => {
        expect(isLateSubmission(at('2026-08-26T12:00:00.000Z'), null)).toBe(false)
        expect(isLateSubmission(at('2026-08-26T12:00:00.000Z'), undefined)).toBe(false)
    })

    /** Graded work stays late: the count of late submissions wants every one, not just ungraded. */
    it('does not care whether the work has since been graded', () => {
        const due = '2026-08-24T09:00:00.000Z'
        expect(
            isLateSubmission({ status: 'graded', submitted_at: '2026-08-25T09:00:00.000Z' }, due),
        ).toBe(true)
    })
})

describe('isAnswerFormLocked', () => {
    it('leaves the form open when nothing has been handed in', () => {
        expect(isAnswerFormLocked(null)).toBe(false)
        expect(isAnswerFormLocked(undefined)).toBe(false)
    })

    it('locks a submitted and a graded attempt', () => {
        expect(isAnswerFormLocked(at('submitted'))).toBe(true)
        expect(isAnswerFormLocked(at('graded'))).toBe(true)
    })

    // The bug this helper exists for: a returned exam stayed locked, so the student the
    // instructor had asked to redo it had no way back in (BE-ADR-019: re-submitting is the
    // only way out of `rejected`, and it replaces the row).
    it('reopens the form for a rejected attempt, so the student can redo it', () => {
        expect(isAnswerFormLocked(at('rejected'))).toBe(false)
    })
})

describe('submissionBadges', () => {
    // Both student forms show the returned banner off `status === 'rejected'`; this is the
    // same status driving the badge, and rejection is deliberately not muddled with lateness.
    it('reports a rejected attempt as Rejected alone, even when it was late', () => {
        expect(submissionBadges(at('rejected'), '2026-07-01T00:00:00.000Z')).toEqual([
            { label: 'Rejected', variant: 'danger' },
        ])
    })
})
