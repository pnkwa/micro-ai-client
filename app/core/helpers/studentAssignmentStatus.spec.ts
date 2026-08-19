import { describe, it, expect } from 'vitest'
import { isAnswerFormLocked, submissionBadges } from './studentAssignmentStatus'

const at = (status: 'submitted' | 'graded' | 'rejected') => ({
    status,
    submitted_at: '2026-08-01T09:00:00.000Z',
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
