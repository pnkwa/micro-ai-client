<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { toast } from 'vue-sonner'
import {
    assignmentService,
    type Assignment,
    type ImageQuestionInput,
} from '~/services/assignmentService'
import { slideCollectionService } from '~/services/slideCollectionService'
import SectionForm from '~/features/components/assignment/SectionForm.vue'
import QuestionForm from '~/features/components/assignment/QuestionForm.vue'

// Instructor authoring view only. Students never render this component: their side of the
// assignment is StudentAssignmentForm, which the page mounts directly.
const props = defineProps<{
    assignment: Assignment
    /**
     * Assignment-level, derived by the parent from every section's own flag. Release is
     * authored per section on the server but is only ever offered for the assignment as a
     * whole, so a half-released assignment reads as not released and every editing control
     * below keys off this one value rather than `ex.released`.
     */
    released: boolean
    /**
     * When set (exams pass 'slide_identification'), the question form is locked to this type
     * and hides its picker - an exam's questions are all one type. Undefined = the normal
     * assignment picker with every type available.
     */
    fixedQuestionType?: string
    /** Seeds a NEW slide question's collection; see QuestionForm. Exams pass the one they use. */
    defaultSlideCollectionId?: number | null
}>()

const emit = defineEmits<{ reload: [] }>()

const showAddSection = ref(false)
const editingSectionId = ref<number | null>(null)
const addingQuestionSectionId = ref<number | null>(null)
const editingQuestionId = ref<number | null>(null)

const pendingDelete = ref<{ kind: 'section' | 'question'; id: number; label: string } | null>(null)
const isDeleting = ref(false)

const confirmDelete = async () => {
    if (!pendingDelete.value) return
    isDeleting.value = true
    const { kind, id } = pendingDelete.value
    try {
        if (kind === 'section') await assignmentService.removeSection(id)
        else await assignmentService.removeQuestion(id)
        emit('reload')
        pendingDelete.value = null
    } catch (err) {
        toast.error(apiErrorMessage(err, `Failed to delete ${kind}`))
    } finally {
        isDeleting.value = false
    }
}

const questionTypeLabel: Record<string, string> = {
    multiple_choice: 'Multiple choice',
    multiple_select: 'Multiple select',
    fill_in: 'Fill in',
    image_detection: 'Image detection',
    // Missing here, the chip fell back to the raw `slide_identification`, which is the only
    // type that ever showed a snake_case tag to an author.
    slide_identification: 'Slide identification',
}

const isCorrect = (q: { accepted_answers?: string[] }, option: string) =>
    q.accepted_answers?.includes(option) ?? false

/**
 * What grades a slide station, said on the station itself.
 *
 * Its key is not in the question: the collection IS the answer key (BE-ADR-011), and the
 * auto-pass bar decides whether a correct read is accepted or sent to a human. Both are set in
 * the editor and were then invisible from the list, so an author checking an exam had to open
 * every station to find out which collection it grades against - and a station left on the wrong
 * collection looks exactly like a right one until a cohort has sat it.
 */
const collectionNames = ref<Record<number, string>>({})

const hasSlideQuestion = computed(() =>
    props.assignment.sections.some((s) =>
        s.questions.some((q) => q.type === 'slide_identification'),
    ),
)

// Only the names, and only when a slide question is on screen to need one: this list is a second
// request on a page that already has everything else it renders.
onMounted(async () => {
    if (!hasSlideQuestion.value) return
    try {
        const list = await slideCollectionService.list()
        collectionNames.value = Object.fromEntries(list.map((c) => [c.id, c.name]))
    } catch {
        // Falls back to the id below. A lookup for a label must not cost the author the row.
        collectionNames.value = {}
    }
})

/**
 * The collection's name, or its id when the lookup has not landed or no longer resolves.
 *
 * `#4` is worse than a name and far better than an empty line: a deleted or renamed collection is
 * exactly when an author needs to see that the station still points somewhere.
 */
const collectionLabel = (q: { image_question?: { slide_collection_id: number | null } | null }) => {
    const id = q.image_question?.slide_collection_id
    if (id == null) return 'none set'
    return collectionNames.value[id] ?? `#${id}`
}

/**
 * The auto-pass bar, as a percentage.
 *
 * Unset is not "off": the grader falls back to 0.6, which is what the editor's hint promises, so
 * the line says the number that will actually be applied and marks it as the default rather than
 * leaving a blank that reads as "no bar at all".
 */
const DEFAULT_AUTO_PASS = 0.6

