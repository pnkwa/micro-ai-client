<script setup lang="ts">
import type { SubmitAssignmentFormData } from '~/features/types/forms/submit-assignment'
import { submitAssignmentFormSchema } from '~/features/types/forms/submit-assignment'
import classesData from '~/data/classes.json'
import { FileImage, X } from 'lucide-vue-next'

const emit = defineEmits<{
    save: [values: SubmitAssignmentFormData & { assignmentFile?: File | null }]
    cancel: []
}>()

const { handleSubmit } = useForm<SubmitAssignmentFormData>({
    validationSchema: toTypedSchema(submitAssignmentFormSchema),
    initialValues: {
        studentName: '',
        studentEmail: '',
        studentIdNumber: '',
        classId: 0,
        details: null,
        assignmentFile: null,
    },
})

const handleSubmitAssignment = handleSubmit((values) => {
    emit('save', values)
})

const handleCancel = () => {
    emit('cancel')
}

const attachedFile = ref<File | null>(null)

interface ClassItem {
    id: number
    name: string
    students: number
    status: 'active' | 'inactive'
}

const classes = ref<ClassItem[]>(classesData.classes as ClassItem[])
const activeClasses = computed(() => classes.value.filter((c) => c.status === 'active'))
const classOptions = computed(() =>
    activeClasses.value.map((c) => ({ value: c.id, label: c.name })),
)

const handleFileChange = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (target.files && target.files[0]) {
        attachedFile.value = target.files[0]
    }
}

const fileInputRef = ref<HTMLInputElement | null>(null)
const triggerFileInput = () => {
    fileInputRef.value?.click()
}

const removeFile = () => {
    attachedFile.value = null
    if (fileInputRef.value) {
        fileInputRef.value.value = ''
    }
}

const getFileIcon = (_file: File) => FileImage

const getFileIconColor = (_file: File) => 'tw:text-green-500 tw:bg-green-50'
</script>
<template>
    <McDialogHeader>
        <McDialogTitle>Submit Assignment</McDialogTitle>
        <McDialogDescription>Enter your information to submit the assignment.</McDialogDescription>
    </McDialogHeader>
    <form class="tw:flex tw:flex-col tw:gap-4 tw:py-4" @submit.prevent="handleSubmitAssignment">
        <div class="tw:grid tw:grid-cols-2 tw:gap-4">
            <div class="tw:flex tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">
                    Full Name
                    <span class="tw:text-red-500">*</span>
                </label>
                <McInput name="studentName" placeholder="Enter your full name" />
            </div>

            <div class="tw:flex tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">
                    Email
                    <span class="tw:text-red-500">*</span>
                </label>
                <McInput name="studentEmail" type="email" placeholder="Enter your email" />
            </div>
        </div>

        <div class="tw:grid tw:grid-cols-2 tw:gap-4">
            <div class="tw:flex tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">
                    Student ID
                    <span class="tw:text-red-500">*</span>
                </label>
                <McInput name="studentIdNumber" placeholder="Enter your student ID" />
            </div>

            <div class="tw:flex tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">
                    Class
                    <span class="tw:text-red-500">*</span>
                </label>
                <McSelect
                    name="classId"
                    :options="classOptions"
                    option-value="value"
                    option-label="label"
                    placeholder="Select a class"
                />
            </div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Details (optional)</label>
            <McTextarea
                name="detail"
                class="detail-textarea"
                placeholder="Write your submission details here..."
            />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Attach File (optional)</label>

            <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                class="tw:hidden"
                @change="handleFileChange"
            />

            <!-- File Preview -->
            <div
                v-if="attachedFile"
                class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:px-3 tw:py-2.5 tw:rounded-lg tw:border tw:border-border tw:bg-muted/40"
            >
                <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
                    <div
                        class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded-md tw:shrink-0"
                        :class="getFileIconColor(attachedFile)"
                    >
                        <component :is="getFileIcon(attachedFile)" class="tw:size-4" />
                    </div>
                    <div class="tw:flex tw:flex-col tw:min-w-0">
                        <span class="tw:text-sm tw:font-medium tw:truncate">
                            {{ attachedFile.name }}
                        </span>
                        <span class="tw:text-xs tw:text-muted-foreground">
                            {{ (attachedFile.size / 1024).toFixed(1) }} KB
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    aria-label="Remove file"
                    class="tw:shrink-0 tw:flex tw:items-center tw:justify-center tw:size-7 tw:rounded-md tw:text-muted-foreground tw:hover:text-danger tw:hover:bg-danger/10 tw:transition-colors"
                    @click="removeFile"
                >
                    <X class="tw:size-4" />
                </button>
            </div>

            <!-- Upload Button -->
            <button
                v-else
                type="button"
                class="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:w-full tw:px-4 tw:py-6 tw:rounded-lg tw:border tw:border-dashed tw:border-border tw:text-sm tw:text-muted-foreground tw:hover:border-primary tw:hover:text-primary tw:hover:bg-primary/5 tw:transition-all tw:cursor-pointer"
                @click="triggerFileInput"
            >
                <Paperclip class="tw:size-4" />
                <span>Click to attach an image</span>
                <span class="tw:text-xs tw:opacity-60">(JPG, PNG, WEBP · max 10MB)</span>
            </button>
        </div>
    </form>
    <McDialogFooter>
        <McButton variant="outline" @click="handleCancel">Cancel</McButton>
        <McButton @click="handleSubmitAssignment">Submit</McButton>
    </McDialogFooter>
</template>
