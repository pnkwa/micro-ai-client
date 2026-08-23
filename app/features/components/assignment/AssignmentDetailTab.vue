<script setup lang="ts">
import {
    Calendar,
    Trophy,
    ClipboardList,
    Paperclip,
    FileText,
    Pencil,
    Layers,
    Link,
    X,
    Check,
} from '@lucide/vue'
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

/**
 * Attachment editing, kept out of the assignment form on purpose.
 *
 * Each link is its own row against its own endpoint, so renaming one is a single PATCH rather than
 * a re-save of the whole assignment. `filename` is the field that matters: it is all a student
 * sees of the link, and it used to be frozen at creation and derived from the URL when the
 * instructor left it blank, which for anything with an opaque path is a link called "edit".
 */
const editingAttachmentId = ref<number | null>(null)
const attachmentDraft = ref('')
const isSavingAttachment = ref(false)
const newLink = reactive({ path: '', filename: '' })
const isAddingLink = ref(false)

const startRename = (id: number, current: string) => {
    editingAttachmentId.value = id
    attachmentDraft.value = current
}

const saveRename = async (attachmentId: number) => {
    const filename = attachmentDraft.value.trim()
    if (!filename) return toast.error('Give the link a name')
    isSavingAttachment.value = true
    try {
        await assignmentService.updateAttachment(props.assignment.id, attachmentId, { filename })
        editingAttachmentId.value = null
        emit('reload')
        toast.success('Link renamed')
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to rename the link'))
    } finally {
        isSavingAttachment.value = false
    }
}

const addLink = async () => {
    if (!newLink.path.trim()) return toast.error('Paste a link first')
    isAddingLink.value = true
    try {
        await assignmentService.addAttachment(props.assignment.id, {
            path: newLink.path.trim(),
            filename: newLink.filename,
        })
        newLink.path = ''
        newLink.filename = ''
        emit('reload')
        toast.success('Link added')
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to add the link'))
    } finally {
        isAddingLink.value = false
    }
}

const removeLink = async (attachmentId: number) => {
    try {
        await assignmentService.removeAttachment(props.assignment.id, attachmentId)
        emit('reload')
        toast.success('Link removed')
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to remove the link'))
    }
}

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

        <!-- Shown to staff even when empty, because that is where a link gets added. -->
        <div
            v-if="assignment.attachments.length > 0 || !isStudent"
            class="tw:bg-white/50 tw:rounded-md tw:border tw:border-gray-200 tw:p-6"
        >
            <h2
                class="tw:flex tw:items-center tw:gap-2 tw:text-base tw:font-semibold tw:text-navy-100 tw:mb-3"
            >
                <Paperclip class="tw:w-5 tw:h-5" />
                Attachments
            </h2>
            <div class="tw:flex tw:flex-col tw:gap-2">
                <template v-for="att in assignment.attachments" :key="att.id">
                    <!-- Renaming in place: the row becomes its own field rather than opening a
                         dialog, since one short string is the whole edit. -->
                    <div
                        v-if="editingAttachmentId === att.id"
                        class="tw:flex tw:items-center tw:gap-2"
                    >
                        <McInput
                            v-model="attachmentDraft"
                            class="tw:flex-1"
                            placeholder="Link name"
                            @keyup.enter="saveRename(att.id)"
                            @keyup.esc="editingAttachmentId = null"
                        />
                        <McButton
                            size="sm"
                            :loading="isSavingAttachment"
                            @click="saveRename(att.id)"
                        >
                            <Check class="tw:size-4" />
                        </McButton>
                        <McButton size="sm" variant="outline" @click="editingAttachmentId = null">
                            <X class="tw:size-4" />
                        </McButton>
                    </div>

                    <div
                        v-else
                        class="tw:flex tw:items-center tw:gap-2 tw:rounded-md tw:bg-gray-50 tw:p-2 tw:hover:bg-gray-100"
                    >
                        <a
                            :href="att.path"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-2"
                        >
                            <FileText class="tw:w-4 tw:h-4 tw:shrink-0 tw:text-primary" />
                            <span class="tw:truncate tw:text-sm">{{ att.filename }}</span>
                            <!-- The URL beside the name, dimmed: with the name authorable, the
                                 name alone no longer says where the link goes. -->
                            <span
                                class="tw:hidden tw:truncate tw:text-xs tw:text-navy-50 tw:sm:block"
                            >
                                {{ att.path }}
                            </span>
                        </a>
                        <template v-if="!isStudent">
                            <button
                                type="button"
                                aria-label="Rename link"
                                class="tw:shrink-0 tw:cursor-pointer tw:rounded tw:p-1 tw:text-navy-50 tw:transition-colors tw:hover:bg-primary/10 tw:hover:text-primary"
                                @click="startRename(att.id, att.filename)"
                            >
                                <Pencil class="tw:size-3.5" />
                            </button>
                            <button
                                type="button"
                                aria-label="Remove link"
                                class="tw:shrink-0 tw:cursor-pointer tw:rounded tw:p-1 tw:text-navy-50 tw:transition-colors tw:hover:bg-danger/10 tw:hover:text-danger"
                                @click="removeLink(att.id)"
                            >
                                <X class="tw:size-4" />
                            </button>
                        </template>
                    </div>
                </template>

                <p v-if="assignment.attachments.length === 0" class="tw:text-sm tw:text-navy-50">
                    No links yet.
                </p>

                <!-- Adding is staff-only and lives here rather than in the edit form: the form
                     saves the assignment's scalars, while each link is its own endpoint. -->
                <div v-if="!isStudent" class="tw:mt-2 tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row">
                    <McInput
                        v-model="newLink.path"
                        class="tw:flex-1"
                        icon-prepend="Link"
                        placeholder="https://example.com/lab-guide.pdf"
                    />
                    <McInput
                        v-model="newLink.filename"
                        class="tw:flex-1"
                        placeholder="Link name (optional)"
                        @keyup.enter="addLink"
                    />
                    <McButton variant="outline" :loading="isAddingLink" @click="addLink">
                        <Link class="tw:mr-1 tw:size-4" />
                        Add link
                    </McButton>
                </div>
            </div>
        </div>
    </template>
</template>
