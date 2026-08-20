import { examService } from '~/services/examService'
import { submissionService } from '~/services/submissionService'
import {
    detectionReleaseText,
    pickBlockingExam,
    type BlockingExamLike,
} from '~/core/helpers/examWindow'

/**
 * The exam that is withholding the AI detection tool from this student, if one is.
 *
 * `useDetectionAvailability` already knows the tool is withheld and why (`exam_open`). This answers
 * the follow-up question a student actually has - *which* exam, and where is it - so the lock can be
 * explained at the door instead of being something they work out by opening classes one at a time.
 * It also owns the sentence saying WHEN the tool comes back, because that answer depends on the
 * exam: since BE-ADR-022's amendment of 2026-08-19 a windowed exam holds the lock even after the
 * student submits, and only an exam with no closing time is released by handing it in.
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
    const { $dayjs } = useNuxtApp()

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

    /** "closes at 18:30" / "closes Aug 19 at 09:00" - the near case is the one a student watches. */
    const closesAtText = computed(() => {
        const closes = exam.value?.exam_closes_at
        if (!closes) return null
        const at = $dayjs(closes)
        return at.isSame($dayjs(), 'day')
            ? `closes at ${at.format('HH:mm')}`
            : `closes ${at.format('MMM D')} at ${at.format('HH:mm')}`
    })

    /** The "you get it back when..." sentence, in one place so the two surfaces cannot drift. */
    const releaseText = computed(() => detectionReleaseText(exam.value, closesAtText.value))

    /** For the moment the tool comes back: the exam that was blocking it no longer is. */
    const clear = () => {
        exam.value = null
        lastCheckedAt.value = 0
    }

    return { exam, path, closesAtText, releaseText, isLoading, refresh, clear }
}
