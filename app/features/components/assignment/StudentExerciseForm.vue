<script setup lang="ts">
import { Send, CheckCircle2, ImageUp, X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { useForm, useFieldArray } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import { detectionService } from '~/services/detectionService'
import { assignmentTotalPoints, type Assignment } from '~/services/assignmentService'
import { rejectUnusableImage } from '~/core/helpers/imageUpload'
import { normalizeSlideNumber } from '~/core/helpers/slideNumber'
import { isAnswerFormLocked } from '~/core/helpers/studentAssignmentStatus'

const props = defineProps<{
    assignment: Assignment
    /**
     * This student's existing submission for this assignment, or null if they haven't
     * handed anything in. Fetched by the page (which needs it for the header pill too) and
     * passed down, so the form and the pill can't disagree about whether the work is in.
     */
    mySubmission: SubmissionView | null
}>()
const emit = defineEmits<{ submitted: [] }>()

// Static display tree: the assignment's exercises/questions don't change during the
// session, only the student's answers do (those live in the vee-validate form below).
let flatIndex = 0
const exercises = props.assignment.exercises.map((ex, exIndex) => ({
    id: ex.id,
    title: ex.title,
    instructions: ex.instructions,
    exIndex,
    questions: ex.questions.map((q, qIndex) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        options: q.options,
        exIndex,
        qIndex,
        answerIndex: flatIndex++,
    })),
}))
type QuestionMeta = (typeof exercises)[number]['questions'][number]
const allQuestions = exercises.flatMap((e) => e.questions)

const schema = z.object({
    answers: z.array(z.object({ selected: z.array(z.string()), text: z.string() })),
})
type FormValues = z.infer<typeof schema>

const { handleSubmit, values } = useForm<FormValues>({
    validationSchema: toTypedSchema(schema),
    initialValues: {
        answers: allQuestions.map(() => ({ selected: [], text: '' })),
    },
})
const { fields: answerFields, update: updateAnswer } = useFieldArray<{
    selected: string[]
    text: string
}>('answers')

// image_detection answers stay outside the vee-validate schema: files aren't schema values,
// they're appended to FormData directly.
const images = reactive<
    Record<number, { file: File | null; name: string; previewUrl: string | null }>
>({})

// Which questions failed the "required" check is type-dependent business logic, not
// something a single zod shape can express per-row, so it's tracked separately (same
// division of labor as QuestionForm.vue's manual post-handleSubmit checks).
/**
 * The self-reported slide label for a slide_identification question, keyed by question id.
 *
 * Outside the vee-validate schema, like `images`: that schema gives each question one `selected`
 * and one `text`, and a slide answer needs two strings (the label and the diagnosis). The
 * diagnosis takes `text`, which is what the payload already treats as free-text, and the label
 * lives here rather than widening the schema for one question type.
 */
const slideLabels = reactive<Record<number, string>>({})

const invalidIds = reactive(new Set<number>())

const submitting = ref(false)
// Locked out of answering: either they already had a submission on load, or they just made
// one. Tracked locally as well as via the prop so the confirmation panel appears the instant
// the POST returns, without waiting for the parent's refetch to come back.
// isAnswerFormLocked holds the REJECTED exception: staff handed it back to redo, so the form
// must reopen; re-submitting replaces the rejected row (one submission per student per
// assignment). Shared with StudentExamForm, which had the rule wrong until it was pulled out.
const submitted = ref(isAnswerFormLocked(props.mySubmission))

/**
 * Redoing a returned assignment: put back what they answered last time, and show the photos they
 * sent. Same rule as StudentExamForm, for the same reason: re-submitting REPLACES the row
 * (BE-ADR-019, there is no un-reject), so the attempt they were told to fix is gone the moment
 * they hand in again, and a blank form asks them to remember what they wrote.
 *
 * Answers go back through `updateAnswer` rather than the form's initialValues, because the
 * previous submission is fetched after the form is created. Photos are shown, NOT restored: a
 * browser cannot refill a file input from a URL, and a returned answer is often returned because
 * the image was the problem. Keyed off `image_id`, which survives the server's grade strip
 * (BE-ADR-027).
 */
