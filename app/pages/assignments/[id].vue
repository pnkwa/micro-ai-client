<script setup lang="ts">
import {
    ArrowLeft,
    FileText,
    Calendar,
    ClipboardList,
    Send,
    Paperclip,
    Trophy,
} from 'lucide-vue-next'

import assignmentsData from '~/data/assignments.json'
import SubmitAssignment from '~/features/components/forms/SubmitAssignment.vue'
import type { SubmitAssignmentFormData } from '~/features/types/forms/submit-assignment'

interface AssignmentItem {
    id: number
    name: string
    dueDate: string
    classId: number
    submissions: number
    status: 'active' | 'closed'
    description?: string
    instructions?: string
    points?: number
    attachments?: string[]
}

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()

const authStore = useAuth()

const isStudent = computed(() => authStore.user?.role === 'student' || !authStore.user)

const assignmentId = computed(() => Number(route.params.id))
const assignment = computed(() => {
    return (assignmentsData.assignments as AssignmentItem[]).find(
        (a) => a.id === assignmentId.value,
    )
})

interface SubmissionRecord {
    studentName: string
    studentEmail: string
    studentIdNumber: string
    classId: number
    details?: string | null
    assignmentFileName?: string
}

const isSubmitDialogOpen = ref(false)
const submissions = ref<SubmissionRecord[]>([])

const goBack = () => {
    router.push('/assignments')
}

const openSubmitDialog = () => {
    isSubmitDialogOpen.value = true
}

const handleSubmitAssignment = (
    values: SubmitAssignmentFormData & { assignmentFile?: File | null },
) => {
    submissions.value.push({
        studentName: values.studentName,
        studentEmail: values.studentEmail,
        studentIdNumber: values.studentIdNumber,
        classId: values.classId,
        details: values.details,
        assignmentFileName: values.assignmentFile?.name || undefined,
    })
    isSubmitDialogOpen.value = false
}

const handleCancel = () => {
    isSubmitDialogOpen.value = false
}

const formatDate = (date: string) => {
    return $dayjs(date).format('MMMM D, YYYY')
}

const getStatusLabel = (status: string) => {
    return status === 'active' ? 'Active' : 'Closed'
}
</script>

<template>
    <div>
        <button
            class="tw:flex tw:items-center tw:gap-2 tw:mb-6 tw:text-navy-60 tw:cursor-pointer tw:hover:text-primary"
            @click="goBack"
        >
            <ArrowLeft class="tw:w-5 tw:h-5" />
            <span>Back to Assignments</span>
        </button>

        <template v-if="assignment">
            <div class="tw:flex tw:justify-between tw:items-start tw:mb-6 tw:flex-wrap tw:gap-4">
                <div class="tw:flex tw:items-center tw:gap-4">
                    <div
                        class="tw:w-12 tw:h-12 tw:flex tw:items-center tw:justify-center tw:bg-primary/10 tw:rounded-lg"
                    >
                        <FileText class="tw:w-6 tw:h-6 tw:text-primary" />
                    </div>
                    <div>
                        <h1 class="tw:text-2xl tw:font-bold tw:text-primary tw:mb-0.5">
                            {{ assignment.name }}
                        </h1>
                        <McBadge :variant="assignment.status === 'active' ? 'default' : 'outline'">
                            {{ getStatusLabel(assignment.status) }}
                        </McBadge>
                    </div>
                </div>
                <McButton
                    v-if="assignment.status === 'active' && isStudent"
                    @click="openSubmitDialog"
                >
                    <Send class="tw:w-4 tw:h-4 tw:mr-1" />
                    Submit Assignment
                </McButton>
            </div>

            <div class="tw:grid tw:grid-cols-2 tw:gap-4 tw:mb-6">
                <div
                    class="tw:flex tw:items-center tw:gap-4 tw:p-4 tw:bg-white tw:rounded-md tw:border tw:border-gray-200"
                >
                    <Calendar class="tw:w-5 tw:h-5 tw:text-navy-60" />
                    <div>
                        <p class="tw:text-sm tw:text-navy-60">Due Date</p>
                        <p class="tw:text-base tw:font-medium">
                            {{ formatDate(assignment.dueDate) }}
                        </p>
                    </div>
                </div>
                <div
                    v-if="assignment.points"
                    class="tw:flex tw:items-center tw:gap-4 tw:p-4 tw:bg-white tw:rounded-md tw:border tw:border-gray-200"
                >
                    <Trophy class="tw:w-5 tw:h-5 tw:text-navy-60" />
                    <div>
                        <p class="tw:text-sm tw:text-navy-60">Points</p>
                        <p class="tw:text-base tw:font-medium">{{ assignment.points }} pts</p>
                    </div>
                </div>
            </div>

            <div
                v-if="assignment.description"
                class="tw:bg-white tw:rounded-md tw:border tw:border-gray-200 tw:p-6 tw:mb-6"
            >
                <h2 class="section-title">Description</h2>
                <p class="description-text">{{ assignment.description }}</p>
            </div>

            <div
                v-if="assignment.instructions"
                class="tw:bg-white tw:rounded-md tw:border tw:border-gray-200 tw:p-6 tw:mb-6"
            >
                <h2 class="section-title">
                    <ClipboardList class="tw:w-5 tw:h-5 tw:mr-2" />
                    Instructions
                </h2>
                <div class="instructions-text">
                    <p v-for="(line, index) in assignment.instructions.split('\n')" :key="index">
                        {{ line }}
                    </p>
                </div>
            </div>

            <div
                v-if="assignment.attachments && assignment.attachments.length > 0"
                class="tw:bg-white tw:rounded-md tw:border tw:border-gray-200 tw:p-6 tw:mb-6"
            >
                <h2 class="section-title">
                    <Paperclip class="tw:w-5 tw:h-5 tw:mr-2" />
                    Attachments
                </h2>
                <div class="tw:flex tw:flex-col tw:gap-2">
                    <div
                        v-for="file in assignment.attachments"
                        :key="file"
                        class="tw:flex tw:items-center tw:gap-2 tw:p-2 tw:bg-gray-50 tw:rounded-md tw:cursor-pointer hover:tw:bg-gray-100 tw:hover:bg-gray-100"
                    >
                        <FileText class="tw:w-4 tw:h-4 tw:text-primary" />
                        <span>{{ file }}</span>
                    </div>
                </div>
            </div>
        </template>

        <template v-else>
            <div class="tw:bg-white tw:rounded-md tw:border tw:border-gray-200 tw:p-6 tw:mb-6">
                <h2 class="section-title">Assignment not found</h2>
                <p>The assignment you're looking for doesn't exist.</p>
                <McButton @click="goBack">Go Back</McButton>
            </div>
        </template>

        <McDialog v-model:open="isSubmitDialogOpen">
            <McDialogContent class="tw:sm:max-w-xl">
                <SubmitAssignment @save="handleSubmitAssignment" @cancel="handleCancel" />
            </McDialogContent>
        </McDialog>
    </div>
