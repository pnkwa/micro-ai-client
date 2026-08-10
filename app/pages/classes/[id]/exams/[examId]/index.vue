<script setup lang="ts">
import { ArrowLeft, ClipboardCheck, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { examService, type Exam } from '~/services/examService'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import { classService, type ClassItem, type StudentRosterItem } from '~/services/classService'
import ExamDetailTab from '~/features/components/exam/ExamDetailTab.vue'
import StudentExamForm from '~/features/components/exam/StudentExamForm.vue'
import AssignmentExercises from '~/features/components/assignment/AssignmentExercises.vue'
import AssignmentReleaseBar from '~/features/components/assignment/AssignmentReleaseBar.vue'
import AssignmentSubmissionsTab from '~/features/components/assignment/AssignmentSubmissionsTab.vue'
import DeleteAssignmentDialog from '~/features/components/assignment/DeleteAssignmentDialog.vue'
import { studentAssignmentBadges } from '~/core/helpers/studentAssignmentStatus'

const route = useRoute()
const router = useRouter()
const authStore = useAuth()

const classId = computed(() => Number(route.params.id))
const examId = computed(() => Number(route.params.examId))

const exam = ref<Exam | null>(null)
const classItem = ref<ClassItem | null>(null)
const submissions = ref<SubmissionView[]>([])
// The class roster, so the Submissions tab can show who hasn't submitted, not just who has.
const roster = ref<StudentRosterItem[]>([])
const isLoadingExam = ref(false)
const isLoadingSubmissions = ref(false)

const loadExam = async () => {
    const isInitialLoad = exam.value === null
    if (isInitialLoad) isLoadingExam.value = true
    try {
        exam.value = await examService.getById(examId.value)
    } catch {
        toast.error('Failed to load exam')
    } finally {
        if (isInitialLoad) isLoadingExam.value = false
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
        // The roster comes too so the tab can list non-submitters, not just submissions.
        const [subs, students] = await Promise.all([
            submissionService.listByAssignment(examId.value),
            classService.getStudents(classId.value),
        ])
        submissions.value = subs
        roster.value = students.data
    } catch {
        toast.error('Failed to load submissions')
    } finally {
        isLoadingSubmissions.value = false
    }
}

const isStudent = computed(() => authStore.user?.user_type === 'student' || !authStore.user)

const mySubmission = ref<SubmissionView | null>(null)
const loadMySubmission = async () => {
    try {
        const all = await submissionService.listByAssignment(examId.value)
        mySubmission.value = all.find((s) => s.assignment_id === examId.value) ?? null
    } catch {
        mySubmission.value = null
    }
}

await Promise.all([
    loadExam(),
    loadClass(),
    isStudent.value ? loadMySubmission() : loadSubmissions(),
])

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([
    { label: 'Classes', to: '/classes' },
    { label: classItem.value?.name ?? 'Class', to: `/classes/${classId.value}` },
    { label: exam.value?.name ?? 'Exam' },
])

type Tab = 'detail' | 'submissions'
const activeTab = ref<Tab>(route.query.tab === 'submissions' ? 'submissions' : 'detail')
const tabs = computed(() => [
    { value: 'detail', label: 'Detail' },
    { value: 'submissions', label: `Submissions (${submissions.value.length})` },
])
const onTabChange = async (tab: Tab) => {
    activeTab.value = tab
    router.replace({ query: tab === 'detail' ? {} : { tab } })
    if (tab === 'submissions' && submissions.value.length === 0) {
        await loadSubmissions()
    }
}

const isReleased = computed(() => {
    const exercises = exam.value?.exercises ?? []
    return exercises.length > 0 && exercises.every((ex) => ex.released)
})

const studentBadges = computed(() =>
    exam.value ? studentAssignmentBadges(exam.value, mySubmission.value) : [],
)

const isDeleteOpen = ref(false)
const onDeleted = async () => {
    isDeleteOpen.value = false
    toast.success('Exam deleted')
    await router.push(`/classes/${classId.value}?tab=exams`)
}
</script>

<template>
    <div>
        <div v-if="isLoadingExam" class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60">
            Loading…
        </div>

        <template v-else-if="exam">
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-6">
                <div class="tw:flex tw:items-center tw:gap-3">
                    <button
                        class="tw:flex tw:items-center tw:gap-1.5 tw:text-navy-60 tw:hover:text-primary tw:transition-colors"
                        @click="router.push(`/classes/${classId}?tab=exams`)"
                    >
                        <ArrowLeft class="tw:w-4 tw:h-4" />
                    </button>
                    <div class="tw:flex tw:items-center tw:gap-3">
                        <div
                            class="tw:w-10 tw:h-10 tw:flex tw:items-center tw:justify-center tw:bg-primary/10 tw:rounded-lg"
                        >
                            <ClipboardCheck class="tw:w-5 tw:h-5 tw:text-primary" />
                        </div>
                        <div>
                            <h1 class="tw:text-xl tw:font-bold tw:text-primary tw:leading-tight">
                                {{ exam.name }}
                            </h1>
                            <p class="tw:text-xs tw:text-navy-60">Exam</p>
                        </div>
                    </div>
                </div>
                <template v-if="isStudent">
                    <McBadge v-for="b in studentBadges" :key="b.label" :variant="b.variant">
                        {{ b.label }}
                    </McBadge>
                </template>
                <div v-else class="tw:flex tw:items-center tw:gap-2">
                    <McBadge :variant="isReleased ? 'info' : 'outline'">
                        {{ isReleased ? 'Released' : 'Draft' }}
                    </McBadge>
                    <McButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete exam"
                        title="Delete exam"
                        class="tw:ml-1 tw:text-navy-50 tw:hover:bg-destructive/10 tw:hover:text-destructive"
                        @click="isDeleteOpen = true"
                    >
                        <Trash2 class="tw:size-4" />
                    </McButton>
                </div>
            </div>

            <!-- Student: metadata then the exam-taking form. -->
            <template v-if="isStudent">
                <ExamDetailTab :exam="exam" is-student @reload="loadExam" />
                <StudentExamForm
                    :exam="exam"
                    :my-submission="mySubmission"
                    class="tw:mt-6"
                    @submitted="loadMySubmission"
                />
            </template>

            <template v-else>
                <McTabs
                    :model-value="activeTab"
                    :tabs="tabs"
                    @update:model-value="onTabChange($event as Tab)"
                />

                <template v-if="activeTab === 'detail'">
                    <ExamDetailTab :exam="exam" @reload="loadExam" />
                    <div class="tw:mt-6 tw:flex tw:flex-col tw:gap-4">
                        <AssignmentReleaseBar
                            :assignment="exam"
                            :released="isReleased"
                            :submission-count="submissions.length"
                            @reload="loadExam"
                        />
                        <AssignmentExercises
                            :assignment="exam"
                            :released="isReleased"
                            fixed-question-type="slide_identification"
                            @reload="loadExam"
                        />
                    </div>
                </template>

                <AssignmentSubmissionsTab
                    v-else
                    :assignment="exam"
                    :students="roster"
                    :submissions="submissions"
                    :is-loading="isLoadingSubmissions"
                />

                <DeleteAssignmentDialog
                    v-model:open="isDeleteOpen"
                    :assignment="exam"
                    :submission-count="submissions.length"
                    :remove-fn="examService.remove"
                    @deleted="onDeleted"
                />
            </template>
        </template>

        <div v-else class="tw:text-center tw:py-16 tw:text-navy-60">Exam not found.</div>
    </div>
</template>
