<script setup lang="ts">
import { Paperclip, X } from 'lucide-vue-next'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'

import {
    createAssignmentFormSchema,
    type CreateAssignmentFormData,
} from '~/features/types/forms/assignment'
import classesData from '~/data/classes.json'

interface ClassItem {
    id: number
    name: string
    semester: string
    students: number
    status: 'active' | 'closed'
}

const classes = (classesData.classes as ClassItem[]).filter((c) => c.status === 'active')

const classOptions = computed(() =>
    classes.map((c) => ({
        value: c.id,
        label: c.name,
    })),
)

const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'closed', label: 'Closed' },
]

const emit = defineEmits<{
    save: [values: CreateAssignmentFormData & { attachmentFiles?: string[] }]
    cancel: []
}>()

const { handleSubmit, errors } = useForm<CreateAssignmentFormData>({
    validationSchema: toTypedSchema(createAssignmentFormSchema),
    initialValues: {
        name: '',
        dueDate: '',
        classId: 0,
        status: 'active',
        description: '',
        instructions: '',
        points: 100,
    },
})

const attachedFiles = ref<File[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

const triggerFileInput = () => {
    fileInputRef.value?.click()
}

const handleFileChange = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (target.files) {
        attachedFiles.value.push(...Array.from(target.files))
        target.value = ''
    }
}

const removeFile = (index: number) => {
    attachedFiles.value.splice(index, 1)
}

const handleSave = handleSubmit((values) => {
    emit('save', {
        ...values,
        attachmentFiles: attachedFiles.value.map((f) => f.name),
    })
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
            <label class="tw:text-sm tw:font-medium">Assignment Name</label>
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
                placeholder="1. Step one&#10;2. Step two&#10;3. Step three"
            />
        </div>
        <div class="tw:grid tw:grid-cols-2 tw:gap-4">
            <div class="tw:flex tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">Due Date</label>
                <McInput name="dueDate" placeholder="e.g., 2025-02-20" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">Points</label>
                <McInput name="points" type="number" placeholder="e.g., 100" />
            </div>
        </div>
        <div class="tw:grid tw:grid-cols-2 tw:gap-4">
            <div class="tw:flex tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">Class</label>
                <McSelect
                    name="classId"
                    placeholder="Select a class"
                    :options="classOptions"
                    option-value="value"
                    option-label="label"
                />
                <span v-if="errors.classId" class="tw:text-xs tw:text-red-500">
                    {{ errors.classId }}
                </span>
            </div>
            <div class="tw:flex tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">Status</label>
                <McSelect
                    name="status"
                    placeholder="Select status"
                    :options="statusOptions"
                    option-value="value"
                    option-label="label"
                />
                <span v-if="errors.status" class="tw:text-xs tw:text-red-500">
                    {{ errors.status }}
                </span>
            </div>
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Attachments</label>
            <input
                ref="fileInputRef"
                type="file"
                multiple
                class="tw:hidden"
                @change="handleFileChange"
            />
            <div v-if="attachedFiles.length > 0" class="tw:flex tw:flex-col tw:gap-2">
                <div
                    v-for="(file, index) in attachedFiles"
                    :key="index"
                    class="tw:flex tw:items-center tw:justify-between tw:p-2 tw:bg-gray-50 tw:border tw:border-gray-200 tw:rounded-md"
                >
                    <div class="tw:flex tw:items-center tw:gap-2">
                        <Paperclip class="tw:w-4 tw:h-4 tw:text-gray-500" />
                        <span class="tw:text-sm tw:truncate tw:max-w-48">{{ file.name }}</span>
                    </div>
                    <button
                        type="button"
                        class="tw:p-1 tw:rounded tw:hover:bg-gray-200"
                        @click="removeFile(index)"
                    >
                        <X class="tw:w-4 tw:h-4 tw:text-gray-500" />
                    </button>
                </div>
            </div>
            <McButton type="button" variant="outline" @click="triggerFileInput">
                <Paperclip class="tw:w-4 tw:h-4 tw:mr-1" />
                Add Attachment
            </McButton>
        </div>
    </form>
    <McDialogFooter>
        <McButton variant="outline" @click="handleCancel">Cancel</McButton>
        <McButton @click="handleSave">Create Assignment</McButton>
    </McDialogFooter>
</template>
