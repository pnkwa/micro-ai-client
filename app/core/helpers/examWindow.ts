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
 * Does submitting this exam give the AI tool back?
 *
 * Mirrors the server's `AND (a.exam_closes_at IS NOT NULL OR s.id IS NULL)`: only an exam with NO
 * closing bound is released by handing it in. Where there is an end, that end is the release, and
 * the submission is irrelevant.
 *
 * Uses `time()` rather than testing the raw field so this agrees with `isExamOpen` on what counts
 * as a real bound: an unparseable value is no bound to either of them.
 */
export function releasesOnSubmit(exam: ExamWindowLike): boolean {
    return time(exam.exam_closes_at) === null
}

/**
 * The open exam blocking a student - the one to name and link to.
 *
 * A submission only takes an exam out of this list when the exam has no closing time. BE-ADR-022's
 * amendment of 2026-08-19 keeps the lock on a windowed exam for the whole window, submitted or not:
 * a student who finished early could otherwise photograph a classmate's slide, read the class off
 * it and pass it back. Filtering every submitted exam out here (which this did until that
 * amendment) left the student locked with nothing named and no way back to the exam.
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
        (exam) =>
            (!releasesOnSubmit(exam) || !submittedAssignmentIds.has(exam.id)) &&
            isExamOpen(exam, now),
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

/**
 * When does the student get the AI tool back? One sentence, to follow the "it is locked" notice.
 *
 * Split from the notice itself because the answer depends on the exam, and the two surfaces that
 * show it (the home banner and the wall on /image-detection) would otherwise each carry their own
 * copy of the rule - which is how the pre-amendment wording survived in three places at once.
 *
 * `closesAtText` is already formatted by the caller ("closes at 18:30", "closes Aug 19 at 09:00"),
 * so the sentence composes around it rather than formatting a date here.
 */
export function detectionReleaseText(
    exam: BlockingExamLike | null,
    closesAtText: string | null,
): string {
    // Cannot name the exam: say the thing that is true of every windowed exam, and promise nothing
    // about submitting.
    if (exam === null) return 'It returns when the exam closes.'
    if (releasesOnSubmit(exam)) return 'It returns once you submit.'
    if (closesAtText) return `It returns when the exam ${closesAtText}.`
    return 'It returns when the exam closes.'
}
