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
export type StatusBadge = {
    label: 'New' | 'Overdue' | 'Submitted' | 'Late' | 'Graded' | 'Rejected'
    variant: VariantType
}

const GRADED: StatusBadge = { label: 'Graded', variant: 'success' }
const LATE: StatusBadge = { label: 'Late', variant: 'warning' }
const SUBMITTED: StatusBadge = { label: 'Submitted', variant: 'info' }
const REJECTED: StatusBadge = { label: 'Rejected', variant: 'destructive' }

/** Only the fields the rule reads, so this works on both Assignment and AssignmentListItem. */
type AssignmentTiming = {
    due_date: string
    status: 'active' | 'closed'
}

/** The fields lateness needs, so this works on SubmissionView and SubmissionDetail alike. */
type SubmissionTiming = {
    status: 'submitted' | 'graded' | 'rejected'
    submitted_at: string
}

/**
 * Day granularity, matching the Overdue check: due_date carries no time, so anything handed
 * in during the due day is on time. Comparing instants would make a 9am submission on the
 * due date "late" against a midnight-parsed deadline.
 *
 * A standalone predicate because lateness is a property of the submission independent of
 * whether it's been graded — the "Late Submissions" count wants every late one, including
 * those already graded, which submissionBadges reports as [Graded, Late].
 */
export function isLateSubmission(
    submission: SubmissionTiming,
    dueDate: string | null | undefined,
): boolean {
    return !!dueDate && dayjs(submission.submitted_at).isAfter(dayjs(dueDate), 'day')
}

/**
 * The badge(s) for a submission itself, for the submissions table, the grading header and
 * the student's feedback page — which previously printed the raw `status` enum with a
 * capitalize class and so could never say "Late".
 *
 * Usually one badge; a late submission that's since been graded gets two, [Graded, Late], so
 * neither the outcome nor the lateness is lost. An ungraded late one is just [Late] (Late
 * already implies the work is in), and an on-time one its single primary status.
 */
export function submissionBadges(
    submission: SubmissionTiming,
    dueDate: string | null | undefined,
): StatusBadge[] {
    const late = isLateSubmission(submission, dueDate)
    // Rejected trumps lateness: the work was handed back to redo, so "Late" would only
    // muddle what the student has to act on.
    if (submission.status === 'rejected') return [REJECTED]
    if (submission.status === 'graded') return late ? [GRADED, LATE] : [GRADED]
    if (late) return [LATE]
    // Submitted but not released. Grading is saved incrementally, so a submission can
    // already hold partial marks; they're deliberately withheld until it's finalized, which
    // means there is nothing more to tell the student yet.
    return [SUBMITTED]
}

/**
 * A student's standing on one assignment, for the header pill and the class list.
 *
 * The assignment's own Active/Closed says nothing about what the student owes, and reads as
 * "nothing to do here" on work they haven't started. Once work is in, this defers to
 * submissionBadges (so a late-graded assignment reads Graded + Late); before then it's a
 * single New/Overdue.
 */
export function studentAssignmentBadges(
    assignment: AssignmentTiming,
    submission: SubmissionView | null | undefined,
): StatusBadge[] {
    if (submission) return submissionBadges(submission, assignment.due_date)

    // Nothing handed in. A closed assignment is as shut as a past-due one, so both read the
    // same way: the chance to submit has gone.
    const pastDue = dayjs().isAfter(dayjs(assignment.due_date), 'day')
    if (pastDue || assignment.status === 'closed') {
        return [{ label: 'Overdue', variant: 'destructive' }]
    }
    return [{ label: 'New', variant: 'default' }]
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