const thresholdLabel = (q: {
    image_question?: { detection_confidence_threshold: number | null } | null
}) => {
    const t = q.image_question?.detection_confidence_threshold
    const pct = Math.round((t ?? DEFAULT_AUTO_PASS) * 100)
    return t == null ? `${pct}% confidence (default)` : `${pct}% confidence`
}

const handleAddSection = async (values: { title: string; instructions?: string }) => {
    try {
        await assignmentService.addSection(props.assignment.id, values)
        emit('reload')
        showAddSection.value = false
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to add section'))
    }
}

const handleUpdateSection = async (
    sectionId: number,
    values: { title: string; instructions?: string },
) => {
    try {
        await assignmentService.updateSection(sectionId, values)
        emit('reload')
        editingSectionId.value = null
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to update section'))
    }
}

type QuestionPayload = {
    type: string
    prompt: string
    options?: string[]
    accepted_answers: string[]
    points?: number
    image_question: ImageQuestionInput | null
}

const handleAddQuestion = async (sectionId: number, payload: QuestionPayload) => {
    try {
        await assignmentService.addQuestion(sectionId, payload)
        emit('reload')
        addingQuestionSectionId.value = null
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to add question'))
    }
}

const handleUpdateQuestion = async (questionId: number, payload: QuestionPayload) => {
    try {
        await assignmentService.updateQuestion(questionId, {
            prompt: payload.prompt,
            options: payload.options,
            accepted_answers: payload.accepted_answers,
            points: payload.points,
            // Always sent, including as null: on a PATCH, absent leaves a stale subtype row in
            // place while null deletes it, so a question that no longer bears an image has to say
            // so rather than stay silent.
            image_question: payload.image_question,
        })
        emit('reload')
        editingQuestionId.value = null
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to update question'))
    }
}
</script>

