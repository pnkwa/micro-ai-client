<script setup lang="ts">
import { ArrowLeft, FileText } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { assignmentService, type Assignment } from '~/services/assignmentService'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import { classService, type ClassItem } from '~/services/classService'
import AssignmentDetailTab from '~/features/components/assignment/AssignmentDetailTab.vue'
import AssignmentExercisesTab from '~/features/components/assignment/AssignmentExercisesTab.vue'
import AssignmentSubmissionsTab from '~/features/components/assignment/AssignmentSubmissionsTab.vue'

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()
const authStore = useAuth()

const classId = computed(() => Number(route.params.id))
const assignmentId = computed(() => Number(route.params.assignmentId))

const assignment = ref<Assignment | null>(null)
const classItem = ref<ClassItem | null>(null)
const submissions = ref<SubmissionView[]>([])
const isLoadingAssignment = ref(false)
const isLoadingSubmissions = ref(false)

const loadAssignment = async () => {
    isLoadingAssignment.value = true
    try {
        assignment.value = await assignmentService.getById(assignmentId.value)
    } catch {
        toast.error('Failed to load assignment')
    } finally {
        isLoadingAssignment.value = false
    }
}

const loadClass = async () => {
    try {
        classItem.value = await classService.getById(classId.value)
    } catch {
        toast.error('Failed to load class details')
    }
}

const loadSubmissions = async () => {
    isLoadingSubmissions.value = true
    try {
        submissions.value = await submissionService.listByAssignment(assignmentId.value)
    } catch {
        toast.error('Failed to load submissions')
    } finally {
        isLoadingSubmissions.value = false
    }
}

await Promise.all([loadAssignment(), loadClass()])

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([
    { label: 'Classes', to: '/classes' },
    { label: classItem.value?.name ?? 'Class', to: `/classes/${classId.value}` },
    { label: assignment.value?.name ?? 'Assignment' },
])

const isStudent = computed(() => authStore.user?.user_type === 'student' || !authStore.user)

const activeTab = ref<'detail' | 'exercises' | 'submissions'>('detail')

const tabs = computed(() => {
    const base = [
        { value: 'detail', label: 'Detail' },
        { value: 'exercises', label: `Exercises (${assignment.value?.exercises.length ?? 0})` },
    ]
    if (!isStudent.value) {
        base.push({ value: 'submissions', label: `Submissions (${submissions.value.length})` })
    }
    return base
})

const onTabChange = async (tab: 'detail' | 'exercises' | 'submissions') => {
    activeTab.value = tab
    if (tab === 'submissions' && submissions.value.length === 0) {
        await loadSubmissions()
    }
}

const formatDate = (date: string) => $dayjs(date).format('MMM D, YYYY')
</script>

<template>
    <div>
        <div v-if="isLoadingAssignment" class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60">
            Loading…
        </div>

        <template v-else-if="assignment">
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-6">
                <div class="tw:flex tw:items-center tw:gap-3">
                    <button
                        class="tw:flex tw:items-center tw:gap-1.5 tw:text-navy-60 tw:hover:text-primary tw:transition-colors"
                        @click="router.push(`/classes/${classId}`)"
                    >
                        <ArrowLeft class="tw:w-4 tw:h-4" />
                    </button>
                    <div class="tw:flex tw:items-center tw:gap-3">
                        <div
                            class="tw:w-10 tw:h-10 tw:flex tw:items-center tw:justify-center tw:bg-primary/10 tw:rounded-lg"
                        >
                            <FileText class="tw:w-5 tw:h-5 tw:text-primary" />
                        </div>
                        <div>
                            <h1 class="tw:text-xl tw:font-bold tw:text-primary tw:leading-tight">
                                {{ assignment.name }}
                            </h1>
                            <p class="tw:text-xs tw:text-navy-60">
                                Due {{ formatDate(assignment.due_date) }}
                            </p>
                        </div>
                    </div>
                </div>
                <McBadge :variant="assignment.status === 'active' ? 'default' : 'outline'">
                    {{ assignment.status === 'active' ? 'Active' : 'Closed' }}
                </McBadge>
            </div>

            <McTabs
                :model-value="activeTab"
                :tabs="tabs"
                @update:model-value="onTabChange($event as 'detail' | 'exercises' | 'submissions')"
            />

            <AssignmentDetailTab
                v-if="activeTab === 'detail'"
                :assignment="assignment"
                :is-student="isStudent"
                @reload="loadAssignment"
            />

            <AssignmentExercisesTab
                v-else-if="activeTab === 'exercises'"
                :assignment="assignment"
                :is-student="isStudent"
                @reload="loadAssignment"
            />

            <AssignmentSubmissionsTab
                v-else-if="activeTab === 'submissions'"
                :assignment="assignment"
                :submissions="submissions"
                :is-loading="isLoadingSubmissions"
            />
        </template>

        <div v-else class="tw:text-center tw:py-16 tw:text-navy-60">Assignment not found.</div>
    </div>
</template>
