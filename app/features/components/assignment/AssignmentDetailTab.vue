<script setup lang="ts">
import { Calendar, Trophy, ClipboardList, Paperclip, FileText, Pencil, Layers } from '@lucide/vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import type { z } from 'zod'
import { toast } from 'vue-sonner'
import {
    assignmentService,
    assignmentTotalPoints,
    type Assignment,
} from '~/services/assignmentService'
import { createAssignmentFormSchema } from '~/features/types/forms/assignment'
import {
    slideCollectionService,
    type SlideCollectionListItem,
} from '~/services/slideCollectionService'

const props = defineProps<{
    assignment: Assignment
    isStudent: boolean
}>()

const emit = defineEmits<{ reload: [] }>()

const { $dayjs } = useNuxtApp()
const formatDate = (date: string) => $dayjs(date).format('MMM D, YYYY HH:mm')

const editSchema = createAssignmentFormSchema.omit({ classId: true, attachments: true })
type EditValues = z.infer<typeof editSchema>

const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'closed', label: 'Closed' },
]

const isEditing = ref(false)
const isSaving = ref(false)

/**
 * The slide collection a `slide_identification` question grades against (BE-ADR-011).
 *
 * Outside the vee-validate schema, like the exam tab's own picker: that schema is the shared
 * create-assignment shape and this field is not part of it. Only offered once the assignment
 * actually has a slide question, or already has a collection, so an assignment of multiple-choice
 * questions is not asked about something it has no use for.
 *
 * Without one the grader cannot resolve the slide, so every slide answer routes to instructor
 * review - the submission still works, it just cannot be marked automatically.
 */
const collections = ref<SlideCollectionListItem[]>([])
const slideCollectionId = ref(0)

const hasSlideQuestions = computed(() =>
    props.assignment.exercises.some((ex) =>
        ex.questions.some((q) => q.type === 'slide_identification'),
    ),
)
const showCollection = computed(
    () => hasSlideQuestions.value || props.assignment.slide_collection_id != null,
)
const collectionName = computed(
    () => collections.value.find((c) => c.id === props.assignment.slide_collection_id)?.name ?? '-',
)
const collectionOptions = computed(() => [
    { value: 0, label: 'None (grade slide answers by hand)' },
    ...collections.value.map((c) => ({ value: c.id, label: c.name })),
])

// The list endpoint is staff-only, so a student never calls it.
onMounted(async () => {
    if (props.isStudent || !showCollection.value) return
    try {
        collections.value = await slideCollectionService.list()
    } catch {
        /* the name just falls back to the placeholder dash */
    }
})

const totalPoints = computed(() => assignmentTotalPoints(props.assignment))

const currentValues = (): EditValues => ({
    name: props.assignment.name,
    dueDate: $dayjs(props.assignment.due_date).format('YYYY-MM-DDTHH:mm'),
    status: props.assignment.status,
    description: props.assignment.description ?? '',
    instructions: props.assignment.instructions ?? '',
})

const { handleSubmit, resetForm, errors } = useForm<EditValues>({
    validationSchema: toTypedSchema(editSchema),
    initialValues: currentValues(),
})

const enableEdit = () => {
    resetForm({ values: currentValues() })
    slideCollectionId.value = props.assignment.slide_collection_id ?? 0
    isEditing.value = true
}

const onSave = handleSubmit(async (values) => {
    isSaving.value = true
    try {
        await assignmentService.update(props.assignment.id, {
            name: values.name,
            dueDate: values.dueDate,
            status: values.status,
            description: values.description || undefined,
            instructions: values.instructions || undefined,
            // Only when the field is on screen, so editing an ordinary assignment never sends it.
            // 0 is the "None" option and clears the collection.
            ...(showCollection.value ? { slideCollectionId: slideCollectionId.value || null } : {}),
        })
        emit('reload')
        isEditing.value = false
        toast.success('Assignment updated')
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to update assignment'))
    } finally {
        isSaving.value = false
    }
})
</script>

