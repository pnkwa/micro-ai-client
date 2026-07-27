<script setup lang="ts">
import { h } from 'vue'
import {
    FileText,
    Users,
    Plus,
    ChevronLeft,
    UserPlus,
    Upload,
    ClipboardCheck,
} from 'lucide-vue-next'
import type { ColumnDef, PaginationState } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'
import CreateAssignment from '~/features/components/forms/CreateAssignment.vue'
import CreateExam from '~/features/components/forms/CreateExam.vue'
import EditClass from '~/features/components/forms/EditClass.vue'
import AddStudent from '~/features/components/forms/AddStudent.vue'
import ImportStudentsCsv from '~/features/components/forms/ImportStudentsCsv.vue'
import type { CreateAssignmentFormData } from '~/features/types/forms/assignment'
import type { EditClassFormData } from '~/features/types/forms/class'
import type { EnrollStudentFormData } from '~/features/types/forms/student'
import {
    classService,
    type ClassItem,
    type StudentRosterItem,
    type StudentGrade,
    type EnrollStudentInput,
} from '~/services/classService'
import { assignmentService, type AssignmentListItem } from '~/services/assignmentService'
import { examService, type ExamListItem, type CreateExamInput } from '~/services/examService'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import {
    studentStatus,
    studentGradeText,
    indexSubmissionsByAssignment,
} from '~/core/helpers/studentAssignmentStatus'

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()
const authStore = useAuth()

const isStudent = computed(() => authStore.user?.user_type === 'student' || !authStore.user)

const classId = computed(() => Number(route.params.id))

const classItem = ref<ClassItem | null>(null)
const students = ref<StudentRosterItem[]>([])
const assignments = ref<AssignmentListItem[]>([])
const exams = ref<ExamListItem[]>([])
const isLoadingClass = ref(false)
const isLoadingStudents = ref(false)
const isLoadingAssignments = ref(false)
const isLoadingExams = ref(false)

const loadClass = async () => {
    isLoadingClass.value = true
    try {
        classItem.value = await classService.getById(classId.value)
    } catch {
        toast.error('Failed to load class')
    } finally {
        isLoadingClass.value = false
    }
}

// Each student's running grade in the class, keyed by student_id. Loaded with the roster (both
// staff-only, both feed the Students tab). A student with no graded work isn't in the map → "—".
const grades = ref<Map<string, StudentGrade>>(new Map())

// The roster is read one page at a time, so this holds only the page on screen; `studentTotal`
// is what the server matched, which is what sizes the pager. Grades cover the whole class and
// are keyed by student, so one read still serves every page.
const studentTotal = ref(0)

const loadStudents = async () => {
    isLoadingStudents.value = true
    try {
        const [roster, grade] = await Promise.all([
            classService.getStudents(classId.value, {
                page: studentPage.value,
                perPage: studentPerPage.value,
                q: studentSearch.value.trim(),
            }),
            classService.getGrades(classId.value),
        ])
        students.value = roster.data
        studentTotal.value = roster.total
        grades.value = new Map(grade.map((g) => [g.student_id, g]))
    } catch {
        toast.error('Failed to load students')
    } finally {
        isLoadingStudents.value = false
    }
}

// "18/25" over graded work, or "—" when the student has nothing graded yet.
const gradeText = (studentId: string): string => {
    const g = grades.value.get(studentId)
    return g ? `${g.earned}/${g.possible}` : '-'
}

const loadAssignments = async () => {
    isLoadingAssignments.value = true
    try {
        // GET /assignments returns exams too (is_exam rows); they belong in the Exams tab, so
        // keep only real assignments here.
        const all = await assignmentService.listByClass(classId.value)
        assignments.value = all.filter((a) => !a.is_exam)
    } catch {
        toast.error('Failed to load assignments')
    } finally {
        isLoadingAssignments.value = false
    }
}

const loadExams = async () => {
    isLoadingExams.value = true
    try {
        exams.value = await examService.listByClass(classId.value)
    } catch {
        toast.error('Failed to load exams')
    } finally {
        isLoadingExams.value = false
    }
}

// This student's own submissions, keyed by assignment, so every row in the list can show
// where they stand. One request covers the whole page: GET /submissions ignores its filters
// for a student and returns all of their rows. Instructors don't need it — their pill is the
// assignment's own Active/Closed.
const mySubmissions = ref<Map<number, SubmissionView>>(new Map())