<template>
    <div class="tw:flex tw:flex-col tw:gap-4">
        <!--
            `data-testid` because an assignment can hold several sections and every one of them
            renders an identical "Add question" button. The browser suite has to say WHICH section
            it is authoring into, and it cannot do that from the button alone - it matched two and
            failed on a strict-mode violation the moment a second section existed. Same sparing use
            as `row-score` on the class page: a hook only where the DOM is genuinely ambiguous.
        -->
        <div
            v-for="(ex, exIndex) in assignment.sections"
            :key="ex.id"
            data-testid="section-card"
            class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-lg tw:p-5 tw:transition-shadow tw:hover:shadow-sm"
        >
            <SectionForm
                v-if="editingSectionId === ex.id"
                :initial="{ title: ex.title, instructions: ex.instructions ?? '' }"
                submit-label="Save"
                @submit="handleUpdateSection(ex.id, $event)"
                @cancel="editingSectionId = null"
            />
            <div v-else class="tw:flex tw:items-start tw:justify-between tw:gap-3 tw:mb-3">
                <div class="tw:flex tw:items-start tw:gap-3">
                    <span
                        class="tw:flex tw:size-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary/10 tw:text-sm tw:font-semibold tw:text-primary"
                    >
                        {{ exIndex + 1 }}
                    </span>
                    <div>
                        <p class="tw:font-semibold tw:text-lg tw:text-navy-100">
                            {{ ex.title }}
                        </p>
                        <p v-if="ex.instructions" class="tw:text-xs tw:text-navy-60 tw:mt-0.5">
                            {{ ex.instructions }}
                        </p>
                        <p class="tw:text-xs tw:text-navy-40 tw:mt-1">
                            {{ ex.questions.length }}
                            question{{ ex.questions.length === 1 ? '' : 's' }}
                        </p>
                    </div>
                </div>
                <div v-if="!released" class="tw:flex tw:items-center tw:gap-3 tw:shrink-0">
                    <button
                        class="tw:rounded tw:px-2 tw:py-1 tw:text-xs tw:text-navy-60 tw:transition-colors tw:cursor-pointer tw:hover:bg-navy-10 tw:hover:text-primary"
                        @click="editingSectionId = ex.id"
                    >
                        Edit
                    </button>
                    <button
                        class="tw:rounded tw:px-2 tw:py-1 tw:text-xs tw:text-navy-60 tw:transition-colors tw:cursor-pointer tw:hover:bg-danger/10 tw:hover:text-danger"
                        @click="pendingDelete = { kind: 'section', id: ex.id, label: ex.title }"
                    >
                        Delete
                    </button>
                </div>
            </div>

            <div
                class="tw:mt-3 tw:flex tw:flex-col tw:gap-1 bg-navy-10/20 tw:rounded-lg tw:border tw:border-navy-20 tw:p-4"
            >
                <div
                    v-for="(q, qIndex) in ex.questions"
                    :key="q.id"
                    class="tw:text-sm tw:rounded-md tw:transition-colors"
                    :class="editingQuestionId !== q.id && 'tw:p-2 tw:hover:bg-navy-10/30'"
                >
                    <QuestionForm
                        v-if="editingQuestionId === q.id"
                        :initial="{
                            type: q.type,
                            prompt: q.prompt,
                            points: q.points,
                            options: q.options,
                            accepted_answers: q.accepted_answers,
                            image_question: q.image_question,
                        }"
                        lock-type
                        :heading="`Edit question ${exIndex + 1}.${qIndex + 1}`"
                        submit-label="Save changes"
                        @submit="handleUpdateQuestion(q.id, $event)"
                        @cancel="editingQuestionId = null"
                    />
                    <div v-else class="tw:group tw:flex tw:gap-3 tw:py-2">
                        <span
                            class="tw:shrink-0 tw:text-sm tw:font-semibold tw:text-navy-60 tw:tabular-nums"
                        >
                            {{ exIndex + 1 }}.{{ qIndex + 1 }}
                        </span>
                        <div class="tw:min-w-0 tw:flex-1">
                            <div class="tw:flex tw:items-start tw:justify-between tw:gap-3">
                                <div class="tw:flex tw:flex-col tw:gap-1">
                                    <span class="tw:text-navy-100">{{ q.prompt }}</span>
                                    <!--
                                        A slide station's key and its auto-pass bar, under the
                                        prompt and above the type chip: it is part of reading the
                                        question, not a footnote to it. A definition grid rather
                                        than two sentences, so the labels share an edge and the
                                        values line up down a list of stations, which is how a
                                        wrong collection gets spotted. Typed like the chip below
                                        it, minus the pill: same size, weight and colour, so the
                                        whole band reads as one row of metadata.
                                    -->
                                    <dl
                                        v-if="q.type === 'slide_identification'"
                                        class="tw:grid tw:grid-cols-[auto_1fr] tw:gap-x-2 tw:gap-y-0.5 tw:font-medium tw:text-navy-60"
                                    >
                                        <!--
                                            THE SIZE GOES ON EVERY dt AND dd, not on the `dl`.
                                            Something in the base layer sets a font-size on both
                                            elements, so a size on the list is inherited by
                                            nothing: the `dl` measured 10px while its rows sat at
                                            the browser's 16px, which is why this block kept
                                            looking bigger than the chip under it however small
                                            the class said. `ImageMetaCard` repeats the size per
                                            row for the same reason.
                                        -->
                                        <dt class="tw:text-[11px]">Slide collection:</dt>
                                        <!-- Amber on `none set`: the top of the page used to
                                             count the stations missing a collection, and that
                                             count is gone, so the station itself has to be the
                                             thing that stands out. -->
                                        <dd
                                            class="tw:text-[11px]"
                                            :class="
                                                q.image_question?.slide_collection_id == null &&
                                                'tw:text-warning'
                                            "
                                        >
                                            {{ collectionLabel(q) }}
                                        </dd>
                                        <dt class="tw:text-[11px]">Auto-grader:</dt>
                                        <dd class="tw:text-[11px]">
                                            On, threshold {{ thresholdLabel(q) }}
                                        </dd>
                                    </dl>
                                    <div class="tw:flex tw:items-center tw:gap-2">
                                        <span
                                            class="tw:inline-flex tw:items-center tw:rounded-full tw:bg-navy-10 tw:px-2 tw:py-0.5 tw:text-[11px] tw:font-medium tw:text-navy-60"
                                        >
                                            {{ questionTypeLabel[q.type] ?? q.type }}
                                        </span>
                                        <!-- 11px, the chip's size: the whole metadata band under
                                             a prompt (details, type, points) reads as one thing
                                             only if it is one size. -->
                                        <span
                                            v-if="q.points"
                                            class="tw:text-[11px] tw:text-navy-40"
                                        >
                                            {{ q.points }} pt
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-if="!released"
                                    class="tw:flex tw:gap-1 tw:shrink-0 tw:opacity-0 tw:transition-opacity tw:group-hover:opacity-100"
                                >
                                    <button
                                        class="tw:rounded tw:px-2 tw:py-1 tw:text-xs tw:text-navy-60 tw:transition-colors tw:cursor-pointer tw:hover:bg-navy-10 tw:hover:text-primary"
                                        @click="editingQuestionId = q.id"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        class="tw:rounded tw:px-2 tw:py-1 tw:text-xs tw:text-navy-60 tw:transition-colors tw:cursor-pointer tw:hover:bg-danger/10 tw:hover:text-danger"
                                        @click="
                                            pendingDelete = {
                                                kind: 'question',
                                                id: q.id,
                                                label: `question ${exIndex + 1}.${qIndex + 1}`,
                                            }
                                        "
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>

                            <div
                                v-if="q.options.length"
                                class="tw:mt-2 tw:flex tw:flex-col tw:gap-1.5"
                            >
                                <div
                                    v-for="(opt, oidx) in q.options"
                                    :key="oidx"
                                    class="tw:flex tw:items-center tw:gap-2.5"
                                >
                                    <!--
                                        THE SAME CONTROL THE STUDENT SEES, not an icon of one.

                                        This drew lucide circles and squares, which meant the
                                        author was checking their answer key against a picture of a
                                        radio while the student answered with a real one - two
                                        shapes, two greys, and no way to be sure they lined up. A
                                        native input at the same size and accent is the only way
                                        the two views are guaranteed to match, because they are
                                        then the same widget.

                                        `pointer-events-none` and `tabindex="-1"` rather than
                                        `disabled`: this is a preview, so it must not take a click
                                        or a tab stop - but a disabled input is greyed by the
                                        browser, which is exactly the divergence being removed.
                                    -->
                                    <input
                                        :type="q.type === 'multiple_choice' ? 'radio' : 'checkbox'"
                                        :checked="isCorrect(q, opt)"
                                        class="tw:pointer-events-none tw:size-4 tw:shrink-0 tw:accent-primary"
                                        tabindex="-1"
                                        aria-hidden="true"
                                    />
                                    <span
                                        class="tw:text-sm"
                                        :class="
                                            isCorrect(q, opt)
                                                ? 'tw:font-medium tw:text-navy-100'
                                                : 'tw:text-navy-80'
                                        "
                                    >
                                        {{ opt }}
                                    </span>
                                </div>
                            </div>
                            <div
                                v-else-if="q.accepted_answers?.length"
                                class="tw:mt-2 tw:flex tw:flex-wrap tw:gap-1.5"
                            >
                                <span
                                    v-for="(a, aidx) in q.accepted_answers"
                                    :key="aidx"
                                    class="tw:inline-flex tw:items-center tw:rounded tw:px-2 tw:py-0.5 tw:text-xs tw:text-primary"
                                >
                                    {{ a }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <QuestionForm
                    v-if="addingQuestionSectionId === ex.id"
                    heading="New question"
                    :fixed-type="fixedQuestionType"
                    :default-slide-collection-id="defaultSlideCollectionId"
                    @submit="handleAddQuestion(ex.id, $event)"
                    @cancel="addingQuestionSectionId = null"
                />
                <button
                    v-else-if="!released"
                    class="tw:w-full tw:my-2 tw:flex tw:items-center tw:gap-1 tw:self-start tw:rounded tw:p-4 tw:text-xs tw:font-medium tw:text-primary tw:transition-colors tw:cursor-pointer tw:hover:bg-primary/10"
                    @click="addingQuestionSectionId = ex.id"
                >
                    <Plus class="tw:size-3.5" />
                    Add question
                </button>
            </div>
        </div>

        <!-- Adding is off once released, and not only because the existing content is frozen:
             a new section is created as a draft, which would put the assignment back into the
             half-released state this UI exists to eliminate. -->
        <template v-if="!released">
            <div
                v-if="showAddSection"
                class="tw:bg-white tw:border tw:border-gray-200 tw:rounded-md tw:p-4"
            >
                <SectionForm
                    submit-label="Add section"
                    @submit="handleAddSection"
                    @cancel="showAddSection = false"
                />
            </div>
            <button
                v-else
                class="tw:flex tw:w-full tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-dashed tw:border-navy-20 tw:py-3 tw:text-sm tw:font-medium tw:text-navy-60 tw:transition-colors tw:cursor-pointer tw:hover:border-primary tw:hover:bg-primary/5 tw:hover:text-primary"
                @click="showAddSection = true"
            >
                <Plus class="tw:size-4" />
                Add section
            </button>
        </template>

        <p
            v-if="assignment.sections.length === 0 && released"
            class="tw:text-sm tw:text-navy-50 tw:py-8 tw:text-center"
        >
            No sections yet.
        </p>

        <McConfirmDialog
            :open="!!pendingDelete"
            :title="`Delete this ${pendingDelete?.kind ?? 'item'}?`"
            :description="
                pendingDelete?.kind === 'section'
                    ? `“${pendingDelete?.label}” and all its questions will be permanently removed.`
                    : `This ${pendingDelete?.label ?? 'question'} will be permanently removed.`
            "
            :loading="isDeleting"
            @update:open="(v) => !v && (pendingDelete = null)"
            @confirm="confirmDelete"
        />
    </div>
</template>
