<script setup lang="ts">
import { Plus, Pencil, Circle, CircleDot, Square, CheckSquare, X } from '@lucide/vue'
import { useForm, useFieldArray } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { toast } from 'vue-sonner'

const props = withDefaults(
    defineProps<{
        initial?: {
            type: string
            prompt: string
            points?: number | null
            options: string[]
            accepted_answers?: string[]
        }
        lockType?: boolean
        submitLabel?: string
        heading?: string
        // Forces the question type (exams: 'slide_identification') and hides the type picker.
        // Such a question is prompt + points only — no options, no key (it lives on the slide).
        fixedType?: string
    }>(),
    {
        lockType: false,
        submitLabel: 'Add question',
        heading: '',
        fixedType: undefined,
    },
)

const emit = defineEmits<{
    submit: [
        payload: {
            type: string
            prompt: string
            options?: string[]
            accepted_answers: string[]
            points?: number
        },
    ]
    cancel: []
}>()

const choiceTypes = new Set(['multiple_choice', 'multiple_select'])
const typeOptions = [
    { value: 'multiple_choice', label: 'Multiple choice' },
    { value: 'multiple_select', label: 'Multiple select' },
    { value: 'fill_in', label: 'Fill in' },
    { value: 'image_detection', label: 'Image detection' },
    { value: 'slide_identification', label: 'Slide identification' },
]

const schema = z.object({
    type: z.string(),
    prompt: z.string().trim().min(1, 'Enter a question prompt'),
    points: z.coerce.number().int().min(0).optional(),
    options: z.array(z.object({ text: z.string().optional(), correct: z.boolean() })),
    answers: z.string(),
})
type FormValues = z.infer<typeof schema>

const buildInitial = (): FormValues => {
    if (props.initial) {
        const choice = choiceTypes.has(props.initial.type)
        return {
            type: props.initial.type,
            prompt: props.initial.prompt,
            points: props.initial.points ?? undefined,
            options:
                choice && props.initial.options.length
                    ? props.initial.options.map((t) => ({
                          text: t,
                          correct: props.initial?.accepted_answers?.includes(t) ?? false,
                      }))
                    : [{ text: '', correct: false }],
            answers:
                !choice && props.initial.accepted_answers?.length
                    ? props.initial.accepted_answers.join('\n')
                    : '',
        }
    }
    return {
        type: props.fixedType ?? 'multiple_choice',
        prompt: '',
        // A new question is worth 1 point unless the author changes it — the common case, and
        // it keeps a just-added question from silently contributing 0 to the total.
        points: 1,
        options: [{ text: '', correct: false }],
        answers: '',
    }
}

const { handleSubmit, values } = useForm<FormValues>({
    validationSchema: toTypedSchema(schema),
    initialValues: buildInitial(),
})

const {
    fields: optionFields,
    push: pushOption,
    remove: removeOptionField,
    update: updateOption,
} = useFieldArray<{ text: string; correct: boolean }>('options')

const isChoice = computed(() => choiceTypes.has(values.type))
// slide_identification carries neither options nor a key — just prompt + points.
const isSlideId = computed(() => values.type === 'slide_identification')

const addOption = () => pushOption({ text: '', correct: false })
const removeOption = (index: number) => {
    removeOptionField(index)
    if (optionFields.value.length === 0) addOption()
}

const toggleCorrect = (index: number) => {
    if (values.type === 'multiple_choice') {
        optionFields.value.forEach((f, i) =>
            updateOption(i, { text: f.value.text, correct: i === index }),
        )
    } else {
        const field = optionFields.value[index]
        if (field) updateOption(index, { text: field.value.text, correct: !field.value.correct })
    }
}

const onTypeChange = (newType: unknown) => {
    if (newType !== 'multiple_choice') return
    let kept = false
    optionFields.value.forEach((f, i) => {
        const keep = f.value.correct && !kept
        if (keep) kept = true
        updateOption(i, { text: f.value.text, correct: keep })
    })
}

const isCorrect = (index: number) => optionFields.value[index]?.value.correct ?? false

const onSubmit = handleSubmit((v) => {
    const choice = choiceTypes.has(v.type)
    const slideId = v.type === 'slide_identification'
    const options = choice ? v.options.map((o) => (o.text ?? '').trim()).filter(Boolean) : undefined
    const acceptedAnswers = slideId
        ? [] // the key lives on the slide, not the question
        : choice
          ? v.options
                .filter((o) => o.correct)
                .map((o) => (o.text ?? '').trim())
                .filter(Boolean)
          : v.answers
                .split('\n')
                .map((a) => a.trim())
                .filter(Boolean)

    if (choice && (options?.length ?? 0) < 2) return toast.error('Add at least 2 options')
    if (v.type === 'multiple_choice' && acceptedAnswers.length !== 1)
        return toast.error('Mark exactly one correct answer')
    if (v.type === 'multiple_select' && acceptedAnswers.length < 1)
        return toast.error('Mark at least one correct answer')
    if (v.type === 'fill_in' && acceptedAnswers.length < 1)
        return toast.error('Add at least one accepted answer')
    if (v.type === 'image_detection' && acceptedAnswers.length < 1)
        return toast.error('Add at least one expected class')

    emit('submit', {
        type: v.type,
        prompt: v.prompt.trim(),
        options,
        accepted_answers: acceptedAnswers,
        points: v.points && v.points >= 1 ? v.points : undefined,
    })
})
</script>

