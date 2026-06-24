<script setup lang="ts">
import { FileText, CheckCircle, Clock, AlertCircle } from 'lucide-vue-next'
import { getStatusVariant } from '~/core/helpers/variants'
import assignmentsData from '~/data/assignments.json'
import submissionsData from '~/data/submissions.json'

interface AssignmentItem {
    id: number
    name: string
    dueDate: string
    classId: number
    submissions: number
    description?: string
    instructions?: string
    points?: number
    attachments?: string[]
}

interface SubmissionItem {
    id: number
    studentId: number
    studentName: string
    assignment: string
    classId: number
    submittedAt: string
    quality: number
    status: 'submitted' | 'graded'
    score?: number
}

const router = useRouter()
const { $dayjs } = useNuxtApp()
const authStore = useAuth()

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: 'Assignments', to: '/assignments' }])

const assignments = ref<AssignmentItem[]>(assignmentsData.assignments as AssignmentItem[])
const submissions = ref<SubmissionItem[]>(submissionsData.submissions as SubmissionItem[])

const mySubmissions = computed(() => {
    const studentId = authStore.user?.id
    return submissions.value.filter((s) => s.studentId === studentId)
})

const getMySubmission = (assignmentName: string) => {
    return mySubmissions.value.find((s) => s.assignment === assignmentName)
}

const goToDetail = (assignment: AssignmentItem) => {
    router.push(`/assignments/${assignment.id}`)
}

const isLate = (assignment: AssignmentItem) => {
    return !getMySubmission(assignment.name) && $dayjs().isAfter($dayjs(assignment.dueDate))
}

const formatDate = (date: string) => $dayjs(date).format('MMM D, YYYY')
</script>

<template>
    <div>
        <div class="tw:flex tw:justify-between tw:items-center tw:mb-6">
            <div>
                <h1 class="tw:text-2xl tw:font-semibold tw:text-primary">Assignments</h1>
                <p class="tw:text-sm tw:text-navy-60">Submit your assignment</p>
            </div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-3">
            <div
                v-for="assignment in assignments"
                :key="assignment.id"
                class="tw:flex tw:justify-between tw:items-center tw:p-4 tw:bg-white tw:rounded-lg tw:border tw:border-gray-200 tw:cursor-pointer tw:transition-all tw:duration-200 tw:hover:shadow-md"
                @click="goToDetail(assignment)"
            >
                <div class="tw:flex tw:items-center tw:gap-3">
                    <FileText class="tw:w-5 tw:h-5 tw:text-gray-400" />
                    <div class="tw:flex tw:flex-col tw:gap-0.5">
                        <h3 class="tw:text-sm tw:font-medium tw:text-navy-100">
                            {{ assignment.name }}
                        </h3>
                        <p class="tw:text-xs tw:text-navy-60">
                            Due {{ formatDate(assignment.dueDate) }}
                        </p>
                    </div>
                </div>

                <div class="tw:flex tw:items-center tw:gap-3">
                    <span v-if="assignment.points" class="tw:text-xs tw:text-navy-50">
                        <template v-if="getMySubmission(assignment.name)?.status === 'graded'">
                            <span class="tw:text-sm tw:font-semibold tw:text-primary">
                                {{ getMySubmission(assignment.name)?.score }} /
                            </span>
                        </template>
                        {{ assignment.points }} pts
                    </span>
                    <template v-if="getMySubmission(assignment.name)">
                        <McBadge
                            :variant="getStatusVariant(getMySubmission(assignment.name)!.status)"
                            class="tw:gap-1 tw:capitalize"
                        >
                            <CheckCircle
                                v-if="getMySubmission(assignment.name)?.status === 'graded'"
                                class="tw:w-3 tw:h-3"
                            />
                            <Clock v-else class="tw:w-3 tw:h-3" />
                            {{ getMySubmission(assignment.name)!.status }}
                        </McBadge>
                    </template>
                    <template v-else-if="isLate(assignment)">
                        <McBadge variant="warning" class="tw:gap-1">
                            <AlertCircle class="tw:w-3 tw:h-3" />
                            Late
                        </McBadge>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>