const loadMySubmissions = async () => {
    try {
        mySubmissions.value = indexSubmissionsByAssignment(await submissionService.list())
    } catch {
        // Leave it empty rather than blocking the page: every row then falls back to the
        // due-date-only reading (New/Overdue), which is the right answer for the common
        // case of a student who hasn't submitted anything here.
        mySubmissions.value = new Map()
    }
}

await Promise.all([
    loadClass(),
    loadAssignments(),
    loadExams(),
    ...(isStudent.value ? [loadMySubmissions()] : []),
])

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([
    isStudent.value ? { label: 'Home', to: '/' } : { label: 'Classes', to: '/classes' },
    { label: classItem.value?.name ?? 'Class' },
])

// Status badge + grade text come from the shared helper so this list and the assignment header
// stay identical. The grade total prefers the list read's max_score over the assignment's `points`.
const rowStatus = (item: AssignmentListItem | ExamListItem) =>
    studentStatus(item, mySubmissions.value.get(item.id))

const rowScore = (item: AssignmentListItem | ExamListItem): string | null => {
    const sub = mySubmissions.value.get(item.id)
    return studentGradeText(sub, sub ? (sub.max_score ?? item.points) : null)
}

// The window as a short human phrase, shown on staff exam rows.
const examWindow = (exam: ExamListItem): string => {
    const now = $dayjs()
    const opens = exam.exam_opens_at ? $dayjs(exam.exam_opens_at) : null
    const closes = exam.exam_closes_at ? $dayjs(exam.exam_closes_at) : null
    if (opens && now.isBefore(opens)) return `Opens ${opens.format('MMM D, HH:mm')}`
    if (closes && now.isAfter(closes)) return `Closed ${closes.format('MMM D')}`
    if (closes) return `Open · closes ${closes.format('MMM D, HH:mm')}`
    return opens ? 'Open now' : 'No window'
}

type ClassTab = 'assignments' | 'exams' | 'students'
const classTabs = computed(() =>
    isStudent.value
        ? [
              { value: 'assignments', label: 'Assignments' },
              { value: 'exams', label: 'Exams' },
          ]
        : [
              { value: 'assignments', label: 'Assignments' },
              { value: 'exams', label: 'Exams' },
              { value: 'students', label: 'Students' },
          ],
)

const activeTab = ref<ClassTab>('assignments')

const onTabChange = async (tab: ClassTab) => {
    activeTab.value = tab
    if (tab === 'students' && students.value.length === 0) {
        await loadStudents()
    }
}

const isCreateExamOpen = ref(false)

const handleCreateExam = async (values: CreateExamInput) => {
    try {
        const created = await examService.create(values)
        isCreateExamOpen.value = false
        toast.success('Exam created')
        router.push(`/classes/${classId.value}/exams/${created.id}`)
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to create exam'))
    }
}

const isCreateDialogOpen = ref(false)
const isEditDialogOpen = ref(false)
const isAddStudentOpen = ref(false)
const isImportCsvOpen = ref(false)

const editFormValues = computed<EditClassFormData>(() => ({
    id: classItem.value?.id ?? 0,
    name: classItem.value?.name ?? '',
    semester: classItem.value?.semester ?? '',
    code: classItem.value?.code ?? '',
    status: classItem.value?.status ?? 'active',
}))

const handleCreate = async (values: CreateAssignmentFormData) => {
    try {
        const created = await assignmentService.create(values)
        assignments.value.push(created)
        isCreateDialogOpen.value = false
        toast.success('Assignment created')
    } catch {
        toast.error('Failed to create assignment')
    }
}

const handleEdit = async (values: EditClassFormData) => {
    try {
        const updated = await classService.update(values.id, {
            name: values.name,
            semester: values.semester,
            code: values.code,
            status: values.status,
        })
        classItem.value = updated
        isEditDialogOpen.value = false
        toast.success('Class updated')
    } catch {
        toast.error('Failed to update class')
    }
}

const handleDelete = async (id: number) => {
    try {
        await classService.remove(id)
        toast.success('Class deleted')
        router.push('/classes')
    } catch (e) {
        toast.error(apiErrorMessage(e, 'Failed to delete class'))
    }
}

const enrollAndRefresh = async (students: EnrollStudentInput[], successMsg: string) => {
    try {
        await classService.enroll(classId.value, students)
        await loadStudents()
        toast.success(successMsg)
        return true
    } catch (e) {
        toast.error(apiErrorMessage(e, 'Failed to enrol students'))
        return false
    }
}