const previousImageUrls = reactive<Record<number, string>>({})
/**
 * The image_id behind each preview, so a photo the student keeps can be re-sent at full size.
 * The preview URL is a thumb and must never be what gets submitted.
 */
const previousImageIds = reactive<Record<number, string>>({})
/** True once a previous attempt actually loaded, so the notice cannot claim a prefill that failed. */
const isRedo = ref(false)
const loadPreviousAttempt = async () => {
    const previous = props.mySubmission
    if (!previous || previous.status !== 'rejected') return
    try {
        const detail = await submissionService.getById(previous.id)
        const indexByQuestion = new Map(allQuestions.map((q) => [q.id, q.answerIndex]))
        for (const answer of detail.answers) {
            const index = indexByQuestion.get(answer.question_id)
            if (index !== undefined) {
                updateAnswer(index, {
                    selected: answer.selected_options ?? [],
                    text: answer.response_text ?? '',
                })
                // The raw label first: it is what they typed, and one the server could not
                // normalize is stored in that form only.
                slideLabels[answer.question_id] =
                    answer.slide_number_raw ?? answer.slide_number ?? ''
            }
            if (answer.image_id) {
                previousImageIds[answer.question_id] = answer.image_id
                previousImageUrls[answer.question_id] = await detectionService.imageBlobUrl(
                    answer.image_id,
                    'thumb',
                )
            }
        }
        isRedo.value = true
    } catch {
        // Silent, and deliberately not a toast: an empty form still works, and a failed prefill
        // must not read as a failed resubmit.
    }
}
onMounted(loadPreviousAttempt)

const isGraded = computed(() => props.mySubmission?.status === 'graded')
// Same derivation the grading page and the submissions table use: summed from the
// questions, never assignments.points (see assignmentTotalPoints).
const totalPoints = computed(() => assignmentTotalPoints(props.assignment))

const emptyAnswer = { selected: [] as string[], text: '' }
// Both arrays are built to the same length as allQuestions at init and only ever
// updated in place, so an out-of-range index can't happen; the fallback just satisfies
// noUncheckedIndexedAccess (same defensive style as QuestionForm.vue's optionFields access).
const answerValue = (i: number) => answerFields.value[i]?.value ?? emptyAnswer
const currentAnswer = (i: number) => values.answers[i] ?? emptyAnswer

/**
 * A photo question is answered by a NEW file or by the one the student already sent.
 *
 * Re-submitting replaces the row, so a kept photo is not merely displayed: it is re-uploaded on
 * submit (see below). Requiring a fresh file instead would mean a student whose work came back
 * over a wrong diagnosis had to re-photograph a slide they may no longer have.
 */
const hasPhoto = (q: QuestionMeta): boolean =>
    images[q.id]?.file != null || previousImageIds[q.id] != null

/** The photo the student kept, as a file to upload. Null when they attached a new one or none. */
const keptPhoto = async (questionId: number): Promise<File | null> => {
    const imageId = previousImageIds[questionId]
    if (!imageId) return null
    try {
        return await detectionService.imageFile(imageId)
    } catch {
        // Better to submit the rest than to fail the whole attempt over one image; the answer
        // arrives without a photo and goes to the instructor, which is where it was headed anyway.
        return null
    }
}

const isAnswered = (q: QuestionMeta): boolean => {
    if (q.type === 'fill_in') return currentAnswer(q.answerIndex).text.trim() !== ''
    if (q.type === 'image_detection') return hasPhoto(q)
    // A slide station is a label, a diagnosis AND a photo - the same three the exam requires,
    // because it is the same question and the same grading path.
    if (q.type === 'slide_identification') {
        return (
            (slideLabels[q.id]?.trim() ?? '') !== '' &&
            currentAnswer(q.answerIndex).text.trim() !== '' &&
            hasPhoto(q)
        )
    }
    return currentAnswer(q.answerIndex).selected.length > 0
}

