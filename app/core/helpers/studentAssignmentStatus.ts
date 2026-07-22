import dayjs from 'dayjs'
import type { VariantType } from '~/core/helpers/variants'
import type { SubmissionView } from '~/services/submissionService'

/**
 * Where a student stands on one assignment, for the header pill and the class list.
 *
 * The assignment's own Active/Closed says nothing about what the student owes, and reads
 * as "nothing to do here" on work they haven't started. These four describe the student
 * instead. Shared so the two surfaces can't drift: the ordering below IS the rule.
 */
export type StudentAssignmentStatus = {
    label: 'New' | 'Overdue' | 'Submitted' | 'Graded'
    variant: VariantType
}

/** Only the fields the rule reads, so this works on both Assignment and AssignmentListItem. */
type AssignmentTiming = {
    due_date: string
    status: 'active' | 'closed'
}

export function studentAssignmentStatus(
    assignment: AssignmentTiming,
    submission: SubmissionView | null | undefined,
): StudentAssignmentStatus {
    // Most-settled first: once the work is in, the due date stops mattering.
    if (submission?.status === 'graded') return { label: 'Graded', variant: 'success' }
    // Submitted but not released. Grading is saved incrementally, so a submission can
    // already hold partial marks; they're deliberately withheld until it's finalized,
    // which means there is nothing more to tell the student yet.
    if (submission) return { label: 'Submitted', variant: 'info' }

    // Nothing handed in. A closed assignment is as shut as a past-due one, so both read
    // the same way: the chance to submit has gone.
    const pastDue = dayjs().isAfter(dayjs(assignment.due_date), 'day')
    if (pastDue || assignment.status === 'closed') {
        return { label: 'Overdue', variant: 'destructive' }
    }
    return { label: 'New', variant: 'default' }
}

/**
 * Index a student's submissions by assignment, for list views.
 *
 * `GET /submissions` ignores every filter for a student and returns all of their own rows
 * (submissions.service.ts, the UserType.Student branch), so one call covers a whole page of
 * assignments. Newest-first from the server, and a student can only submit once per
 * assignment, so first-write-wins needs no tie-breaking.
 */
export function indexSubmissionsByAssignment(
    submissions: SubmissionView[],
): Map<number, SubmissionView> {
    const byAssignment = new Map<number, SubmissionView>()
    for (const submission of submissions) {
        if (!byAssignment.has(submission.assignment_id)) {
            byAssignment.set(submission.assignment_id, submission)
        }
    }
    return byAssignment
}