const handleAddStudent = async (values: EnrollStudentFormData) => {
    if (await enrollAndRefresh([values], `Enrolled ${values.firstname} ${values.lastname}`)) {
        isAddStudentOpen.value = false
    }
}

const handleImportCsv = async (students: EnrollStudentInput[]) => {
    const label = `Enrolled ${students.length} student${students.length === 1 ? '' : 's'}`
    if (await enrollAndRefresh(students, label)) {
        isImportCsvOpen.value = false
    }
}

const formatDate = (date: string) => $dayjs(date).format('MMM D, YYYY')

const studentSearch = ref('')

// Page and search live server-side: the table shows one page, so filtering what arrived would
// only ever match the rows that page happened to hold. `page` is 1-based to match the query.
const studentPage = ref(1)
const studentPerPage = ref(15)

// Writable rather than a ref the table owns, so changing the page IS the refetch — no watcher
// mirroring table state back into a request. TanStack counts pages from 0; the API from 1.
const studentPagination = computed<PaginationState>({
    get: () => ({ pageIndex: studentPage.value - 1, pageSize: studentPerPage.value }),
    set: (next) => {
        studentPage.value = next.pageIndex + 1
        studentPerPage.value = next.pageSize
        void loadStudents()
    },
})

// Debounced so a request isn't fired per keystroke, and back to page 1 because the result set
// changes under the pager — page 4 of the old search is meaningless for the new one.
const onStudentSearch = useDebounceFn(() => {
    studentPage.value = 1
    void loadStudents()
}, 300)

// A fixed height, not a cap: the roster region fills the screen whether it holds 200 students,
// three, or the empty-state message, so the card doesn't shrink to a stub above dead space. The
// gap leaves room for the pagination bar below the rows, which has to stay in view.
const studentCard = useTemplateRef<HTMLElement>('studentCard')
const studentTableHeight = useViewportFillHeight(studentCard, { gap: 76 })

// The assignments and exams tabs swap their empty state into the same region, so both measure
// the same way and can't drift apart.
const assignmentsEmpty = useTemplateRef<HTMLElement>('assignmentsEmpty')
const assignmentsEmptyHeight = useViewportFillHeight(assignmentsEmpty)
const examsEmpty = useTemplateRef<HTMLElement>('examsEmpty')
const examsEmptyHeight = useViewportFillHeight(examsEmpty)

// Header stickiness comes from the table's own bodyHeight mode; this is only the alignment and
// colour the roster's headers want.
const stickyHead = 'tw:text-left tw:text-navy-100'
const leftHead = (label: string) => () => h('div', { class: 'tw:text-left' }, label)
// The sizes matter under the table's fixed layout: they are the column widths, and holding them
// steady is what stops the columns shifting as you page through longer and shorter names.
const studentColumns: ColumnDef<StudentRosterItem>[] = [
    {
        accessorKey: 'no',
        header: () => h('div', { class: 'tw:text-left tw:pl-4' }, 'No.'),
        size: 70,
        meta: { headerClass: stickyHead },
    },
    {
        accessorKey: 'student_id',
        header: leftHead('Student ID'),
        size: 150,
        meta: { headerClass: stickyHead },
    },
    {
        accessorKey: 'name',
        header: leftHead('Name'),
        size: 220,
        meta: { headerClass: stickyHead },
    },
    {
        accessorKey: 'email',
        header: leftHead('Email'),
        size: 280,
        meta: { headerClass: stickyHead },
    },
    {
        accessorKey: 'grade',
        header: () => h('div', { class: 'tw:text-right tw:pr-4' }, 'Grade'),
        size: 110,
        meta: { headerClass: stickyHead },
    },
]
</script>

