<script setup lang="ts">
import { ArrowLeft, FileText, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import {
    assignmentService,
    assignmentTotalPoints,
    type Assignment,
} from '~/services/assignmentService'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import { classService, type ClassItem, type StudentRosterItem } from '~/services/classService'
import AssignmentDetailTab from '~/features/components/assignment/AssignmentDetailTab.vue'
import AssignmentExercises from '~/features/components/assignment/AssignmentExercises.vue'
import AssignmentReleaseBar from '~/features/components/assignment/AssignmentReleaseBar.vue'
import AssignmentSubmissionsTab from '~/features/components/assignment/AssignmentSubmissionsTab.vue'
import StudentExerciseForm from '~/features/components/assignment/StudentExerciseForm.vue'
import { studentStatus, studentGradeText } from '~/core/helpers/studentAssignmentStatus'
import DeleteAssignmentDialog from '~/features/components/assignment/DeleteAssignmentDialog.vue'

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()
const authStore = useAuth()

const classId = computed(() => Number(route.params.id))
const assignmentId = computed(() => Number(route.params.assignmentId))

const assignment = ref<Assignment | null>(null)
const classItem = ref<ClassItem | null>(null)
const submissions = ref<SubmissionView[]>([])
// The class roster, so the Submissions tab can show every student — including who hasn't submitted.
const roster = ref<StudentRosterItem[]>([])
const isLoadingAssignment = ref(false)
const isLoadingSubmissions = ref(false)

const loadAssignment = async () => {
    // Only the very first load has nothing to show yet; every reload after that
    // (release toggle, add/edit exercise or question, …) already has content on
    // screen, so it should update in place rather than blank the whole page out
    // to "Loading…" and back for what's often a single-field change.
    const isInitialLoad = assignment.value === null
    if (isInitialLoad) isLoadingAssignment.value = true
    try {
        assignment.value = await assignmentService.getById(assignmentId.value)
    } catch {
        toast.error('Failed to load assignment')
    } finally {
        if (isInitialLoad) isLoadingAssignment.value = false
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
            submissionService.listByAssignment(assignmentId.value),
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

// The signed-in student's own submission for this assignment, if any. Owned here rather
// than inside StudentExerciseForm because the header pill needs it too, and a single fetch
// keeps the pill and the form from ever disagreeing about whether the work is in.
const mySubmission = ref<SubmissionView | null>(null)

const loadMySubmission = async () => {
    try {
        const all = await submissionService.listByAssignment(assignmentId.value)
        // The student list endpoint returns all of their submissions and ignores the
        // assignment_id filter, so match on assignment_id rather than taking the first row.
        mySubmission.value = all.find((s) => s.assignment_id === assignmentId.value) ?? null
    } catch {
        // Couldn't determine. Leave it null: the form then lets them answer rather than
        // blocking them, and the pill falls back to the due-date-only reading.
        mySubmission.value = null
    }
}

// Load the submissions count up front too (not just on tab activation) so the
// "Submissions (N)" tab label is accurate before the tab is ever clicked;
// students never see that tab, so they fetch their own submission instead.
await Promise.all([
    loadAssignment(),
    loadClass(),
    isStudent.value ? loadMySubmission() : loadSubmissions(),
])

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([
    { label: 'Classes', to: '/classes' },
    { label: classItem.value?.name ?? 'Class', to: `/classes/${classId.value}` },
    { label: assignment.value?.name ?? 'Assignment' },
])

// Students see no tabs at all: the detail and the answer form are the whole page for them.
type Tab = 'detail' | 'submissions'

// The tab lives in the URL so it can be linked to and survives a reload. Grading a
// submission navigates away and back, and landing on Detail every time made the grader
// re-find the Submissions tab after every student.
const activeTab = ref<Tab>(route.query.tab === 'submissions' ? 'submissions' : 'detail')

const tabs = computed(() => [
    { value: 'detail', label: 'Detail' },
    { value: 'submissions', label: `Submissions (${submissions.value.length})` },
])

const onTabChange = async (tab: Tab) => {
    activeTab.value = tab
    // replace, not push: switching tabs shouldn't stack history entries a Back press then
    // has to walk through. Detail is the default, so it carries no query at all.
    router.replace({ query: tab === 'detail' ? {} : { tab } })
    if (tab === 'submissions' && submissions.value.length === 0) {
        await loadSubmissions()
    }
}

// Release is per exercise on the server but only ever authored for the assignment as a whole.
// Legacy data with a mix of released and draft exercises therefore reads as NOT released, so
// the instructor's next action is the bulk release that sweeps the stragglers into line.
const isReleased = computed(() => {
    const exercises = assignment.value?.exercises ?? []
    return exercises.length > 0 && exercises.every((ex) => ex.released)
})

// The student's header standing — status badge + grade line — from the SAME shared helper the
// class list uses, so the two never drift. The grade total is the summed question points (the
// full assignment is loaded here), or the submission's max_score if present.
const studentBadge = computed(() =>
    assignment.value ? studentStatus(assignment.value, mySubmission.value) : null,
)
const studentScore = computed<string | null>(() =>
    studentGradeText(
        mySubmission.value,
        mySubmission.value?.max_score ??
            (assignment.value ? assignmentTotalPoints(assignment.value) : null),
    ),
)

const isDeleteOpen = ref(false)

const onDeleted = async () => {
    isDeleteOpen.value = false
    toast.success('Assignment deleted')
    // The page's own record is gone, so leave before anything re-reads it.
    await router.push(`/classes/${classId.value}`)
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
                <!-- Students get their own standing (New/Overdue/Submitted/Graded); the
                     authoring-side badges are instructor-only. An unreleased assignment is
                     invisible to students, so Draft/Released could only ever read "Released"
                     for them anyway. -->
                <!-- Student header standing: the action badge with the grade as smaller text
                     below — identical to the class list (shared helper). -->
                <template v-if="isStudent">
                    <div class="tw:flex tw:flex-col tw:items-end tw:gap-1">
                        <McBadge v-if="studentBadge" :variant="studentBadge.variant">
                            {{ studentBadge.label }}
                        </McBadge>
                        <span
                            v-if="studentScore"
                            class="tw:text-[11px] tw:font-medium tw:text-navy-60 tw:tabular-nums"
                        >
                            {{ studentScore }}
                        </span>
                    </div>
                </template>
                <div v-else class="tw:flex tw:items-center tw:gap-2">
                    <McBadge :variant="isReleased ? 'info' : 'outline'">
                        {{ isReleased ? 'Released' : 'Draft' }}
                    </McBadge>
                    <McBadge :variant="assignment.status === 'active' ? 'default' : 'outline'">
                        {{ assignment.status === 'active' ? 'Active' : 'Closed' }}
                    </McBadge>
                    <!-- Icon-only and last: destructive, rarely wanted, and shouldn't sit in
                         the reading path of the badges next to it. -->
                    <McButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete assignment"
                        title="Delete assignment"
                        class="tw:ml-1 tw:text-navy-50 tw:hover:bg-destructive/10 tw:hover:text-destructive"
                        @click="isDeleteOpen = true"
                    >
                        <Trash2 class="tw:size-4" />
                    </McButton>
                </div>
            </div>

            <!-- Student: one page, no tabs. The detail and the answer form are all there is. -->
            <template v-if="isStudent">
                <AssignmentDetailTab
                    :assignment="assignment"
                    :is-student="isStudent"
                    @reload="loadAssignment"
                />
                <StudentExerciseForm
                    :assignment="assignment"
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
                    <AssignmentDetailTab
                        :assignment="assignment"
                        :is-student="isStudent"
                        @reload="loadAssignment"
                    />
                    <div class="tw:mt-6 tw:flex tw:flex-col tw:gap-4">
                        <AssignmentReleaseBar
                            :assignment="assignment"
                            :released="isReleased"
                            :submission-count="submissions.length"
                            @reload="loadAssignment"
                        />
                        <AssignmentExercises
                            :assignment="assignment"
                            :released="isReleased"
                            @reload="loadAssignment"
                        />
                    </div>
                </template>

                <AssignmentSubmissionsTab
                    v-else
                    :assignment="assignment"
                    :students="roster"
                    :submissions="submissions"
                    :is-loading="isLoadingSubmissions"
                />

                <DeleteAssignmentDialog
                    v-model:open="isDeleteOpen"
                    :assignment="assignment"
                    :submission-count="submissions.length"
                    @deleted="onDeleted"
                />
            </template>
        </template>

        <div v-else class="tw:text-center tw:py-16 tw:text-navy-60">Assignment not found.</div>
    </div>
</template>
