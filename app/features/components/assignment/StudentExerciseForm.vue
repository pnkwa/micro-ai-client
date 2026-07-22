<script setup lang="ts">
import { Send, CheckCircle2, ImageUp, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useForm, useFieldArray } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import { assignmentTotalPoints, type Assignment } from '~/services/assignmentService'

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

// image_detection answers stay outside the vee-validate schema, same as the file input
// in SubmitAssignment.vue: files aren't schema values, they're appended to FormData directly.
const images = reactive<
    Record<number, { file: File | null; name: string; previewUrl: string | null }>
>({})

// Which questions failed the "required" check is type-dependent business logic, not
// something a single zod shape can express per-row, so it's tracked separately (same
// division of labor as QuestionForm.vue's manual post-handleSubmit checks).
const invalidIds = reactive(new Set<number>())

const submitting = ref(false)
// Locked out of answering: either they already had a submission on load, or they just made
// one. Tracked locally as well as via the prop so the confirmation panel appears the instant
// the POST returns, without waiting for the parent's refetch to come back.
const submitted = ref(props.mySubmission !== null)

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

const isAnswered = (q: QuestionMeta): boolean => {
    if (q.type === 'fill_in') return currentAnswer(q.answerIndex).text.trim() !== ''
    if (q.type === 'image_detection') return images[q.id]?.file != null
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
    const file = (e.target as HTMLInputElement).files?.[0] ?? null
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
            } = { question_id: q.id }
            const answered = v.answers[q.answerIndex] ?? emptyAnswer
            if (q.type === 'fill_in') answer.response_text = answered.text.trim()
            else if (q.type === 'multiple_choice' || q.type === 'multiple_select')
                answer.selected_options = [...answered.selected]
            return answer
        })
        fd.append('answers', JSON.stringify(answers))
        for (const q of allQuestions) {
            const image = images[q.id]?.file
            if (q.type === 'image_detection' && image) fd.append(`image_${q.id}`, image)
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
        class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:bg-white tw:border tw:border-primary/20 tw:rounded-lg tw:py-16 tw:text-center"
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
                                    accept="image/*"
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

                        <label
                            v-else
                            class="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-md tw:border tw:border-navy-20 tw:px-3 tw:py-2 tw:text-sm tw:text-navy-70 tw:cursor-pointer tw:hover:border-primary tw:hover:bg-primary/5"
                        >
                            <ImageUp class="tw:size-4" />
                            <span>Upload microscopy image</span>
                            <input
                                type="file"
                                accept="image/*"
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
