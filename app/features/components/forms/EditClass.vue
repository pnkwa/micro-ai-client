<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { Trash2 } from 'lucide-vue-next'

import { classFormSchema, type EditClassFormData } from '~/features/types/forms/class'

const props = defineProps<{
    initialValues: EditClassFormData
}>()

const emit = defineEmits<{
    save: [values: EditClassFormData]
    cancel: []
    delete: [id: number]
}>()

const isDeleteModalOpen = ref(false)

const { handleSubmit, defineField } = useForm<EditClassFormData>({
    validationSchema: toTypedSchema(classFormSchema),
    initialValues: props.initialValues,
})

const [status] = defineField('status')

const handleSave = handleSubmit((values) => {
    emit('save', values)
})

const handleCancel = () => {
    emit('cancel')
}

const openDeleteModal = () => {
    isDeleteModalOpen.value = true
}

const handleDeleteConfirm = () => {
    emit('delete', props.initialValues.id)
    isDeleteModalOpen.value = false
}

const handleDeleteCancel = () => {
    isDeleteModalOpen.value = false
}

const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'closed', label: 'Closed' },
]
</script>

<template>
    <McDialogHeader>
        <McDialogTitle>Edit Class</McDialogTitle>
    </McDialogHeader>
    <form class="tw:flex tw:flex-col tw:gap-4 tw:py-4" @submit.prevent="handleSave">
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Class Name</label>
            <McInput name="name" placeholder="e.g., BIO-301 Cell Biology" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Semester</label>
            <McInput name="semester" placeholder="e.g., Fall 2025" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Class Code</label>
            <McInput name="code" placeholder="e.g., MICRO01" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Status</label>
            <McSelect
                v-model="status"
                :options="statusOptions"
                option-value="value"
                option-label="label"
                placeholder="Select status"
            />
        </div>
    </form>
    <McDialogFooter
        class="tw:flex tw:flex-col-reverse tw:gap-3 tw:sm:flex-row tw:sm:justify-between tw:w-full"
    >
        <McButton
            variant="ghost"
            class="tw:w-full tw:sm:w-auto tw:text-red-500 tw:hover:text-red-600 tw:hover:bg-red-50"
            @click="openDeleteModal"
        >
            <Trash2 class="tw:w-4 tw:h-4 tw:mr-1" />
            Delete
        </McButton>

        <div class="tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row">
            <McButton class="tw:order-2 tw:sm:order-1" variant="outline" @click="handleCancel">
                Cancel
            </McButton>
            <McButton class="tw:order-1 tw:sm:order-2" @click="handleSave">Save Changes</McButton>
        </div>
    </McDialogFooter>

    <McDialog v-model:open="isDeleteModalOpen">
        <McDialogContent class="tw:sm:max-w-md">
            <McConfirmModal
                title="Delete Class"
                description="Are you sure you want to delete this class? This action cannot be undone."
                confirm-text="Delete"
                cancel-text="Cancel"
                variant="destructive"
                @confirm="handleDeleteConfirm"
                @cancel="handleDeleteCancel"
            />
        </McDialogContent>
    </McDialog>
</template>