const setChoice = (q: QuestionMeta, opt: string) => {
    updateAnswer(q.answerIndex, { selected: [opt], text: answerValue(q.answerIndex).text })
    invalidIds.delete(q.id)
}

const toggleSelect = (q: QuestionMeta, opt: string) => {
    const current = answerValue(q.answerIndex).selected
    const selected = current.includes(opt) ? current.filter((o) => o !== opt) : [...current, opt]
    updateAnswer(q.answerIndex, { selected, text: answerValue(q.answerIndex).text })
    invalidIds.delete(q.id)
}

const onImage = (q: QuestionMeta, e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0] ?? null

    // Rejected before it replaces anything, so swapping a good photo for an unusable one doesn't
    // lose the one that worked. Clearing the input lets the same file be picked again after it is
    // fixed, which the browser otherwise treats as "no change". Shared with the exam form.
    if (file) {
        const rejection = rejectUnusableImage(file)
        if (rejection) {
            toast.error(rejection.message)
            input.value = ''
            return
        }
    }

    const prev = images[q.id]
    if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
    images[q.id] = {
        file,
        name: file?.name ?? '',
        previewUrl: file ? URL.createObjectURL(file) : null,
    }
    if (file) invalidIds.delete(q.id)
}

const removeImage = (q: QuestionMeta) => {
    const prev = images[q.id]
    if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
    delete images[q.id]
}

// Preview URLs are only cleaned up as they're replaced/removed above; this catches
// whatever's still outstanding when the form itself goes away (e.g. leaving the page).
onBeforeUnmount(() => {
    for (const url of Object.values(previousImageUrls)) URL.revokeObjectURL(url)
    for (const entry of Object.values(images)) {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl)
    }
})

