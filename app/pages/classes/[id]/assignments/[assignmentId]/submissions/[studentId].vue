<script setup lang="ts">
import { ArrowLeft, Check, X, MessageSquarePlus, Undo2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { submissionService, type GradingAnswer } from '~/services/submissionService'
import { assignmentService } from '~/services/assignmentService'
import { slideCollectionService } from '~/services/slideCollectionService'
import { submissionBadges } from '~/core/helpers/studentAssignmentStatus'
import { apiErrorMessage } from '~/core/helpers/error'
import { useSubmissionDetail } from '~/core/composables/useSubmissionDetail'

// Grading is instructor work end to end. Students read the same submission through
// /my-feedback, which renders McSubmissionAnswerCard without any of the controls below.
definePageMeta({ role: 'instructor' })

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()

const classId = computed(() => Number(route.params.id))
const assignmentId = computed(() => Number(route.params.assignmentId))
// The route folder is named [studentId], but the segment it actually carries is the
// SUBMISSION id; see AssignmentSubmissionsTab.vue's link (`row.original.id`).
const submissionId = computed(() => Number(route.params.studentId))

const {
    submission,
    isLoading,
    loadFailed,
    answerGroups,
    sectionTitles,
    imageUrls,
    imageErrors,
    totalPoints,
    load,
} = useSubmissionDetail(submissionId, assignmentId)

/**
 * THE SLIDE'S ANSWER KEY, for the one question type whose key is not on the question.
 *
 * A slide_identification answer grades against the SLIDE the student says they were at
 * (BE-ADR-011), so `question.accepted_answers` is empty by construction and the card had nothing
 * to show - leaving the grader to read a diagnosis with no idea what the right one was, then go
 * and look the slide up in the collection by hand.
 *
 * Two reads, because neither is on the grading payload: the assignment tree carries each
 * question's `image_question.slide_collection_id`, and the collection carries its slides with
 * their keys. Both are staff-only and both are cheap; they run once per grading page and only when
 * a slide answer is actually on it.
 *
 * Keyed by the CANONICAL label. A label the server could not normalize leaves `slide_number` null,
 * which is exactly the answer routed to a human - and there is nothing to look up for it, so the
 * card shows the raw text alone and says so rather than guessing at a slide.
 */
const slideKeys = ref<Record<string, string[]>>({})

const loadSlideKeys = async () => {
    const answers = answerGroups.value.flatMap((group) => group.items)
    if (!answers.some(({ answer }) => answer.question.type === 'slide_identification')) return
    try {
        const assignment = await assignmentService.getById(assignmentId.value)
        const collectionIds = new Set(
            assignment.sections
                .flatMap((section) => section.questions)
                .filter((question) => question.type === 'slide_identification')
                .map((question) => question.image_question?.slide_collection_id)
                .filter((id): id is number => typeof id === 'number'),
        )
        const keys: Record<string, string[]> = {}
        for (const id of collectionIds) {
            const collection = await slideCollectionService.getById(id)
            for (const slide of collection.slides) keys[slide.slide_number] = slide.accepted_answers
        }
        slideKeys.value = keys
    } catch {
        // The key is an aid, not the grade. A failure leaves the card as it was rather than
        // failing a page whose job is to let someone mark the work in front of them.
    }
}

const isSaving = ref(false)
const isRejecting = ref(false)
const rejectOpen = ref(false)
const rejectReason = ref('')

// Handed back from `submitted`, and from `graded` when the SYSTEM graded it (`graded_by` null).
// An exam with no review-bound answer finalizes itself at submit, so it never passes through
// `submitted` and this button would never appear for it - which is why exams looked as though they
// had no reject at all. A grade an instructor finalized is still regraded through the answers
// instead, and the server enforces the same split.
const canReject = computed(
    () =>
        submission.value?.status === 'submitted' ||
        (submission.value?.status === 'graded' && submission.value.graded_by === null),
)

interface Draft {
    is_correct: boolean | null
    points_awarded: number | null
    comment: string
}
const drafts = reactive<Record<number, Draft>>({})
const originalComments = reactive<Record<number, string>>({})
// Feedback starts collapsed (Google Forms-style "Add feedback" link) unless a comment
// already exists, in which case it opens so it isn't hidden.
const feedbackOpen = reactive<Record<number, boolean>>({})

const reload = () =>
    load((detail) => {
        for (const answer of detail.answers) {
            drafts[answer.question_id] = {
                is_correct: answer.is_correct ?? answer.auto_is_correct ?? null,
                points_awarded: answer.points_awarded ?? answer.auto_points ?? null,
                comment: answer.comment ?? '',
            }
            originalComments[answer.question_id] = answer.comment ?? ''
            feedbackOpen[answer.question_id] = !!answer.comment
        }
    })
await reload()
// After the answers are in: the lookup only fires when one of them is a slide question.
void loadSlideKeys()

/**
 * Where "back" goes: the exam page for an exam, the assignment page for an assignment.
 *
 * Grading is one route for both, under /assignments, because the page is identical either way.
 * The PARENT is not: an exam has its own page with the window, the slide collection and the
 * exam-shaped detail tab. Sending a grader back to /assignments/:examId used to render the exam
 * as a plain assignment, since GET /assignments/:id serves exams too, so nothing 404s and the
 * mistake is silent.
 */
const isExam = computed(() => submission.value?.assignment?.is_exam === true)
const parentPath = computed(
    () =>
        `/classes/${classId.value}/${isExam.value ? 'exams' : 'assignments'}/${assignmentId.value}`,
)

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs(() => {
    const s = submission.value
    return [
        { label: 'Classes', to: '/classes' },
        { label: s?.assignment?.class?.name ?? 'Class', to: `/classes/${classId.value}` },
        {
            label: s?.assignment?.name ?? (isExam.value ? 'Exam' : 'Assignment'),
            to: parentPath.value,
        },
        { label: 'Submission' },
    ]
})

const studentName = computed(() => {
    const s = submission.value?.student
    return s ? `${s.user.firstname} ${s.user.lastname}` : (submission.value?.student_id ?? '')
})

const previewScore = computed(() =>
    Object.values(drafts).reduce((sum, d) => sum + (d.points_awarded ?? 0), 0),
)

// Every objective answer (multiple_choice/fill_in) is always auto-graded, since gradeChoice
// and gradeFillIn never return null, so this only ever gates on an image_detection answer
// whose AI suggestion hasn't landed yet, catching exactly the case where reviewAnswer would
// silently clear needs_review on an answer nobody actually graded (points_awarded stays
// null → computeScore treats it as 0).
const allGraded = computed(() =>
    submission.value
        ? submission.value.answers.every((a) => drafts[a.question_id]?.is_correct !== null)
        : false,
)

// Lateness compares against the assignment this submission belongs to, which the detail
// payload carries alongside it (submissionBaseSchema.assignment).
const statusBadges = computed(() =>
    submission.value
        ? submissionBadges(submission.value, submission.value.assignment?.due_date)
        : [],
)

const formatDateTime = (date: string) => $dayjs(date).format('MMM D, YYYY HH:mm')

/**
 * The correct/incorrect toggle owns the points too. The submission score is Σ
 * points_awarded server-side (computeScore, ADR-005) and ignores is_correct entirely, so
 * setting only the flag produced an answer the page tinted green and the gradebook scored
 * as zero. Overwrites unconditionally: type a partial-credit value afterwards and it
 * stands until the toggle is touched again.
 */
const markAnswer = (answer: GradingAnswer, isCorrect: boolean) => {
    const draft = drafts[answer.question_id]
    if (!draft) return
    draft.is_correct = isCorrect
    draft.points_awarded = isCorrect ? answer.question.points : 0
}

// Response-box tint: green once marked correct, red once marked incorrect, neutral while
// ungraded, the Google Forms "quiz" review look.
const responseBoxClass = (questionId: number): string => {
    const state = drafts[questionId]?.is_correct
    if (state === true) return 'tw:border-success/40 tw:bg-success/5'
    if (state === false) return 'tw:border-danger/40 tw:bg-danger/5'
    // Neutral while undecided, `needs_review` included: the box carries the GRADER's verdict, and
    // colouring it for an answer nobody has judged yet says the system reached one. That state is
    // carried by the "Needs your review" chip in the header instead.
    return 'tw:border-navy-15 tw:bg-navy-10/20'
}

const saveGrade = async () => {
    if (!submission.value) return
    isSaving.value = true
    try {
        for (const answer of submission.value.answers) {
            const draft = drafts[answer.question_id]
            if (!draft) continue
            const body: Parameters<typeof submissionService.reviewAnswer>[2] = {
                is_correct: draft.is_correct ?? undefined,
                points_awarded: draft.points_awarded ?? undefined,
            }
            // Only send `comment` when it actually changed; omitting it leaves the existing
            // value untouched server-side, and sending it always would let a grader
            // adjusting one answer's score silently blank out a comment on another.
            if (draft.comment !== originalComments[answer.question_id]) {
                body.comment = draft.comment.trim() === '' ? null : draft.comment
            }
            await submissionService.reviewAnswer(submission.value.id, answer.question_id, body)
        }
        // Computes and persists the total score and flips status to graded, which is also
        // what makes the result visible to the student. Reviewing every answer first (just
        // above) is what lets this succeed; the server rejects it otherwise.
        await submissionService.finalize(submission.value.id)
        toast.success('Grade saved')
        await reload()
    } catch (e) {
        toast.error(apiErrorMessage(e, 'Failed to save grade'))
    } finally {
        isSaving.value = false
    }
}

// Hand the submission back to the student to redo. The reason is required (the button below
// stays disabled until it's non-empty) and shown to the student on their feedback page. On
// success we leave the grading page - there's nothing left to grade here.
const rejectSubmission = async () => {
    if (!submission.value || rejectReason.value.trim() === '') return
    isRejecting.value = true
    try {
        await submissionService.reject(submission.value.id, rejectReason.value.trim())
        rejectOpen.value = false
        toast.success('Submission returned to the student')
        router.push({ path: parentPath.value, query: { tab: 'submissions' } })
    } catch (e) {
        toast.error(apiErrorMessage(e, 'Failed to reject submission'))
    } finally {
        isRejecting.value = false
    }
}
</script>

<template>
    <div class="tw:mx-auto tw:flex tw:w-full tw:max-w-3xl tw:flex-col tw:gap-4">
        <button
            class="tw:flex tw:items-center tw:gap-1.5 tw:text-navy-60 tw:hover:text-primary tw:transition-colors tw:text-sm tw:self-start"
            @click="router.push({ path: parentPath, query: { tab: 'submissions' } })"
        >
            <ArrowLeft class="tw:w-4 tw:h-4" />
            Back to Submissions
        </button>

        <div v-if="isLoading" class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60">
            Loading…
        </div>

        <div v-else-if="loadFailed || !submission" class="tw:text-center tw:py-16 tw:text-navy-60">
            Submission not found.
        </div>

        <template v-else>
            <div
                class="tw:flex tw:items-center tw:justify-between tw:bg-white tw:border tw:border-navy-10 tw:rounded-xl tw:px-6 tw:py-5"
            >
                <div>
                    <div class="tw:flex tw:items-center tw:gap-2">
                        <span class="tw:font-semibold tw:text-navy-100">{{ studentName }}</span>
                        <span class="tw:text-xs tw:text-navy-40">{{ submission.student_id }}</span>
                        <McBadge v-for="b in statusBadges" :key="b.label" :variant="b.variant">
                            {{ b.label }}
                        </McBadge>
                    </div>
                    <p class="tw:text-xs tw:text-navy-50 tw:mt-0.5">
                        {{ submission.assignment?.name }}, submitted
                        {{ formatDateTime(submission.submitted_at) }}
                    </p>
                </div>
                <div class="tw:text-right">
                    <span class="tw:text-lg tw:font-bold tw:text-primary">
                        {{ previewScore }} / {{ totalPoints }}
                    </span>
                    <p class="tw:text-[11px] tw:text-navy-40">
                        {{
                            submission.status === 'graded'
                                ? 'final score'
                                : 'preview, not saved yet'
                        }}
                    </p>
                </div>
            </div>

            <template v-for="group in answerGroups" :key="group.sectionId">
                <div class="tw:flex tw:items-center tw:gap-2.5">
                    <span
                        class="tw:flex tw:size-6 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary/10 tw:text-xs tw:font-semibold tw:text-primary"
                    >
                        {{ group.sectionIndex + 1 }}
                    </span>
                    <span class="tw:text-sm tw:font-semibold tw:text-navy-90">
                        {{ sectionTitles[group.sectionId] ?? `Section ${group.sectionIndex + 1}` }}
                    </span>
                    <div class="tw:h-px tw:flex-1 tw:bg-navy-10"></div>
                </div>

                <McSubmissionAnswerCard
                    v-for="{ answer, qIndex } in group.items"
                    :key="answer.question_id"
                    :answer="answer"
                    :label="`${group.sectionIndex + 1}.${qIndex + 1}`"
                    :image-url="imageUrls[answer.question_id]"
                    :image-error="imageErrors[answer.question_id]"
                    :tint-class="responseBoxClass(answer.question_id)"
                    :highlight="drafts[answer.question_id]?.is_correct === null"
                    :slide-answer-key="
                        answer.slide_number ? slideKeys[answer.slide_number] : undefined
                    "
                    show-answer-key
                    show-review-flag
                >
                    <template #points>
                        <label
                            class="tw:shrink-0 tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-navy-50"
                        >
                            <input
                                v-model.number="drafts[answer.question_id]!.points_awarded"
                                type="number"
                                min="0"
                                :max="answer.question.points"
                                class="tw:w-14 tw:appearance-none tw:rounded-md tw:border tw:border-navy-20 tw:px-2 tw:py-1 tw:text-right tw:text-sm tw:text-navy-90 tw:transition-colors tw:outline-none tw:focus:border-primary tw:focus:ring-2 tw:focus:ring-primary/20 tw:[&::-webkit-inner-spin-button]:appearance-none tw:[&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <span>/ {{ answer.question.points }} pt</span>
                        </label>
                    </template>

                    <template #marks>
                        <button
                            type="button"
                            aria-label="Mark correct"
                            class="tw:flex tw:size-7 tw:items-center tw:justify-center tw:rounded-full tw:border tw:transition-colors"
                            :class="
                                drafts[answer.question_id]?.is_correct === true
                                    ? 'tw:border-success tw:bg-success tw:text-white'
                                    : 'tw:border-navy-20 tw:bg-white tw:text-navy-40 tw:hover:border-success tw:hover:text-success'
                            "
                            @click="markAnswer(answer, true)"
                        >
                            <Check class="tw:size-4" />
                        </button>
                        <button
                            type="button"
                            aria-label="Mark incorrect"
                            class="tw:flex tw:size-7 tw:items-center tw:justify-center tw:rounded-full tw:border tw:transition-colors"
                            :class="
                                drafts[answer.question_id]?.is_correct === false
                                    ? 'tw:border-danger tw:bg-danger tw:text-white'
                                    : 'tw:border-navy-20 tw:bg-white tw:text-navy-40 tw:hover:border-danger tw:hover:text-danger'
                            "
                            @click="markAnswer(answer, false)"
                        >
                            <X class="tw:size-4" />
                        </button>
                    </template>

                    <template #footer>
                        <button
                            v-if="!feedbackOpen[answer.question_id]"
                            type="button"
                            class="tw:flex tw:w-fit tw:items-center tw:gap-1.5 tw:text-xs tw:font-medium tw:text-navy-50 tw:transition-colors tw:hover:text-primary"
                            @click="feedbackOpen[answer.question_id] = true"
                        >
                            <MessageSquarePlus class="tw:size-3.5" />
                            Add feedback
                        </button>
                        <div
                            v-else
                            class="tw:flex tw:flex-col tw:gap-1.5 tw:border-t tw:border-navy-10 tw:pt-3"
                        >
                            <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                                Feedback
                            </label>
                            <McTextarea
                                v-model="drafts[answer.question_id]!.comment"
                                placeholder="Feedback for the student…"
                                class="tw:text-sm"
                                :rows="2"
                            />
                        </div>
                    </template>
                </McSubmissionAnswerCard>
            </template>

            <div class="tw:flex tw:items-center tw:gap-3">
                <McButton
                    v-if="canReject"
                    variant="outline"
                    class="tw:text-danger tw:border-danger/40 tw:hover:bg-danger/5"
                    @click="rejectOpen = true"
                >
                    <Undo2 class="tw:size-4" />
                    Reject &amp; return
                </McButton>
                <div class="tw:flex tw:flex-1 tw:items-center tw:justify-end tw:gap-3">
                    <p v-if="!allGraded" class="tw:text-xs tw:text-warning">
                        Mark every highlighted answer Correct or Incorrect before saving.
                    </p>
                    <McButton :disabled="!allGraded" :loading="isSaving" @click="saveGrade">
                        Save Grade
                    </McButton>
                </div>
            </div>
        </template>

        <!-- Reject: hand the submission back with a reason the student will read. Not a
             ConfirmDialog because the reason is a required free-text input, not a yes/no. -->
        <McDialog :open="rejectOpen" @update:open="rejectOpen = $event">
            <McDialogContent class="tw:sm:max-w-md">
                <McDialogHeader>
                    <McDialogTitle>Reject &amp; return submission</McDialogTitle>
                    <McDialogDescription>
                        The student will see this reason and can submit again. This does not grade
                        the work.
                    </McDialogDescription>
                </McDialogHeader>
                <div class="tw:flex tw:flex-col tw:gap-1.5">
                    <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                        Reason for the student
                    </label>
                    <McTextarea
                        v-model="rejectReason"
                        placeholder="e.g. The field-of-view photo is out of focus - please re-photograph and resubmit."
                        class="tw:text-sm"
                        :rows="3"
                    />
                </div>
                <McDialogFooter>
                    <McButton variant="outline" type="button" @click="rejectOpen = false">
                        Cancel
                    </McButton>
                    <McButton
                        variant="destructive"
                        type="button"
                        :loading="isRejecting"
                        :disabled="rejectReason.trim() === ''"
                        @click="rejectSubmission"
                    >
                        Reject &amp; return
                    </McButton>
                </McDialogFooter>
            </McDialogContent>
        </McDialog>
    </div>
</template>
