import { examService } from '~/services/examService'
import { submissionService } from '~/services/submissionService'
import { pickBlockingExam, type BlockingExamLike } from '~/core/helpers/examWindow'

/**
 * The exam that is withholding the AI detection tool from this student, if one is.
 *
 * `useDetectionAvailability` already knows the tool is withheld and why (`exam_open`). This answers
 * the follow-up question a student actually has - *which* exam, and where is it - so the lock can be
 * explained at the door instead of being something they work out by opening classes one at a time.
 * That was the whole complaint: the tool unlocked once you found the exam and submitted it, and
 * nothing on the way in said that was what it wanted.
 *
 * Derived from two lists the student can already read (`GET /exams`, `GET /submissions`) and the same
 * window rule the server uses - see `~/core/helpers/examWindow`. NOT a gate: the server decides, and
 * a null here means "we cannot name it", never "you are not blocked". Every failure is silent for
 * that reason; an explanation that cannot be produced is not worth a toast.
 *
 * STATE IS SHARED (useState), like the availability it explains: the home page and the detection page
 * both want the same answer, and asking twice for it would be two pairs of requests for one fact.
 */

/** Matches the availability composable's throttle: neither answer changes faster than an exam does. */
const MIN_REFRESH_GAP_MS = 15_000

export function useBlockingExam() {
    const exam = useState<BlockingExamLike | null>('blocking-exam', () => null)
    const lastCheckedAt = useState('blocking-exam-checked-at', () => 0)
    const isLoading = useState('blocking-exam-loading', () => false)

    const authStore = useAuth()

    /** Where the student goes to deal with it. Null when there is nothing to point at. */
    const path = computed(() =>
        exam.value ? `/classes/${exam.value.class_id}/exams/${exam.value.id}` : null,
    )

    const refresh = async ({ force = false } = {}) => {
        // Staff are never blocked (BE-ADR-012), so there is never an exam to name for them.
        if (authStore.user?.user_type === 'staff') {
            exam.value = null
            return
        }

        if (isLoading.value) return
        if (!force && Date.now() - lastCheckedAt.value < MIN_REFRESH_GAP_MS) return

        isLoading.value = true
        try {
            const [exams, submissions] = await Promise.all([
                examService.listMine(),
                submissionService.list(),
            ])
            exam.value = pickBlockingExam(
                exams,
                new Set(submissions.map((s) => s.assignment_id)),
                new Date(),
            )
            lastCheckedAt.value = Date.now()
        } catch {
            // Silent, and specifically NOT clearing a previous answer: a flaky request should not
            // retract an explanation that was true a moment ago.
        } finally {
            isLoading.value = false
        }
    }

    /** For the moment the tool comes back: the exam that was blocking it no longer is. */
    const clear = () => {
        exam.value = null
        lastCheckedAt.value = 0
    }

    return { exam, path, isLoading, refresh, clear }
}