<template>
    <form
        v-if="isEditing"
        class="tw:rounded-md tw:border tw:border-gray-200 tw:p-6 tw:flex tw:flex-col tw:gap-4 tw:bg-navy-10/20"
        @submit.prevent="onSave"
    >
        <div
            class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-navy-20 tw:pb-3 tw:text-sm tw:font-semibold tw:text-navy-60"
        >
            <Pencil class="tw:size-4 tw:text-navy-30" />
            Edit assignment details
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">
                Assignment Name
                <span class="tw:text-red-500">*</span>
            </label>
            <McInput
                name="name"
                placeholder="e.g., Mitosis Analysis"
                class="tw:bg-white/50 tw:rounded-md/50 tw:rounded-md"
            />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">
                Due Date
                <span class="tw:text-red-500">*</span>
            </label>
            <McDatePicker
                name="dueDate"
                with-time
                placeholder="Select date & time"
                class="tw:bg-white/50 tw:rounded-md"
            />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">
                Status
                <span class="tw:text-red-500">*</span>
            </label>
            <McSelect
                name="status"
                placeholder="Select status"
                :options="statusOptions"
                option-value="value"
                option-label="label"
                class="tw:bg-white/50 tw:rounded-md"
            />
            <span v-if="errors.status" class="tw:text-xs tw:text-red-500">{{ errors.status }}</span>
        </div>

        <div v-if="showCollection" class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Slide collection</label>
            <McSelect
                v-model="slideCollectionId"
                placeholder="Select a slide collection"
                :options="collectionOptions"
                option-value="value"
                option-label="label"
                class="tw:bg-white/50 tw:rounded-md"
            />
            <span class="tw:text-xs tw:text-navy-50">
                Slide identification answers are graded against this collection. Without one they go
                to you for manual marking.
            </span>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Description</label>
            <McTextarea
                name="description"
                placeholder="Describe the assignment..."
                class="tw:bg-white/50 tw:rounded-md"
            />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Instructions</label>
            <McTextarea
                name="instructions"
                auto-list
                class="tw:min-h-32 tw:text-sm tw:leading-relaxed tw:bg-white/50 tw:rounded-md"
                placeholder="1. Step one&#10;2. Step two"
            />
        </div>

        <div class="tw:flex tw:justify-end tw:gap-2">
            <McButton variant="outline" type="button" @click="isEditing = false">Cancel</McButton>
            <McButton type="submit" :loading="isSaving" @click="onSave">Save changes</McButton>
        </div>
    </form>

    <!-- Read view -->
    <template v-else>
        <div v-if="!isStudent" class="tw:flex tw:justify-end tw:mb-3">
            <McButton variant="outline" size="sm" @click="enableEdit">
                <Pencil class="tw:w-3.5 tw:h-3.5 tw:mr-1" />
                Edit
            </McButton>
        </div>

        <div class="tw:grid tw:grid-cols-2 tw:gap-4 tw:mb-4">
            <div
                class="tw:flex tw:items-center tw:gap-4 tw:p-4 tw:bg-white/50 tw:rounded-md tw:border tw:border-navy-20"
            >
                <Calendar class="tw:w-5 tw:h-5 tw:text-navy-60" />
                <div>
                    <p class="tw:text-sm tw:text-navy-60">Due Date</p>
                    <p class="tw:text-base tw:font-medium">{{ formatDate(assignment.due_date) }}</p>
                </div>
            </div>
            <div
                class="tw:flex tw:items-center tw:gap-4 tw:p-4 tw:bg-white/50 tw:rounded-md tw:rounded-md tw:border tw:border-gray-200"
            >
                <Trophy class="tw:w-5 tw:h-5 tw:text-navy-60" />
                <div>
                    <p class="tw:text-sm tw:text-navy-60">Total Points</p>
                    <p class="tw:text-base tw:font-medium">
                        {{ totalPoints }} pt{{ totalPoints === 1 ? '' : 's' }}
                    </p>
                </div>
            </div>
            <!-- Staff only, and only where a slide question makes it mean something. A student is
                 never shown which collection their answers are keyed against: it is the answer
                 key by another name. -->
            <div
                v-if="showCollection && !isStudent"
                class="tw:col-span-2 tw:flex tw:items-center tw:gap-4 tw:p-4 tw:bg-white/50 tw:rounded-md tw:border tw:border-navy-20"
            >
                <Layers class="tw:w-5 tw:h-5 tw:text-navy-60" />
                <div>
                    <p class="tw:text-sm tw:text-navy-60">Slide collection</p>
                    <p class="tw:text-base tw:font-medium">{{ collectionName }}</p>
                    <p
                        v-if="assignment.slide_collection_id == null"
                        class="tw:text-xs tw:text-warning"
                    >
                        Slide answers will come to you for manual marking.
                    </p>
                </div>
            </div>
        </div>

        <div
            v-if="assignment.description"
            class="tw:bg-white/50 tw:rounded-md tw:border tw:border-gray-200 tw:p-6 tw:mb-4"
        >
            <h2 class="tw:text-base tw:font-semibold tw:text-navy-100 tw:mb-3">Description</h2>
            <p class="tw:text-sm tw:leading-relaxed tw:text-navy-80">
                {{ assignment.description }}
            </p>
        </div>

        <div
            v-if="assignment.instructions"
            class="tw:bg-white/50 tw:rounded-md tw:border tw:border-gray-200 tw:p-6 tw:mb-4"
        >
            <h2
                class="tw:flex tw:items-center tw:gap-2 tw:text-base tw:font-semibold tw:text-navy-100 tw:mb-3"
            >
                <ClipboardList class="tw:w-5 tw:h-5" />
                Instructions
            </h2>
            <div class="tw:text-sm tw:leading-loose tw:text-navy-80">
                <p
                    v-for="(line, i) in assignment.instructions.split('\n')"
                    :key="i"
                    class="tw:mb-1 last:tw:mb-0"
                >
                    {{ line }}
                </p>
            </div>
        </div>

        <div
            v-if="assignment.attachments.length > 0"
            class="tw:bg-white/50 tw:rounded-md tw:border tw:border-gray-200 tw:p-6"
        >
            <h2
                class="tw:flex tw:items-center tw:gap-2 tw:text-base tw:font-semibold tw:text-navy-100 tw:mb-3"
            >
                <Paperclip class="tw:w-5 tw:h-5" />
                Attachments
            </h2>
            <div class="tw:flex tw:flex-col tw:gap-2">
                <a
                    v-for="att in assignment.attachments"
                    :key="att.id"
                    :href="att.path"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="tw:flex tw:items-center tw:gap-2 tw:p-2 tw:bg-gray-50 tw:rounded-md tw:hover:bg-gray-100"
                >
                    <FileText class="tw:w-4 tw:h-4 tw:text-primary" />
                    <span class="tw:text-sm">{{ att.filename }}</span>
                </a>
            </div>
        </div>
    </template>
</template>
