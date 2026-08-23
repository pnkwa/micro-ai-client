<script setup lang="ts">
import { Link, X } from '@lucide/vue'
import { useForm, useFieldArray } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import {
    createAssignmentFormSchema,
    type CreateAssignmentFormData,
} from '~/features/types/forms/assignment'

const props = defineProps<{
    // The form is always opened from a class page; every new assignment belongs to this class
    // and starts active, so neither is shown as a field.
    defaultClassId: number
}>()

const emit = defineEmits<{
    save: [values: CreateAssignmentFormData]
    cancel: []
}>()

const { handleSubmit, errors } = useForm<CreateAssignmentFormData>({
    validationSchema: toTypedSchema(createAssignmentFormSchema),
    initialValues: {
        name: '',
        dueDate: '',
        classId: props.defaultClassId,
        status: 'active',
        description: '',
        instructions: '',
        attachments: [],
    },
})

const {
    fields: attachmentFields,
    push: addAttachment,
    remove: removeAttachment,
} = useFieldArray<{ path: string; filename?: string }>('attachments')

const attachmentError = (index: number, field: 'path' | 'filename' = 'path') =>
    (errors.value as Record<string, string>)[`attachments[${index}].${field}`]

const handleSave = handleSubmit((values) => {
    emit('save', values)
})

const handleCancel = () => {
    emit('cancel')
}
</script>

<template>
    <McDialogHeader>
        <McDialogTitle>Create New Assignment</McDialogTitle>
    </McDialogHeader>
    <form
        class="tw:flex tw:flex-col tw:gap-4 tw:p-2 tw:max-h-[60vh] tw:overflow-y-auto"
        @submit.prevent="handleSave"
    >
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">
                Assignment Name
                <span class="tw:text-red-500">*</span>
            </label>
            <McInput name="name" placeholder="e.g., Mitosis Analysis" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Description</label>
            <McTextarea name="description" placeholder="Describe the assignment..." />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Instructions</label>
            <McTextarea
                name="instructions"
                auto-list
                class="tw:min-h-32 tw:text-sm tw:leading-relaxed"
                placeholder="1. Step one&#10;2. Step two&#10;3. Step three"
            />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">
                Due Date
                <span class="tw:text-red-500">*</span>
            </label>
            <McDatePicker name="dueDate" with-time placeholder="Select date & time" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Attachments</label>
            <p class="tw:text-xs tw:text-navy-60">
                Paste links to reference material (PDF, slides, video…).
            </p>
            <div v-if="attachmentFields.length > 0" class="tw:flex tw:flex-col tw:gap-2">
                <div
                    v-for="(field, index) in attachmentFields"
                    :key="field.key"
                    class="tw:flex tw:items-start tw:gap-2"
                >
                    <div class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-2">
                        <div class="tw:flex tw:flex-col tw:gap-1">
                            <McInput
                                :name="`attachments[${index}].path`"
                                icon-prepend="Link"
                                placeholder="https://example.com/lab-guide.pdf"
                            />
                            <span v-if="attachmentError(index)" class="tw:text-xs tw:text-red-500">
                                {{ attachmentError(index) }}
                            </span>
                        </div>
                        <!--
                            Under the URL, not beside it: this is what students see in the
                            Attachments list, and the URL is what it points at. Optional, and the
                            placeholder says what happens if it is left alone, so an instructor
                            pasting a link and moving on still gets a sensible name.
                        -->
                        <div class="tw:flex tw:flex-col tw:gap-1">
                            <McInput
                                :name="`attachments[${index}].filename`"
                                placeholder="Link name (optional, taken from the URL if blank)"
                            />
                            <span
                                v-if="attachmentError(index, 'filename')"
                                class="tw:text-xs tw:text-red-500"
                            >
                                {{ attachmentError(index, 'filename') }}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        aria-label="Remove attachment"
                        class="tw:flex tw:size-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:border tw:border-input tw:text-navy-60 tw:transition-colors tw:cursor-pointer tw:hover:border-danger tw:hover:text-danger"
                        @click="removeAttachment(index)"
                    >
                        <X class="tw:size-4" />
                    </button>
                </div>
            </div>
            <McButton
                type="button"
                variant="outline"
                @click="addAttachment({ path: '', filename: '' })"
            >
                <Link class="tw:w-4 tw:h-4 tw:mr-1" />
                Add link
            </McButton>
        </div>
    </form>
    <McDialogFooter>
        <McButton variant="outline" @click="handleCancel">Cancel</McButton>
        <McButton @click="handleSave">Create Assignment</McButton>
    </McDialogFooter>
</template>