const onSubmit = handleSubmit(async (v) => {
    invalidIds.clear()
    let firstUnanswered: number | null = null
    for (const q of allQuestions) {
        if (!isAnswered(q)) {
            invalidIds.add(q.id)
            if (firstUnanswered === null) firstUnanswered = q.id
        }
    }
    if (firstUnanswered !== null) {
        toast.error('Please answer all required questions')
        document
            .getElementById(`question-${firstUnanswered}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
    }

    submitting.value = true
    try {
        const fd = new FormData()
        fd.append('assignment_id', String(props.assignment.id))
        const answers = allQuestions.map((q) => {
            const answer: {
                question_id: number
                response_text?: string
                selected_options?: string[]
                slide_number?: string | null
                slide_number_raw?: string | null
            } = { question_id: q.id }
            const answered = v.answers[q.answerIndex] ?? emptyAnswer
            if (q.type === 'fill_in') answer.response_text = answered.text.trim()
            else if (q.type === 'multiple_choice' || q.type === 'multiple_select')
                answer.selected_options = [...answered.selected]
            else if (q.type === 'slide_identification') {
                const typed = slideLabels[q.id]?.trim() ?? ''
                answer.response_text = answered.text.trim()
                // Normalized so the grade-time lookup matches the stored key whatever was typed;
                // the server normalizes again, so this is belt and braces, not trust.
                answer.slide_number = normalizeSlideNumber(typed)
                // The untouched entry too, so a label the pattern does not recognise reaches the
                // instructor as text rather than as a blank (BE-ADR-017).
                answer.slide_number_raw = typed || null
            }
            return answer
        })
        fd.append('answers', JSON.stringify(answers))
        for (const q of allQuestions) {
            if (q.type !== 'image_detection' && q.type !== 'slide_identification') continue
            const attached = images[q.id]?.file
            // Keyed the way the server's AnyFilesInterceptor expects. A previous photo the student
            // did not replace is refetched at full size and sent as their answer, because the
            // resubmit replaces the row and an answer with no file has no photo at all.
            const file = attached ?? (await keptPhoto(q.id))
            if (file) fd.append(`image_${q.id}`, file)
        }
        await submissionService.create(fd)
        submitted.value = true
        toast.success('Assignment submitted')
        emit('submitted')
    } catch (e) {
        toast.error(apiErrorMessage(e, 'Failed to submit assignment'))
    } finally {
        submitting.value = false
    }
})
</script>

<template>
    <div
        v-if="submitted"
        class="tw:flex tw:min-h-[calc(100vh-160px)] tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:border tw:border-primary/20 tw:bg-white tw:px-4 tw:py-16 tw:text-center"
    >
        <CheckCircle2 class="tw:size-10 tw:text-primary" />

        <template v-if="isGraded">
            <p class="tw:text-lg tw:font-semibold tw:text-navy-100">Your work has been graded</p>
            <p class="tw:text-3xl tw:font-bold tw:text-primary tw:tabular-nums">
                {{ mySubmission?.score ?? 0 }} / {{ totalPoints }}
            </p>
            <NuxtLink
                :to="`/classes/${assignment.class_id}/assignments/${assignment.id}/my-feedback`"
                class="tw:mt-2"
            >
                <McButton variant="outline" size="sm">View feedback</McButton>
            </NuxtLink>
        </template>

        <template v-else>
            <p class="tw:text-lg tw:font-semibold tw:text-navy-100">Your answers were submitted</p>
            <p class="tw:text-sm tw:text-navy-60">
                Your submission is final and can no longer be changed. Your score and feedback
                appear here once your instructor has graded it.
            </p>
        </template>
    </div>

    <div
        v-else-if="allQuestions.length === 0"
        class="tw:text-sm tw:text-navy-50 tw:py-8 tw:text-center"
    >
        No exercises yet.
    </div>

    <form v-else class="tw:flex tw:flex-col tw:gap-4" @submit.prevent="onSubmit">
        <!-- Reopened because staff returned the previous attempt. Lead with why, so the
             student knows what to fix before resubmitting. -->
        <div
            v-if="mySubmission?.status === 'rejected'"
            class="tw:bg-danger/5 tw:border tw:border-danger/30 tw:rounded-lg tw:px-4 tw:py-3"
        >
            <p class="tw:text-sm tw:font-semibold tw:text-danger">
                Your previous submission was returned
            </p>
            <p
                v-if="mySubmission.rejection_reason"
                class="tw:text-sm tw:text-navy-90 tw:mt-1 tw:whitespace-pre-line"
            >
                {{ mySubmission.rejection_reason }}
            </p>
            <!-- Here rather than per question: it is one fact about the whole form, and it belongs
                 with the reason the form reopened. Rendered off isRedo, which is set only once a
                 previous attempt actually loaded, so it never claims a prefill that failed. -->
            <p v-if="isRedo" class="tw:mt-2 tw:text-sm tw:text-navy-70">
                Your previous answers are filled in below, photos included.
                <span class="tw:font-medium tw:text-navy-90">
                    Those are resubmitted as they are unless you replace them.
                </span>
            </p>
        </div>

        <div
            v-for="ex in exercises"
            :key="ex.id"
            class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-lg tw:p-5"
        >
            <div class="tw:flex tw:items-start tw:gap-3 tw:mb-4">
                <span
                    class="tw:flex tw:size-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary/10 tw:text-sm tw:font-semibold tw:text-primary"
                >
                    {{ ex.exIndex + 1 }}
                </span>
                <div>
                    <p class="tw:font-semibold tw:text-lg tw:text-navy-100">{{ ex.title }}</p>
                    <p v-if="ex.instructions" class="tw:text-xs tw:text-navy-60 tw:mt-0.5">
                        {{ ex.instructions }}
                    </p>
                </div>
            </div>

            <div class="tw:flex tw:flex-col tw:gap-3">
                <div
                    v-for="q in ex.questions"
                    :id="`question-${q.id}`"
                    :key="q.id"
                    class="tw:rounded-lg tw:border tw:p-4 tw:transition-colors"
                    :class="
                        invalidIds.has(q.id)
                            ? 'tw:border-danger/50 tw:bg-danger/5'
                            : 'tw:border-navy-15'
                    "
                >
                    <div class="tw:flex tw:items-start tw:gap-2">
                        <span class="tw:text-sm tw:font-semibold tw:text-navy-60 tw:tabular-nums">
                            {{ q.exIndex + 1 }}.{{ q.qIndex + 1 }}
                        </span>
                        <p class="tw:text-navy-100 tw:font-medium">
                            {{ q.prompt }}
                            <span class="tw:text-danger" aria-label="required">*</span>
                        </p>
                    </div>

                    <!-- multiple_choice: radios -->
                    <div
                        v-if="q.type === 'multiple_choice'"
                        class="tw:mt-3 tw:flex tw:flex-col tw:gap-1.5"
                    >
                        <label
                            v-for="opt in q.options"
                            :key="opt"
                            class="tw:flex tw:items-center tw:gap-2.5 tw:rounded-md tw:px-2 tw:py-1.5 tw:cursor-pointer tw:hover:bg-navy-10/40"
                        >
                            <input
                                type="radio"
                                :name="`q-${q.id}`"
                                :value="opt"
                                :checked="answerValue(q.answerIndex).selected[0] === opt"
                                class="tw:size-4 tw:accent-primary"
                                @change="setChoice(q, opt)"
                            />
                            <span class="tw:text-sm tw:text-navy-80">{{ opt }}</span>
                        </label>
                    </div>

                    <!-- multiple_select: checkboxes -->
                    <div
                        v-else-if="q.type === 'multiple_select'"
                        class="tw:mt-3 tw:flex tw:flex-col tw:gap-1.5"
                    >
                        <label
                            v-for="opt in q.options"
                            :key="opt"
                            class="tw:flex tw:items-center tw:gap-2.5 tw:rounded-md tw:px-2 tw:py-1.5 tw:cursor-pointer tw:hover:bg-navy-10/40"
                        >
                            <input
                                type="checkbox"
                                :value="opt"
                                :checked="answerValue(q.answerIndex).selected.includes(opt)"
                                class="tw:size-4 tw:accent-primary"
                                @change="toggleSelect(q, opt)"
                            />
                            <span class="tw:text-sm tw:text-navy-80">{{ opt }}</span>
                        </label>
                    </div>

                    <!-- fill_in: textarea -->
                    <McTextarea
                        v-else-if="q.type === 'fill_in'"
                        :name="`answers[${q.answerIndex}].text`"
                        placeholder="Your answer"
                        class="tw:mt-3"
                        @update:model-value="invalidIds.delete(q.id)"
                    />

                    <!--
                        slide_identification: the exam's station layout, because it is the exam's
                        question. Photo on the left at a size worth looking at, the label and the
                        diagnosis stacked beside it. All three are required (see isAnswered), and
                        the payload carries the normalized label plus the raw one, exactly as
                        StudentExamForm sends it, so the same grading path receives the same shape.

                        Stacks on mobile with the photo on top, which is where it is taken.
                    -->
                    <div
                        v-else-if="q.type === 'slide_identification'"
                        class="tw:mt-3 tw:flex tw:flex-col tw:gap-4 tw:sm:flex-row"
                    >
                        <div class="tw:relative tw:h-40 tw:w-full tw:shrink-0 tw:sm:size-44">
                            <label
                                class="tw:group/photo tw:block tw:size-full tw:cursor-pointer tw:overflow-hidden tw:rounded-lg"
                            >
                                <img
                                    v-if="images[q.id]?.file || previousImageUrls[q.id]"
                                    :src="
                                        images[q.id]?.previewUrl ??
                                        previousImageUrls[q.id] ??
                                        undefined
                                    "
                                    alt=""
                                    class="tw:size-full tw:rounded-lg tw:border tw:bg-navy-5 tw:object-contain"
                                    :class="
                                        images[q.id]?.file
                                            ? 'tw:border-primary/40'
                                            : 'tw:border-dashed tw:border-navy-20'
                                    "
                                />
                                <span
                                    v-else
                                    class="tw:flex tw:size-full tw:flex-col tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-dashed tw:border-navy-20 tw:text-center tw:text-navy-60 tw:transition-colors tw:hover:border-primary tw:hover:bg-primary/5"
                                >
                                    <ImageUp class="tw:size-5" />
                                    <span class="tw:text-xs tw:font-medium">Add photo</span>
                                </span>
                                <!-- Hover-only, so nothing covers a photo at rest. -->
                                <span
                                    v-if="images[q.id]?.file || previousImageUrls[q.id]"
                                    class="tw:pointer-events-none tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-lg tw:bg-navy-100/55 tw:text-xs tw:font-medium tw:text-white tw:opacity-0 tw:transition-opacity tw:group-hover/photo:opacity-100"
                                >
                                    <ImageUp class="tw:size-4" />
                                    {{ images[q.id]?.file ? 'Change photo' : 'Add photo' }}
                                </span>
                                <!-- Names what is showing, so a returned photo is not taken for
                                     one already attached. -->
                                <span
                                    v-if="!images[q.id]?.file && previousImageUrls[q.id]"
                                    class="tw:pointer-events-none tw:absolute tw:bottom-1.5 tw:left-1.5 tw:rounded tw:bg-navy-100/65 tw:px-1.5 tw:py-0.5 tw:text-[0.6875rem] tw:font-medium tw:text-white tw:transition-opacity tw:group-hover/photo:opacity-0"
                                >
                                    Previous photo
                                </span>
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    capture="environment"
                                    class="tw:hidden"
                                    @change="onImage(q, $event)"
                                />
                            </label>
                            <!-- A sibling of the label, not a child: nested inside it, clicking
                                 this would reopen the picker it just cleared. -->
                            <button
                                v-if="images[q.id]?.file"
                                type="button"
                                aria-label="Remove image"
                                class="tw:absolute tw:top-1.5 tw:right-1.5 tw:cursor-pointer tw:rounded-full tw:bg-white/90 tw:p-1 tw:text-navy-60 tw:shadow-sm tw:transition-colors tw:hover:bg-danger tw:hover:text-white"
                                @click="removeImage(q)"
                            >
                                <X class="tw:size-3.5" />
                            </button>
                        </div>

                        <div class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-3">
                            <div class="tw:flex tw:flex-col tw:gap-1.5">
                                <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                                    Slide
                                </label>
                                <!-- Capped: full width makes a 2-4 character code look like a
                                     lost sentence. -->
                                <input
                                    v-model="slideLabels[q.id]"
                                    type="text"
                                    inputmode="text"
                                    autocapitalize="characters"
                                    placeholder="e.g. V7"
                                    class="tw:w-28 tw:rounded-md tw:border tw:border-navy-20 tw:px-3 tw:py-1.5 tw:text-sm tw:text-navy-90 tw:outline-none tw:focus:border-primary"
                                    @input="invalidIds.delete(q.id)"
                                />
                            </div>

                            <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-1.5">
                                <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                                    Your diagnosis
                                </label>
                                <!-- Free text, no quick-pick: naming the possible answers hands
                                     the question over. Grading resolves whatever is typed
                                     (BE-ADR-018). -->
                                <McTextarea
                                    :name="`answers[${q.answerIndex}].text`"
                                    placeholder="What is this slide?"
                                    @update:model-value="invalidIds.delete(q.id)"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- image_detection: image upload -->
                    <div v-else-if="q.type === 'image_detection'" class="tw:mt-3">
                        <div
                            v-if="images[q.id]?.file"
                            class="tw:flex tw:items-center tw:gap-3 tw:rounded-md tw:border tw:border-primary/30 tw:bg-primary/5 tw:px-3 tw:py-2"
                        >
                            <img
                                :src="images[q.id]?.previewUrl ?? undefined"
                                alt=""
                                class="tw:size-10 tw:shrink-0 tw:rounded tw:border tw:border-navy-15 tw:object-cover"
                            />
                            <div class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-1.5">
                                <CheckCircle2 class="tw:size-4 tw:shrink-0 tw:text-primary" />
                                <span class="tw:truncate tw:text-sm tw:text-navy-90">
                                    {{ images[q.id]?.name }}
                                </span>
                            </div>
                            <label
                                class="tw:shrink-0 tw:cursor-pointer tw:rounded tw:px-2 tw:py-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:bg-primary/10"
                            >
                                Change
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    capture="environment"
                                    class="tw:hidden"
                                    @change="onImage(q, $event)"
                                />
                            </label>
                            <button
                                type="button"
                                aria-label="Remove image"
                                class="tw:shrink-0 tw:cursor-pointer tw:rounded tw:p-1 tw:text-navy-50 tw:transition-colors tw:hover:bg-danger/10 tw:hover:text-danger"
                                @click="removeImage(q)"
                            >
                                <X class="tw:size-4" />
                            </button>
                        </div>

                        <!--
                            The same bar the attached photo uses, so a redo reads as one control
                            changing state rather than two different widgets: same height, same
                            thumbnail, same action on the right. Neutral border instead of the
                            primary tint, because nothing IS attached yet - that difference is the
                            whole message. "Previous photo" sits where the filename goes; there is
                            no filename to show, the server stores the image under a UUID.
                        -->
                        <div
                            v-else-if="previousImageUrls[q.id]"
                            class="tw:flex tw:items-center tw:gap-3 tw:rounded-md tw:border tw:border-navy-20 tw:px-3 tw:py-2"
                        >
                            <img
                                :src="previousImageUrls[q.id]"
                                alt="The photo you sent last time"
                                class="tw:size-10 tw:shrink-0 tw:rounded tw:border tw:border-navy-15 tw:object-cover"
                            />
                            <span
                                class="tw:min-w-0 tw:flex-1 tw:truncate tw:text-sm tw:text-navy-60"
                            >
                                Previous photo
                            </span>
                            <label
                                class="tw:shrink-0 tw:cursor-pointer tw:rounded tw:px-2 tw:py-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:bg-primary/10"
                            >
                                Add photo
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    capture="environment"
                                    class="tw:hidden"
                                    @change="onImage(q, $event)"
                                />
                            </label>
                        </div>

                        <label
                            v-else
                            class="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-md tw:border tw:border-navy-20 tw:px-3 tw:py-2 tw:text-sm tw:text-navy-70 tw:cursor-pointer tw:hover:border-primary tw:hover:bg-primary/5"
                        >
                            <ImageUp class="tw:size-4" />
                            <span>Upload microscopy image</span>
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                capture="environment"
                                class="tw:hidden"
                                @change="onImage(q, $event)"
                            />
                        </label>
                    </div>

                    <p
                        v-if="invalidIds.has(q.id)"
                        class="tw:mt-2 tw:text-xs tw:font-medium tw:text-danger"
                    >
                        This question is required
                    </p>
                </div>
            </div>
        </div>

        <div class="tw:flex tw:justify-end">
            <McButton type="submit" :loading="submitting">
                <Send class="tw:size-4 tw:mr-1.5" />
                Submit assignment
            </McButton>
        </div>
    </form>
</template>
