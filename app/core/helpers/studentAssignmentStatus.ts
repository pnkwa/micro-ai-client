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
// Outlined red (not a solid destructive fill), matching the other status badges everywhere
// submissionBadges is shown - the submissions table, the student's feedback page.
const REJECTED: StatusBadge = { label: 'Rejected', variant: 'danger' }

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
 * Late = handed in after the deadline instant. due_date is a full ISO instant now (the
 * create/update form carries 'YYYY-MM-DDTHH:mm' local and assignmentService sends it as an
 * ISO instant), so this compares instants, not calendar days: an assignment due Jul 24 at
 * 09:00 marks a 17:00-same-day submission Late. This used to be a `'day'` comparison back
 * when due_date was a bare midnight date and any same-day hand-in counted as on time.
 *
 * A standalone predicate because lateness is a property of the submission independent of
 * whether it's been graded - the "Late Submissions" count wants every late one, including
 * those already graded, which submissionBadges reports as [Graded, Late].
 */
export function isLateSubmission(
    submission: SubmissionTiming,
    dueDate: string | null | undefined,
): boolean {
    return !!dueDate && dayjs(submission.submitted_at).isAfter(dayjs(dueDate))
}

/**
 * Whether the student's answer form stays LOCKED: their work is in and they cannot change it.
 *
 * A `rejected` submission is the one state that reopens it: staff handed the attempt back to be
 * redone, and re-submitting replaces the row (BE-ADR-019: there is no un-reject, the resubmit
 * IS the recovery path). `submitted` and `graded` both stay locked.
 *
 * Shared by StudentAssignmentForm and StudentExamForm because the rule was written inline in both
 * and they drifted: the assignment form reopened on a rejection and the exam form did not, so a
 * returned exam was a dead end for the student who had to redo it.
 */
export function isAnswerFormLocked(
    submission: Pick<SubmissionTiming, 'status'> | null | undefined,
): boolean {
    return !!submission && submission.status !== 'rejected'
}

/**
 * The badge(s) for a submission itself, for the submissions table, the grading header and
 * the student's feedback page - which previously printed the raw `status` enum with a
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
    // same way: the chance to submit has gone. Instant granularity, matching isLateSubmission
    // - due_date carries a real time-of-day deadline now, so "overdue" flips at that instant,
    // not at the following midnight.
    const pastDue = dayjs().isAfter(dayjs(assignment.due_date))
    if (pastDue || assignment.status === 'closed') {
        return [{ label: 'Overdue', variant: 'destructive' }]
    }
    return [{ label: 'New', variant: 'default' }]
}

export interface StudentStatus {
    // A literal union, not `string`: the submissions table builds its status filter from these,
    // so a new label here surfaces as a type error in that option list rather than a status no
    // filter can reach.
    label: 'Not submitted' | 'Overdue' | 'Submitted' | 'Late submission' | 'Rejected'
    variant: VariantType
}

/**
 * A student's *action* status as one outlined badge - deliberately orthogonal to the grade, which
 * studentGradeText renders separately. Nothing handed in reads a quiet grey "Not submitted" before
 * the deadline, a red "Overdue" after it; a submission reads by its timing ("Submitted" / "Late
 * submission") even once graded (grading isn't an action); a returned attempt is "Rejected".
 * Shared by the class list and the assignment header so the two can't drift.
 */
export function studentStatus(
    assignment: AssignmentTiming,
    submission: SubmissionTiming | null | undefined,
): StudentStatus {
    if (!submission) {
        const overdue =
            dayjs().isAfter(dayjs(assignment.due_date)) || assignment.status === 'closed'
        return overdue
            ? { label: 'Overdue', variant: 'danger' }
            : { label: 'Not submitted', variant: 'muted' }
    }
    if (submission.status === 'rejected') return { label: 'Rejected', variant: 'danger' }
    return isLateSubmission(submission, assignment.due_date)
        ? { label: 'Late submission', variant: 'warning' }
        : { label: 'Submitted', variant: 'info' }
}

/**
 * The grade for a graded submission, as the small "Graded: 2/5" line shown beneath the status
 * badge. Null until graded. `total` is whatever point total the caller has - the submission's
 * max_score on a list read, or the summed question points on a fully-loaded assignment.
 */
export function studentGradeText(
    submission: { status: string; score: number | null } | null | undefined,
    total: number | null | undefined,
): string | null {
    if (submission?.status !== 'graded') return null
    const earned = submission.score ?? 0
    return total != null ? `Graded: ${earned}/${total}` : `Graded: ${earned}`
}

/**
 * A student's running grade in a class, as the "18/25" in the roster's Grade column: points
 * earned over points possible, across graded work only.
 *
 * Only students with at least one graded submission come back from `GET /classes/:id/grades`, so
 * a missing entry means "nothing graded yet" rather than zero, and reads as a dash.
 *
 * Sits beside studentGradeText deliberately: that one formats a single submission's mark, this
 * one a class total. Keeping the two together is what stops them drifting into different shapes.
 */
export function classGradeText(
    grade: { earned: number; possible: number } | undefined | null,
): string {
    return grade ? `${grade.earned}/${grade.possible}` : '-'
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
