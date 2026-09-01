<script setup lang="ts">
import { Plus, Pencil, X } from '@lucide/vue'
import { useForm, useFieldArray } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { toast } from 'vue-sonner'
import { detectionService, type ModelSpec } from '~/services/detectionService'
import {
    slideCollectionService,
    type SlideCollectionListItem,
} from '~/services/slideCollectionService'
import type { ImageQuestionInput } from '~/services/assignmentService'
import { pickDefaultModel } from '~/core/composables/detectionModels'
import { modelLabel } from '~/core/helpers/modelLabel'
import NoSlideCollections from '~/features/components/slide/NoSlideCollections.vue'

const props = withDefaults(
    defineProps<{
        initial?: {
            type: string
            prompt: string
            points?: number | null
            options: string[]
            accepted_answers?: string[]
            image_question?: {
                slide_collection_id?: number | null
                model?: string | null
                detection_confidence_threshold?: number | null
            } | null
        }
        lockType?: boolean
        submitLabel?: string
        heading?: string
        // Forces the question type (exams: 'slide_identification') and hides the type picker.
        // Such a question is prompt + points only - no options, no key (it lives on the slide).
        fixedType?: string
        /**
         * Pre-selected slide collection for a NEW slide question.
         *
         * An exam picks one collection at creation and the server fans it out onto every question,
         * but a station added later goes through the ordinary question endpoint, which has no
         * fan-out. Without this an instructor would re-pick the same collection for every station
         * they add after the fact, and picking a different one by accident is a silently wrong
         * answer key.
         */
        defaultSlideCollectionId?: number | null
    }>(),
    {
        lockType: false,
        submitLabel: 'Add question',
        heading: '',
        fixedType: undefined,
        defaultSlideCollectionId: null,
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
            /**
             * The subtype row (BE-ADR-034). Explicitly `null` rather than absent when the type
             * carries no image: on a PATCH, absent leaves a stale row alone while null deletes it,
             * so changing a question away from an image type has to say so.
             */
            image_question: ImageQuestionInput | null
        },
    ]
    cancel: []
}>()

const choiceTypes = new Set(['multiple_choice', 'multiple_select'])
const allTypeOptions = [
    { value: 'multiple_choice', label: 'Multiple choice' },
    { value: 'multiple_select', label: 'Multiple select' },
    { value: 'fill_in', label: 'Fill in' },
    { value: 'image_detection', label: 'Image detection' },
    { value: 'slide_identification', label: 'Slide identification' },
]

/**
 * Withheld from the picker while under evaluation (2026-08-26), NOT removed.
 *
 * image_detection overlaps slide_identification, which since v0.7 works on ordinary assignments and
 * is the stronger of the two: its answer key lives on the slide, so it can finalize itself, while
 * an image_detection answer can only ever be a suggestion for an instructor to confirm. Full
 * reasoning and worked examples of both: `.claude/note/question-types.md`.
 *
 * Authoring only. Existing questions of this type still render, submit and grade, and the server,
 * both e2e suites and the database are untouched. Restoring it is deleting this set.
 */
const underEvaluation = new Set(['image_detection'])

/**
 * An excluded type stays offered while EDITING a question that already has it, or the disabled
 * select would show a blank where the type should be and the author could not tell what they were
 * looking at.
 */
const typeOptions = computed(() =>
    allTypeOptions.filter((o) => !underEvaluation.has(o.value) || props.initial?.type === o.value),
)

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
        // A new question is worth 1 point unless the author changes it - the common case, and
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
// slide_identification carries neither options nor a key - just prompt + points, and the slide
// collection below, which is where its ground truth comes from.
const isSlideId = computed(() => values.type === 'slide_identification')
const isImageDetection = computed(() => values.type === 'image_detection')
/** Both types run a detection on the student's photo, so both choose the model that runs. */
const runsDetection = computed(() => isSlideId.value || isImageDetection.value)

