<script setup lang="ts">
import {
    Calendar,
    Trophy,
    ClipboardList,
    Paperclip,
    FileText,
    Pencil,
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

const props = defineProps<{
    assignment: Assignment
    isStudent: boolean
}>()

const emit = defineEmits<{ reload: [] }>()

const { $dayjs } = useNuxtApp()

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

/*
 * No slide-collection panel here any more.
 *
 * It moved onto each question's `image_question` in v0.7 (BE-ADR-034) and is now printed under the
 * station that uses it in AssignmentSections, which is where an author is looking when the answer
 * matters. Summing it at the top of the page restated one collection for the common case and, for
 * the case it existed to cover, listed several without saying which station had which - the
 * question it was meant to answer. `none set` on the station itself replaces the count of
 * questions missing one.
 */

const totalPoints = computed(() => assignmentTotalPoints(props.assignment))

const currentValues = (): EditValues => ({
    name: props.assignment.name,
    // Blank stays blank: an assignment may have no deadline, and seeding "Invalid Date" into the
    // picker would write a bogus one back on the next save.
    dueDate: props.assignment.due_date
        ? $dayjs(props.assignment.due_date).format('YYYY-MM-DDTHH:mm')
        : '',
    status: props.assignment.status,
    description: props.assignment.description ?? '',
    instructions: props.assignment.instructions ?? '',
})

const { handleSubmit, resetForm, errors } = useForm<EditValues>({
    validationSchema: toTypedSchema(editSchema),
    initialValues: currentValues(),
})

/**
 * The submission window, outside the vee-validate schema because that schema is the shared
 * create-assignment shape and these are not part of it.
 *
 * No longer exam-only (BE-ADR-033). Separating `closes_at` from `due_date` is what makes late
 * submission expressible: work handed in between the two lands and counts late, and a blank
 * `closes_at` means no hard cut-off at all.
 */
const opensAt = ref('')
const closesAt = ref('')
const toLocalDateTime = (iso: string | null | undefined) =>
    iso ? $dayjs(iso).format('YYYY-MM-DDTHH:mm') : ''

const enableEdit = () => {
    resetForm({ values: currentValues() })
    opensAt.value = toLocalDateTime(props.assignment.opens_at)
    closesAt.value = toLocalDateTime(props.assignment.closes_at)
    isEditing.value = true
}

const onSave = handleSubmit(async (values) => {
    isSaving.value = true
    try {
        await assignmentService.update(props.assignment.id, {
            name: values.name,
            // Empty clears the deadline, matching the window bounds below.
            dueDate: values.dueDate || null,
            status: values.status,
            description: values.description || undefined,
            instructions: values.instructions || undefined,
            // Empty clears the bound rather than leaving it alone, which is what lets an
            // instructor remove a window they set by mistake.
            opensAt: opensAt.value || null,
            closesAt: closesAt.value || null,
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
            <label class="tw:text-sm tw:font-medium">Due Date</label>
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

        <!-- The window, which regular assignments gained in v0.7. Due date stays separate: it is
             when the work is expected, while Closes is when the door shuts. A gap between them is
             a grace period in which a submission still lands and counts late. -->
        <div class="tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row tw:sm:gap-4">
            <div class="tw:flex tw:flex-1 tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">Opens</label>
                <McDatePicker
                    name=""
                    with-time
                    :model-value="opensAt"
                    placeholder="No start restriction"
                    class="tw:bg-white/50 tw:rounded-md"
                    @update:model-value="opensAt = String($event ?? '')"
                />
            </div>
            <div class="tw:flex tw:flex-1 tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">Closes</label>
                <McDatePicker
                    name=""
                    with-time
                    :model-value="closesAt"
                    placeholder="No cut-off"
                    class="tw:bg-white/50 tw:rounded-md"
                    @update:model-value="closesAt = String($event ?? '')"
                />
            </div>
        </div>
        <p class="tw:text-xs tw:text-navy-50">
            Leave Closes blank for no cut-off. Work handed in after the due date but before Closes
            still lands, and is marked late.
        </p>

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
                    <p class="tw:text-base tw:font-medium">
                        {{ dueDateText(assignment.due_date) }}
                    </p>
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
