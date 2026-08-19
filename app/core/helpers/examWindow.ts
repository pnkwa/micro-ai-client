/**
 * Which exam, if any, is the reason a student cannot use the AI tool.
 *
 * `GET /detections/availability` answers *whether* the tool is withheld and why in one word
 * (`exam_open`), which is all the server needs to say - it is the one enforcing BE-ADR-012. It does
 * not say WHICH exam, and a student reading "you have an exam open" with three classes enrolled has
 * nowhere to go with that. These functions re-derive the same rule over the two lists the student can
 * already read, purely so the notice can name the exam and link to it.
 *
 * MIRRORS `micro-ai-server/src/detections/exam-window.ts` (`isExamOpen`) and the
 * `studentHasOpenExam` query beside it, by hand and with no codegen. If the two ever disagree the
 * server still decides: the tool stays locked or unlocked exactly as the API says, and the worst a
 * drift here can do is name the wrong exam in a sentence, or fail to name one at all. That is why
 * this lives in the client and is allowed to be approximate - see `docs/cross-repo-contract.md` for
 * the seams where it would not be.
 */

/** Just the window fields, so this works on an exam list item or a full exam alike. */
export type ExamWindowLike = {
    exam_opens_at: string | null
    exam_closes_at: string | null
}

/** An exam list row, narrowed to what picking and naming one needs. */
export type BlockingExamLike = ExamWindowLike & {
    id: number
    class_id: number
    name: string
}

const time = (value: string | null): number | null => {
    if (!value) return null
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
}

/**
 * Is this exam's window open at `now`?
 *
 * Inclusive at both ends and unbounded where a bound is missing, matching the server: a student
 * submitting on the closing instant is still inside the window, so the tool is still withheld at
 * that instant.
 */
export function isExamOpen(exam: ExamWindowLike, now: Date): boolean {
    const opens = time(exam.exam_opens_at)
    const closes = time(exam.exam_closes_at)
    if (opens !== null && now.getTime() < opens) return false
    if (closes !== null && now.getTime() > closes) return false
    return true
}

/**
 * The open exam a student has not submitted - the one to name and link to.
 *
 * ANY submission row counts as submitted, whatever its status. The server's query joins on
 * `assignment_id`/`student_id` with no status filter, so a rejected submission releases the tool
 * there; treating it as unsubmitted here would name an exam the student can no longer be blocked by.
 *
 * Earliest closing time first, so when someone is somehow inside two windows at once they are
 * pointed at the one that runs out soonest. An exam with no closing time sorts last: it is not
 * running out.
 */
export function pickBlockingExam<T extends BlockingExamLike>(
    exams: T[],
    submittedAssignmentIds: ReadonlySet<number>,
    now: Date,
): T | null {
    const open = exams.filter(
        (exam) => !submittedAssignmentIds.has(exam.id) && isExamOpen(exam, now),
    )
    if (open.length === 0) return null

    return (
        open.sort((a, b) => {
            const ca = time(a.exam_closes_at) ?? Number.POSITIVE_INFINITY
            const cb = time(b.exam_closes_at) ?? Number.POSITIVE_INFINITY
            return ca - cb
        })[0] ?? null
    )
}