/**
 * The image-bearing half of a question (BE-ADR-034), held outside vee-validate like the other
 * non-text controls in this codebase.
 *
 * These fields used to live at two different grains: `model` on the question, and the slide
 * collection and confidence threshold on the ASSIGNMENT, which meant every station in an exam had
 * to share one threshold. They are per question now.
 *
 * What each type may set is enforced server-side with a 400 naming the field, so this form offers
 * only what the type accepts rather than letting an instructor discover it on save.
 */
const slideCollectionId = ref(0)
const model = ref('')
const useThreshold = ref(false)
const threshold = ref(0.6)

const collections = ref<SlideCollectionListItem[]>([])

/**
 * The chosen collection's name for the closed control, or null when nothing is chosen yet.
 *
 * A combobox trigger holds text, not a value: `slideCollectionId` is 0 until an author picks, and
 * null here is what lets the trigger fall back to its placeholder.
 */
const selectedCollectionName = computed(
    () => collections.value.find((c) => c.id === slideCollectionId.value)?.name ?? null,
)
/**
 * Kept as the manifest rows rather than as ready-made options, because the placeholder needs the
 * DEFAULT model's spec, not just its name: the select's placeholder names the model that will
 * actually run, so an author reading the closed control knows what "unset" means without being
 * told "the deployment default" and left to go and find out which one that is.
 */
const models = ref<ModelSpec[]>([])
// Segment models are a second step over a detector's output, never the question's own model.
const primaryModels = computed(() => models.value.filter((m) => m.task !== 'segment'))
const modelOptions = computed(() =>
    primaryModels.value.map((m) => ({ value: m.name, label: modelLabel(m.displayName) })),
)
const defaultModelLabel = computed(() => {
    const spec = pickDefaultModel(primaryModels.value)
    // Before the manifest lands, and if it fails to: no name is honest, a guessed one is not.
    return spec ? modelLabel(spec.displayName) : 'Deployment default'
})

// Told apart because they need different words: "you have not made one yet" is a task, while
// "we could not fetch them" is a fault. Collapsing both into an empty select would send an
// instructor off to create a collection they already have.
const loadingCollections = ref(true)
const collectionsFailed = ref(false)
const hasCollections = computed(() => collections.value.length > 0)

const loadCollections = async () => {
    try {
        collections.value = await slideCollectionService.list()
        collectionsFailed.value = false
    } catch {
        collectionsFailed.value = true
    } finally {
        loadingCollections.value = false
    }
}

onMounted(async () => {
    // Both lists are staff-only and small. Failing either is reported in place rather than
    // thrown: the form still saves, and the type that actually needs the list says so itself.
    await loadCollections()
    try {
        models.value = await detectionService.listModels()
    } catch {
        toast.error('Failed to load models')
    }
})

/**
 * Pick the list back up when the tab regains focus, but only while it is empty.
 *
 * The empty state sends the instructor to the Slide Library in a NEW tab so this half-written
 * question survives; coming back to a select that still says "none" would make that look like it
 * failed. Guarded on empty so an ordinary tab switch mid-edit costs nothing.
 */
useEventListener(window, 'focus', () => {
    if (!hasCollections.value) void loadCollections()
})

// A new slide question inherits the collection its exam already uses; editing an existing one
// takes whatever that question actually has, below.
slideCollectionId.value = props.defaultSlideCollectionId ?? 0

// Editing an existing question: seed from whatever subtype row it already has.
if (props.initial?.image_question) {
    slideCollectionId.value = props.initial.image_question.slide_collection_id ?? 0
    model.value = props.initial.image_question.model ?? ''
    const t = props.initial.image_question.detection_confidence_threshold
    useThreshold.value = t != null
    threshold.value = t ?? 0.6
}