<template>
    <div>
        <div v-if="isLoadingClass" class="tw:text-center tw:py-16 tw:text-navy-60">Loading…</div>

        <template v-else-if="classItem">
            <div class="tw:flex tw:items-start tw:justify-between tw:mb-6">
                <div class="tw:flex tw:items-start tw:gap-3">
                    <button
                        class="tw:flex tw:items-center tw:gap-1.5 tw:p-1 tw:text-navy-60 tw:hover:text-primary tw:hover:bg-primary/20 tw:transition-colors tw:bg-navy-10 tw:rounded-md"
                        @click="router.push(isStudent ? '/' : '/classes')"
                    >
                        <ChevronLeft class="tw:w-6 tw:h-6" />
                    </button>
                    <div class="tw:min-w-0">
                        <h1
                            class="tw:text-2xl tw:font-bold tw:text-primary tw:leading-tight tw:max-w-2xl"
                        >
                            {{ classItem.name }}
                        </h1>
                        <p class="tw:text-sm tw:text-navy-60">
                            {{ classItem.semester }} · {{ classItem.code }}
                        </p>
                    </div>
                </div>
                <div class="tw:flex tw:items-center tw:gap-2">
                    <McBadge :variant="classItem.status === 'active' ? 'default' : 'outline'">
                        {{ classItem.status === 'active' ? 'Active' : 'Closed' }}
                    </McBadge>
                    <McButton
                        v-if="!isStudent"
                        variant="outline"
                        size="sm"
                        @click="isEditDialogOpen = true"
                    >
                        Edit Class
                    </McButton>
                </div>
            </div>

            <McTabs
                :model-value="activeTab"
                :tabs="classTabs"
                @update:model-value="onTabChange($event as ClassTab)"
            />

            <template v-if="activeTab === 'assignments'">
                <div class="tw:flex tw:justify-between tw:mb-4">
                    <span class="tw:text-sm tw:text-navy-60">
                        {{ assignments.length }} assignments
                    </span>
                    <McButton v-if="!isStudent" @click="isCreateDialogOpen = true">
                        <Plus class="tw:w-4 tw:h-4 tw:mr-1" />
                        New Assignment
                    </McButton>
                </div>

                <div
                    v-if="isLoadingAssignments"
                    class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60"
                >
                    Loading assignments…
                </div>

                <div v-else-if="assignments.length > 0" class="tw:flex tw:flex-col tw:gap-3">
                    <div
                        v-for="assignment in assignments"
                        :key="assignment.id"
                        class="tw:flex tw:justify-between tw:items-center tw:gap-4 tw:p-4 tw:bg-white tw:rounded-xl tw:border tw:border-navy-10 tw:cursor-pointer tw:hover:border-primary/30 tw:hover:shadow-md tw:transition-all"
                        @click="router.push(`/classes/${classId}/assignments/${assignment.id}`)"
                    >
                        <div class="tw:flex tw:min-w-0 tw:items-center tw:gap-3">
                            <span
                                class="tw:flex tw:h-10 tw:w-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary/10 tw:text-primary"
                            >
                                <FileText class="tw:h-5 tw:w-5" />
                            </span>
                            <div class="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
                                <h3
                                    class="tw:truncate tw:text-sm tw:font-semibold tw:text-navy-100"
                                >
                                    {{ assignment.name }}
                                </h3>
                                <p class="tw:text-xs tw:text-navy-50">
                                    Due {{ formatDate(assignment.due_date) }}
                                </p>
                            </div>
                        </div>
                        <div class="tw:flex tw:items-center tw:gap-4">
                            <!-- Students get their own standing on the work; instructors get
                                 the assignment's own state, which is what they author. -->
                            <template v-if="isStudent">
                                <!-- Status badge (the action) with the grade as smaller text just
                                     below it — "Graded: 2/5", only once graded. -->
                                <div class="tw:flex tw:flex-col tw:items-end tw:gap-1">
                                    <McBadge :variant="rowStatus(assignment).variant">
                                        {{ rowStatus(assignment).label }}
                                    </McBadge>
                                    <span
                                        v-if="rowScore(assignment)"
                                        data-testid="row-score"
                                        class="tw:text-[11px] tw:font-medium tw:text-navy-60 tw:tabular-nums"
                                    >
                                        {{ rowScore(assignment) }}
                                    </span>
                                </div>
                            </template>
                            <McBadge
                                v-else
                                :variant="assignment.status === 'active' ? 'default' : 'outline'"
                            >
                                {{ assignment.status === 'active' ? 'Active' : 'Closed' }}
                            </McBadge>
                        </div>
                    </div>
                </div>

                <div
                    v-else
                    ref="assignmentsEmpty"
                    class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:bg-white tw:border tw:border-navy-10 tw:rounded-md tw:text-center"
                    :style="{ height: assignmentsEmptyHeight }"
                >
                    <FileText class="tw:w-8 tw:h-8 tw:text-navy-60 tw:mb-2" />
                    <p class="tw:text-sm tw:text-navy-60">No assignments yet</p>
                </div>
            </template>

            <template v-else-if="activeTab === 'exams'">
                <div class="tw:flex tw:justify-between tw:mb-4">
                    <span class="tw:text-sm tw:text-navy-60">{{ exams.length }} exams</span>
                    <McButton v-if="!isStudent" @click="isCreateExamOpen = true">
                        <Plus class="tw:w-4 tw:h-4 tw:mr-1" />
                        New Exam
                    </McButton>
                </div>

                <div
                    v-if="isLoadingExams"
                    class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60"
                >
                    Loading exams…
                </div>

                <div v-else-if="exams.length > 0" class="tw:flex tw:flex-col tw:gap-3">
                    <div
                        v-for="exam in exams"
                        :key="exam.id"
                        class="tw:flex tw:justify-between tw:items-center tw:gap-4 tw:p-4 tw:bg-white tw:rounded-xl tw:border tw:border-navy-10 tw:cursor-pointer tw:hover:border-amber-300 tw:hover:shadow-md tw:transition-all"
                        @click="router.push(`/classes/${classId}/exams/${exam.id}`)"
                    >
                        <div class="tw:flex tw:min-w-0 tw:items-center tw:gap-3">
                            <span
                                class="tw:flex tw:h-10 tw:w-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-amber-100 tw:text-amber-600"
                            >
                                <ClipboardCheck class="tw:h-5 tw:w-5" />
                            </span>
                            <div class="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
                                <h3
                                    class="tw:truncate tw:text-sm tw:font-semibold tw:text-navy-100"
                                >
                                    {{ exam.name }}
                                </h3>
                                <p class="tw:text-xs tw:text-navy-50">{{ examWindow(exam) }}</p>
                            </div>
                        </div>
                        <div class="tw:flex tw:items-center tw:gap-4">
                            <template v-if="isStudent">
                                <div class="tw:flex tw:flex-col tw:items-end tw:gap-1">
                                    <McBadge :variant="rowStatus(exam).variant">
                                        {{ rowStatus(exam).label }}
                                    </McBadge>
                                    <span
                                        v-if="rowScore(exam)"
                                        data-testid="row-score"
                                        class="tw:text-[11px] tw:font-medium tw:text-navy-60 tw:tabular-nums"
                                    >
                                        {{ rowScore(exam) }}
                                    </span>
                                </div>
                            </template>
                            <McBadge
                                v-else
                                :variant="exam.status === 'active' ? 'default' : 'outline'"
                            >
                                {{ exam.status === 'active' ? 'Active' : 'Closed' }}
                            </McBadge>
                        </div>
                    </div>
                </div>

                <div
                    v-else
                    ref="examsEmpty"
                    class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:bg-white tw:border tw:border-navy-10 tw:rounded-md tw:text-center"
                    :style="{ height: examsEmptyHeight }"
                >
                    <ClipboardCheck class="tw:w-8 tw:h-8 tw:text-navy-60 tw:mb-2" />
                    <p class="tw:text-sm tw:text-navy-60">No exams yet</p>
                </div>
            </template>

            <template v-else>
                <div
                    class="tw:flex tw:flex-col tw:gap-3 tw:sm:flex-row tw:sm:items-center tw:sm:justify-between tw:mb-4"
                >
                    <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
                        <Users class="tw:w-4 tw:h-4 tw:text-navy-60" />
                        <span class="tw:text-sm tw:font-semibold tw:text-navy-100">
                            {{ students.length }} Enrolled Students
                        </span>
                    </div>
                    <div
                        class="tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row tw:sm:items-center tw:sm:gap-2"
                    >
                        <McInput
                            v-model="studentSearch"
                            icon-prepend="Search"
                            placeholder="Search by name, email, or student ID"
                            class="tw:w-full tw:sm:w-64"
                            @update:model-value="onStudentSearch"
                        />
                        <div class="tw:flex tw:gap-2 tw:shrink-0">
                            <McButton
                                variant="outline"
                                size="sm"
                                class="tw:flex-1 tw:sm:flex-none"
                                @click="isImportCsvOpen = true"
                            >
                                <Upload class="tw:w-4 tw:h-4 tw:mr-1" />
                                Import CSV
                            </McButton>
                            <McButton
                                size="sm"
                                class="tw:flex-1 tw:sm:flex-none"
                                @click="isAddStudentOpen = true"
                            >
                                <UserPlus class="tw:w-4 tw:h-4 tw:mr-1" />
                                Add Student
                            </McButton>
                        </div>
                    </div>
                </div>

                <div
                    v-if="isLoadingStudents"
                    class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-md tw:py-16 tw:text-center tw:text-sm tw:text-navy-60"
                >
                    Loading students…
                </div>

                <div
                    v-else
                    ref="studentCard"
                    class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-md tw:overflow-hidden"
                >
                    <!-- server-side: `students` IS the page, so the table must not slice it
                         again, and `total` comes from the server's match count. -->
                    <McDataTable
                        v-if="students.length > 0"
                        v-model:pagination="studentPagination"
                        :columns="studentColumns"
                        :data="students"
                        :total="studentTotal"
                        :body-height="studentTableHeight"
                        server-side
                    >
                        <template #body-no="{ row }">
                            <div class="tw:text-left tw:text-sm tw:text-navy-40 tw:pl-4">
                                {{ (studentPage - 1) * studentPerPage + row.index + 1 }}
                            </div>
                        </template>
                        <template #body-student_id="{ row }">
                            <div class="tw:text-left tw:text-sm tw:text-navy-60">
                                {{ row.original.student_id }}
                            </div>
                        </template>
                        <template #body-name="{ row }">
                            <div class="tw:text-left tw:text-sm tw:font-medium tw:text-navy-100">
                                {{ row.original.user.firstname }}
                                {{ row.original.user.lastname }}
                            </div>
                        </template>
                        <template #body-email="{ row }">
                            <div class="tw:text-left tw:text-sm tw:text-navy-60">
                                {{ row.original.user.email }}
                            </div>
                        </template>
                        <template #body-grade="{ row }">
                            <div
                                class="tw:pr-4 tw:text-right tw:text-sm tw:font-semibold tw:tabular-nums"
                                :class="
                                    grades.has(row.original.student_id)
                                        ? 'tw:text-navy-100'
                                        : 'tw:text-navy-40'
                                "
                            >
                                {{ gradeText(row.original.student_id) }}
                            </div>
                        </template>
                    </McDataTable>

                    <!-- Centred in the full-height region rather than pinned near its top, so an
                         empty roster reads as a deliberate state, not a cut-off table. -->
                    <div
                        v-else
                        class="tw:flex tw:items-center tw:justify-center tw:text-center tw:text-sm tw:text-navy-50"
                        :style="{ height: studentTableHeight }"
                    >
                        <!-- `students` is a page, so an empty one no longer distinguishes the two
                             cases; the search term does. -->
                        {{
                            studentSearch.trim()
                                ? 'No students match your search'
                                : 'No students enrolled'
                        }}
                    </div>
                </div>
            </template>
        </template>

        <div v-else class="tw:text-center tw:py-16 tw:text-navy-60">Class not found.</div>

        <McDialog v-model:open="isCreateDialogOpen">
            <McDialogContent class="tw:max-w-lg tw:sm:max-w-2xl">
                <CreateAssignment
                    :default-class-id="classId"
                    @save="handleCreate"
                    @cancel="isCreateDialogOpen = false"
                />
            </McDialogContent>
        </McDialog>

        <McDialog v-model:open="isCreateExamOpen">
            <McDialogContent class="tw:max-w-lg tw:sm:max-w-2xl">
                <CreateExam
                    :class-id="classId"
                    @save="handleCreateExam"
                    @cancel="isCreateExamOpen = false"
                />
            </McDialogContent>
        </McDialog>

        <McDialog v-model:open="isEditDialogOpen">
            <McDialogContent class="tw:sm:max-w-md">
                <EditClass
                    :initial-values="editFormValues"
                    @save="handleEdit"
                    @cancel="isEditDialogOpen = false"
                    @delete="handleDelete"
                />
            </McDialogContent>
        </McDialog>

        <McDialog v-model:open="isAddStudentOpen">
            <McDialogContent class="tw:sm:max-w-md">
                <AddStudent @save="handleAddStudent" @cancel="isAddStudentOpen = false" />
            </McDialogContent>
        </McDialog>

        <McDialog v-model:open="isImportCsvOpen">
            <McDialogContent class="tw:sm:max-w-md">
                <ImportStudentsCsv @save="handleImportCsv" @cancel="isImportCsvOpen = false" />
            </McDialogContent>
        </McDialog>
    </div>
</template>