</template>

<style scoped lang="scss">
.submissions-section {
    background: white;
    border-radius: 8px;
    border: 1px solid var(--color-gray-200, #e5e7eb);
    padding: 1.5rem;
}

.section-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-navy-100);
    margin-bottom: 1rem;
}

.empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--color-navy-60);
}

.submissions-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.submission-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--color-gray-50, #f9fafb);
    border-radius: 6px;
}

.student-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.student-avatar {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 50%;
}

.student-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-navy-100);
}

.student-email {
    font-size: 0.75rem;
    color: var(--color-navy-60);
}

.submission-detail {
    font-size: 0.75rem;
    color: var(--color-navy-80);
    margin-top: 0.25rem;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.submission-file {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--color-primary);
    margin-top: 0.25rem;
}

.detail-textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: 6px;
    font-size: 0.875rem;
    resize: vertical;
    font-family: inherit;

    &:focus {
        outline: none;
        border-color: var(--color-primary);
    }
}

.file-preview {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: var(--color-gray-50, #f9fafb);
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: 6px;
}

.file-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.file-name {
    font-size: 0.875rem;
    color: var(--color-navy-100);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.remove-file {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    background: none;
    border: none;
    color: var(--color-navy-60);
    cursor: pointer;
    border-radius: 4px;

    &:hover {
        background: var(--color-gray-200);
        color: var(--color-red-500, #ef4444);
    }
}

.not-found {
    text-align: center;
    padding: 3rem;

    h2 {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-navy-100);
        margin-bottom: 0.5rem;
    }

    p {
        color: var(--color-navy-60);
        margin-bottom: 1.5rem;
    }
}

.detail-section {
    background: white;
    border-radius: 8px;
    border: 1px solid var(--color-gray-200, #e5e7eb);
    padding: 1.5rem;
    margin-bottom: 1rem;
}

.section-title {
    display: flex;
    align-items: center;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-navy-100);
    margin-bottom: 1rem;
}

.description-text {
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--color-navy-80);
}

.instructions-text {
    font-size: 0.9375rem;
    line-height: 1.8;
    color: var(--color-navy-80);

    p {
        margin-bottom: 0.5rem;

        &:last-child {
            margin-bottom: 0;
        }
    }
}

.attachments-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.attachment-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--color-gray-50, #f9fafb);
    border-radius: 6px;
    font-size: 0.875rem;
    color: var(--color-navy-100);
    cursor: pointer;
    transition: background 0.2s ease;

    &:hover {
        background: var(--color-gray-100, #f3f4f6);
    }
}
</style>