/**
 * Per the server's matrix, and per what each field actually DOES once graded.
 *
 * A slide question takes all three: the collection is its answer key, the model runs on the
 * student's photo, and the threshold is the bar that photo has to clear for a correct answer to
 * auto-pass instead of going to review. It is the only question type where the threshold reaches
 * a grade at all (`SubmissionGradingListener.gradeSlideAnswer`).
 *
 * An image_detection question takes only the model. The server accepts a threshold here and then
 * never reads it: `gradeDetection` takes no threshold, and the answer stays `needs_review`
 * whatever the model says, because that suggestion is advisory and an instructor confirms it. A
 * control for it would promise an auto-pass that cannot happen.
 *
 * The subtype row is replaced wholesale on PATCH, so a field omitted here is cleared, which is
 * what should happen to a threshold left behind by an earlier version of this form.
 */
const buildImageQuestion = (type: string): ImageQuestionInput | null => {
    if (type === 'slide_identification') {
        return {
            slide_collection_id: slideCollectionId.value || null,
            model: model.value || null,
            detection_confidence_threshold: useThreshold.value ? threshold.value : null,
        }
    }
    if (type === 'image_detection') {
        return { model: model.value || null }
    }
    return null
}

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
    /*
     * NO MINIMUM ON `fill_in`. A key-less one is an OPEN-ENDED question (BE-ADR-036).
     *
     * This refused it, and the server never did: `assertValidQuestionKey` has no minimum for this
     * type precisely because "the answer is prose" is a real assessment rather than a missing key.
     * The refusal here made authoring one impossible through the UI, and the workaround was to
     * invent an accepted answer nothing could match - which is worse than no key, because the
     * autograder then marks every response wrong instead of standing aside.
     *
     * Empty goes out as an empty array, which the server reads as "no key", and the answer lands
     * with the instructor to grade by hand.
     */
    if (v.type === 'image_detection' && acceptedAnswers.length < 1)
        return toast.error('Add at least one expected class')
    // Required by the server for this type, and the reason a slide answer can be graded at all:
    // without a collection there is no ground truth to resolve the slide against.
    if (v.type === 'slide_identification' && !slideCollectionId.value)
        return toast.error('Pick the slide collection this question grades against')

    emit('submit', {
        type: v.type,
        prompt: v.prompt.trim(),
        options,
        accepted_answers: acceptedAnswers,
        points: v.points && v.points >= 1 ? v.points : undefined,
        image_question: buildImageQuestion(v.type),
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
                <!--
                    THE CONTROL THE STUDENT WILL SEE, marking which option is correct.

                    A button wrapping a lucide circle or square before, which meant the author was
                    setting the key on a picture of a radio while the student answers with a real
                    one - and the two could drift in size, shape and grey without anyone noticing.
                    A native input at the same `size-4 accent-primary` as the student form cannot.

                    `name` groups the radios so a single choice behaves like one natively, including
                    under the arrow keys. Exclusivity is still enforced in `toggleCorrect`, which is
                    what makes the state right rather than merely the DOM.
                -->
                <input
                    :type="values.type === 'multiple_choice' ? 'radio' : 'checkbox'"
                    :name="values.type === 'multiple_choice' ? 'correct-option' : undefined"
                    :checked="isCorrect(oi)"
                    :aria-label="isCorrect(oi) ? 'Correct answer' : 'Mark as correct'"
                    class="tw:size-4 tw:shrink-0 tw:cursor-pointer tw:accent-primary"
                    @change="toggleCorrect(oi)"
                />
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
            <!--
                The asterisk belongs to the types that actually require a key. `fill_in` does not:
                left empty it is an open-ended question, which is a deliberate authoring choice
                rather than an unfinished form, so it says what empty MEANS instead of demanding a
                value the server would have accepted the absence of.
            -->
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                {{ values.type === 'image_detection' ? 'Expected classes' : 'Accepted answers' }}
                <span v-if="values.type === 'image_detection'" class="tw:text-red-500">*</span>
                <span v-else class="tw:font-normal tw:text-navy-40">(optional)</span>
            </label>
            <McTextarea
                name="answers"
                class="tw:bg-white tw:min-h-32 tw:text-sm tw:leading-relaxed"
                :placeholder="
                    values.type === 'image_detection' ? 'One class per line' : 'One answer per line'
                "
                auto-list
            />
            <p v-if="values.type === 'fill_in'" class="tw:text-[11px] tw:text-navy-50">
                Leave this empty for an open-ended question: nothing is auto-graded and every answer
                comes to you to mark.
            </p>
        </div>

        <!--
            The image-bearing half of the question (BE-ADR-034). What each type may set is enforced
            server-side with a 400 naming the field, so only what this type accepts is offered: a
            slide question needs a collection, a model and a threshold; an image_detection question
            takes a model and rejects a collection. See buildImageQuestion for why the threshold
            belongs to the slide type and not to this one.
        -->
        <div
            v-if="isSlideId"
            class="tw:flex tw:flex-col tw:gap-1 tw:[&_[data-slot=native-select-wrapper]]:w-full"
        >
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                Slide collection
                <span class="tw:text-red-500">*</span>
            </label>

            <!--
                A SEARCHABLE select. A collection list grows with the course and a plain list is
                only usable while it is short; typing a few letters is how an author finds "Wet
                mount, term 2" among thirty. reka-ui filters on each item's text, so the options
                stay a plain list and nothing is filtered by hand here.
            -->
            <McCombobox v-if="hasCollections" v-model="slideCollectionId">
                <McComboboxAnchor>
                    <McComboboxTrigger class="tw:bg-white">
                        <span :class="!selectedCollectionName && 'tw:text-muted-foreground'">
                            {{
                                selectedCollectionName ??
                                'Pick the collection this question grades against'
                            }}
                        </span>
                    </McComboboxTrigger>
                </McComboboxAnchor>
                <McComboboxList>
                    <McComboboxInput placeholder="Search collections" />
                    <McComboboxEmpty>No collection matches that.</McComboboxEmpty>
                    <McComboboxViewport>
                        <McComboboxItem v-for="c in collections" :key="c.id" :value="c.id">
                            {{ c.name }}
                        </McComboboxItem>
                    </McComboboxViewport>
                </McComboboxList>
            </McCombobox>
            <p v-else-if="loadingCollections" class="tw:text-xs tw:text-navy-50">
                Loading slide collections...
            </p>

            <!--
                Nothing to pick from. An empty select would read as a broken control, and this
                question cannot be saved without a collection, so say which of the two situations
                it is and offer the way out of each.
            -->
            <NoSlideCollections v-else :failed="collectionsFailed" @retry="loadCollections" />

            <p v-if="hasCollections" class="tw:text-[11px] tw:leading-relaxed tw:text-navy-50">
                The slide the student reports is looked up here to find its answer key. Set per
                question since v0.7; it used to be one setting for the whole assignment.
            </p>
        </div>

        <div v-if="runsDetection" class="tw:flex tw:flex-col tw:gap-2">
            <div class="tw:flex tw:flex-col tw:gap-1">
                <label class="tw:text-xs tw:font-medium tw:text-navy-60">Model</label>
                <McSelect
                    v-model="model"
                    :placeholder="defaultModelLabel"
                    :options="modelOptions"
                    option-value="value"
                    option-label="label"
                    class="tw:bg-white"
                />
                <p class="tw:text-[11px] tw:leading-relaxed tw:text-navy-50">
                    Leave unset to run {{ defaultModelLabel }}, which is the safer choice unless
                    this question needs a particular detector.
                </p>
            </div>

            <template v-if="isSlideId">
                <label
                    class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:font-medium tw:text-navy-60"
                >
                    <input v-model="useThreshold" type="checkbox" class="tw:accent-primary" />
                    Set an auto-pass confidence
                </label>
                <McConfidenceThreshold
                    v-if="useThreshold"
                    v-model="threshold"
                    label="Auto-pass confidence"
                    hint="A correct answer auto-passes only if the model agrees this confidently. Below the bar it goes to you for review. Unset uses the 0.6 default."
                />
            </template>
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