<template>
    <form
        class="tw:mt-3 tw:flex tw:flex-col tw:gap-3 tw:rounded-lg tw:border tw:p-4 tw:sm:p-6"
        :class="
            lockType
                ? 'tw:border-warning/40 tw:bg-warning/5'
                : 'tw:border-primary/40 tw:bg-primary/5'
        "
        @submit.prevent="onSubmit"
    >
        <div
            v-if="heading"
            class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:pb-2 tw:text-sm tw:font-semibold"
            :class="
                lockType
                    ? 'tw:border-warning/30 tw:text-warning'
                    : 'tw:border-primary/30 tw:text-primary'
            "
        >
            <Pencil v-if="lockType" class="tw:size-4" />
            <Plus v-else class="tw:size-4" />
            {{ heading }}
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row">
            <div class="tw:flex tw:flex-1 tw:flex-col tw:gap-1">
                <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                    Question
                    <span class="tw:text-red-500">*</span>
                </label>
                <McInput name="prompt" class="tw:bg-white" placeholder="Question" />
            </div>
            <div v-if="!fixedType" class="tw:flex tw:flex-col tw:gap-1 tw:sm:w-44">
                <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                    Type
                    <span class="tw:text-red-500">*</span>
                </label>
                <McSelect
                    name="type"
                    class="tw:bg-white"
                    placeholder="Question type"
                    :options="typeOptions"
                    option-value="value"
                    option-label="label"
                    :disabled="lockType"
                    @update:model-value="onTypeChange"
                />
            </div>
        </div>

        <div v-if="isChoice" class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                Options
                <span class="tw:text-red-500">*</span>
            </label>
            <div
                v-for="(field, oi) in optionFields"
                :key="field.key"
                class="tw:flex tw:items-center tw:gap-2"
            >
                <button
                    type="button"
                    :aria-label="isCorrect(oi) ? 'Correct answer' : 'Mark as correct'"
                    class="tw:shrink-0 tw:transition-colors tw:cursor-pointer"
                    :class="
                        isCorrect(oi) ? 'tw:text-primary' : 'tw:text-navy-40 tw:hover:text-navy-60'
                    "
                    @click="toggleCorrect(oi)"
                >
                    <component
                        :is="
                            values.type === 'multiple_choice'
                                ? isCorrect(oi)
                                    ? CircleDot
                                    : Circle
                                : isCorrect(oi)
                                  ? CheckSquare
                                  : Square
                        "
                        class="tw:size-4"
                    />
                </button>
                <McInput
                    :name="`options[${oi}].text`"
                    class="tw:flex-1 tw:bg-white"
                    :placeholder="`Option ${oi + 1}`"
                />
                <button
                    type="button"
                    aria-label="Remove option"
                    class="tw:shrink-0 tw:rounded tw:p-1 tw:text-navy-50 tw:transition-colors tw:cursor-pointer tw:hover:bg-danger/10 tw:hover:text-danger"
                    @click="removeOption(oi)"
                >
                    <X class="tw:size-4" />
                </button>
            </div>
            <McButton
                type="button"
                variant="ghost"
                size="sm"
                class="tw:self-start tw:text-primary tw:hover:bg-primary/10 tw:hover:text-primary/80"
                @click="addOption"
            >
                <Plus class="tw:size-3.5 tw:mr-1" />
                Add option
            </McButton>
            <p class="tw:text-xs tw:text-navy-50">
                {{
                    values.type === 'multiple_choice'
                        ? 'Click the circle to mark the correct answer.'
                        : 'Tick the boxes to mark the correct answers.'
                }}
            </p>
        </div>

        <div v-else-if="isSlideId" class="tw:rounded-md tw:bg-navy-10/30 tw:px-3 tw:py-2">
            <p class="tw:text-[11px] tw:leading-relaxed tw:text-navy-50">
                The answer key for a slide question lives on the slide in its collection, not here.
                The student self-reports a slide number, writes a diagnosis and attaches a photo.
            </p>
        </div>

        <div v-else class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                {{ values.type === 'image_detection' ? 'Expected classes' : 'Accepted answers' }}
                <span class="tw:text-red-500">*</span>
            </label>
            <McTextarea
                name="answers"
                class="tw:bg-white tw:min-h-32 tw:text-sm tw:leading-relaxed"
                :placeholder="
                    values.type === 'image_detection' ? 'One class per line' : 'One answer per line'
                "
                auto-list
            />
        </div>

        <div class="tw:flex tw:items-center tw:gap-3 tw:border-t tw:border-navy-10 tw:pt-3">
            <label class="tw:text-xs tw:text-navy-60">Points</label>
            <McInput name="points" type="number" class="tw:w-20 tw:bg-white" placeholder="1" />
            <div class="tw:ml-auto tw:flex tw:gap-2">
                <McButton type="button" variant="outline" size="sm" @click="emit('cancel')">
                    Cancel
                </McButton>
                <McButton type="submit" size="sm" @click="onSubmit">{{ submitLabel }}</McButton>
            </div>
        </div>
    </form>
</template>
