<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'

import { enrollStudentFormSchema, type EnrollStudentFormData } from '~/features/types/forms/student'

const emit = defineEmits<{
    save: [values: EnrollStudentFormData]
    cancel: []
}>()

const { handleSubmit } = useForm<EnrollStudentFormData>({
    validationSchema: toTypedSchema(enrollStudentFormSchema),
    initialValues: {
        student_id: '',
        email: '',
        firstname: '',
        lastname: '',
    },
})

const handleSave = handleSubmit((values) => {
    emit('save', values)
})
</script>

<template>
    <McDialogHeader>
        <McDialogTitle>Add Student</McDialogTitle>
        <McDialogDescription>
            Enrol a single student into this class by their university ID.
        </McDialogDescription>
    </McDialogHeader>
    <form class="tw:flex tw:flex-col tw:gap-4 tw:py-4" @submit.prevent="handleSave">
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Student ID</label>
            <McInput name="student_id" placeholder="9-digit university ID" maxlength="9" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Email</label>
            <McInput name="email" placeholder="student@university.edu" />
        </div>
        <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <div class="tw:flex tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">First Name</label>
                <McInput name="firstname" placeholder="First name" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">Last Name</label>
                <McInput name="lastname" placeholder="Last name" />
            </div>
        </div>
    </form>
    <McDialogFooter>
        <McButton variant="outline" @click="emit('cancel')">Cancel</McButton>
        <McButton @click="handleSave">Add Student</McButton>
    </McDialogFooter>
</template>
