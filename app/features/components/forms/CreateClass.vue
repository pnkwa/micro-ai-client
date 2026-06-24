<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'

import { createClassFormSchema, type CreateClassFormData } from '~/features/types/forms/class'

const emit = defineEmits<{
    save: [values: CreateClassFormData]
    cancel: []
}>()

const { handleSubmit } = useForm<CreateClassFormData>({
    validationSchema: toTypedSchema(createClassFormSchema),
    initialValues: {
        name: '',
        semester: '',
        code: '',
        status: 'active',
    },
})

const handleSave = handleSubmit((values) => {
    emit('save', values)
})

const handleCancel = () => {
    emit('cancel')
}

const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'closed', label: 'Closed' },
]
</script>

<template>
    <McDialogHeader>
        <McDialogTitle>Create New Class</McDialogTitle>
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
                name="status"
                :options="statusOptions"
                option-value="value"
                option-label="label"
                placeholder="Select status"
            />
        </div>
    </form>
    <McDialogFooter>
        <McButton variant="outline" @click="handleCancel">Cancel</McButton>
        <McButton @click="handleSave">Create Class</McButton>
    </McDialogFooter>
</template>
