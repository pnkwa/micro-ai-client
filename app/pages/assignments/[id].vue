<script setup lang="ts">
import { ArrowLeft, FileText, Calendar, ClipboardList, Send, Paperclip, Trophy } from '@lucide/vue'
import {
    assignmentService,
    assignmentTotalPoints,
    type Assignment,
} from '~/services/assignmentService'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import { studentStatus, studentGradeText } from '~/core/helpers/studentAssignmentStatus'

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()

const authStore = useAuth()

const isStudent = computed(() => authStore.user?.user_type === 'student' || !authStore.user)

const assignmentId = computed(() => Number(route.params.id))

const assignment = ref<Assignment | null>(null)
const mySubmission = ref<SubmissionView | null>(null)

const loadAssignment = async () => {
    try {
        assignment.value = await assignmentService.getById(assignmentId.value)
    } catch {
        // Left null so the template falls through to "Assignment not found" - which covers
        // a deleted id and a class the caller isn't on alike, since the server answers both
        // the same way.
        assignment.value = null
    }
}

// Students only: staff have no submission of their own here, and the list endpoint would
// just hand back every submission they're allowed to see.
const loadMySubmission = async () => {
    try {
        const all = await submissionService.listByAssignment(assignmentId.value)
        // The student list endpoint returns all of their submissions and ignores the
        // assignment_id filter, so match on assignment_id rather than taking the first row.
        mySubmission.value = all.find((s) => s.assignment_id === assignmentId.value) ?? null
    } catch {
        // Couldn't determine. Leave it null: the page then reads from the due date alone
        // rather than telling a student something wrong about their own work.
        mySubmission.value = null
    }
}

await Promise.all([loadAssignment(), ...(isStudent.value ? [loadMySubmission()] : [])])

// This route carries no class in its path, so everything class-scoped - the way back, and
// the exercise tree a student actually answers - is reachable only once the assignment has
// told us which class it belongs to.
const classId = computed(() => assignment.value?.class_id ?? null)

const breadcrumb = useBreadcrumb()
// Plain array: the awaits above already resolved, so there is nothing left to react to.
breadcrumb.setBreadcrumbs([
    { label: 'Classes', to: '/classes' },
    { label: assignment.value?.name ?? 'Assignment' },
])

// Σ question points - assignments.points is a manually-typed field that goes stale as soon
// as questions are edited, and the backend's own scoring never reads it.
const totalPoints = computed(() => (assignment.value ? assignmentTotalPoints(assignment.value) : 0))

const status = computed(() =>
    assignment.value ? studentStatus(assignment.value, mySubmission.value) : null,
)
const gradeText = computed(() => studentGradeText(mySubmission.value, totalPoints.value))

// A rejected submission has been handed back to be redone, so it does not count as in.
const alreadySubmitted = computed(
    () => mySubmission.value != null && mySubmission.value.status !== 'rejected',
)

const goBack = () => {
    router.push(classId.value ? `/classes/${classId.value}` : '/classes')
}

// The answer form lives on the class-scoped route: submitting means one image part per
// image_detection question across the whole exercise tree, which is StudentExerciseForm's
// job. This page is the summary, so it hands off rather than reimplementing that.
const openAnswerForm = () => {
    if (!classId.value) return
    router.push(`/classes/${classId.value}/assignments/${assignmentId.value}`)
}

const formatDate = (date: string) => $dayjs(date).format('MMMM D, YYYY HH:mm')
</script>

<template>
    <div>
        <button
            class="tw:flex tw:items-center tw:gap-2 tw:mb-6 tw:text-navy-60 tw:cursor-pointer tw:hover:text-primary"
            @click="goBack"
        >
            <ArrowLeft class="tw:w-5 tw:h-5" />
            <span>Back to Class</span>
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
                        <div v-if="isStudent" class="tw:flex tw:items-center tw:gap-2 tw:mt-1">
                            <McBadge v-if="status" :variant="status.variant">
                                {{ status.label }}
                            </McBadge>
                            <span v-if="gradeText" class="tw:text-sm tw:text-navy-60">
                                {{ gradeText }}
                            </span>
                        </div>
                    </div>
                </div>
                <McButton v-if="isStudent" @click="openAnswerForm">
                    <Send class="tw:w-4 tw:h-4 tw:mr-1" />
                    {{ alreadySubmitted ? 'View Submission' : 'Answer Assignment' }}
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
                            {{ formatDate(assignment.due_date) }}
                        </p>
                    </div>
                </div>
                <div
                    v-if="totalPoints > 0"
                    class="tw:flex tw:items-center tw:gap-4 tw:p-4 tw:bg-white tw:rounded-md tw:border tw:border-gray-200"
                >
                    <Trophy class="tw:w-5 tw:h-5 tw:text-navy-60" />
                    <div>
                        <p class="tw:text-sm tw:text-navy-60">Points</p>
                        <p class="tw:text-base tw:font-medium">{{ totalPoints }} pts</p>
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
                v-if="assignment.attachments.length > 0"
                class="tw:bg-white tw:rounded-md tw:border tw:border-gray-200 tw:p-6 tw:mb-6"
            >
                <h2 class="section-title">
                    <Paperclip class="tw:w-5 tw:h-5 tw:mr-2" />
                    Attachments
                </h2>
                <div class="tw:flex tw:flex-col tw:gap-2">
                    <a
                        v-for="att in assignment.attachments"
                        :key="att.id"
                        :href="att.path"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="tw:flex tw:items-center tw:gap-2 tw:p-2 tw:bg-gray-50 tw:rounded-md tw:cursor-pointer tw:hover:bg-gray-100"
                    >
                        <FileText class="tw:w-4 tw:h-4 tw:text-primary" />
                        <span>{{ att.filename }}</span>
                    </a>
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
