<script setup lang="ts">
import { h } from 'vue'
import * as XLSX from 'xlsx'
import {
    FileText,
    Users,
    Plus,
    ChevronLeft,
    UserPlus,
    Upload,
    ClipboardCheck,
    Download,
    Shapes,
} from '@lucide/vue'
import {
    buildClassGradeCanvas,
    buildClassGradeReport,
    exportFilename,
    type ClassGradeRow,
} from '~/core/helpers/scoreExport'
import type { ColumnDef, PaginationState } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'
import CreateAssignment from '~/features/components/forms/CreateAssignment.vue'
import CreateExam from '~/features/components/forms/CreateExam.vue'
import CreateAnnotationAssignment from '~/features/components/annotation/CreateAnnotationAssignment.vue'
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
import {
    annotationAssignmentService,
    type AnnotationAssignmentListItem,
    type CreateAnnotationAssignmentInput,
} from '~/services/annotationAssignmentService'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import {
    studentStatus,
    studentGradeText,
    classGradeText,
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
const annotationAssignments = ref<AnnotationAssignmentListItem[]>([])
const isLoadingClass = ref(false)
const isLoadingStudents = ref(false)
const isLoadingAssignments = ref(false)
const isLoadingExams = ref(false)
const isLoadingAnnotations = ref(false)

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
// staff-only, both feed the Students tab). A student with no graded work isn't in the map → "-".
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

// "18/25" over graded work, or a dash when the student has nothing graded yet. The formatting
// lives in classGradeText, next to the per-submission formatter it has to stay consistent with.
//
// Deliberately still a function called per row rather than a precomputed map: `grades` is already
// a Map, so this is an O(1) lookup for the 15 rows on screen, where precomputing would format the
// whole roster (up to a few hundred) on every reload and add an invalidation point for nothing.
const gradeText = (studentId: string): string => classGradeText(grades.value.get(studentId))

/**
 * Export every enrolled student's running grade.
 *
 * Re-fetches the roster UNPAGED rather than exporting `students`, which holds only the page on
 * screen: an export of 15 of 200 students that looks complete is worse than no export. Omitting
 * per_page returns the whole roster (classes.controller.ts). `grades` already covers the class,
 * so it does not need re-reading.
 *
 * Two formats, matching the assignment's Submissions tab. The Canvas one carries a PERCENTAGE out
 * of 100 rather than raw points: `possible` is per-student, since it sums whatever that student
 * has had graded so far, and a Canvas column has one Points Possible for everyone. Normalizing is
 * what makes a class total expressible as a column at all. For per-assignment marks, where the
 * denominator really is shared, use the Submissions tab export instead.
 */
const isExportingGrades = ref(false)

/** Both exports read the same rows, so the two files can never disagree. */
const collectGradeRows = async (): Promise<ClassGradeRow[]> => {
    const roster = await classService.getStudents(classId.value)
    return roster.data.map((s) => {
        const grade = grades.value.get(s.student_id)
        return {
            studentId: s.student_id,
            name: `${s.user.firstname} ${s.user.lastname}`,
            // null, not 0: only students with graded work are in the map, and "nothing graded
            // yet" is not a mark of zero.
            earned: grade?.earned ?? null,
            possible: grade?.possible ?? null,
        }
    })
}

const exportGrades = async (format: 'xlsx' | 'csv') => {
    isExportingGrades.value = true
    try {
        const rows = await collectGradeRows()
        const className = classItem.value?.name ?? 'class'
        if (format === 'xlsx') {
            XLSX.writeFile(buildClassGradeReport(rows), exportFilename(className, 'xlsx', 'grades'))
        } else {
            XLSX.writeFile(
                buildClassGradeCanvas(rows, { className }),
                exportFilename(className, 'csv', 'grades'),
                { bookType: 'csv' },
            )
        }
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to export grades'))
    } finally {
        isExportingGrades.value = false
    }
}

const loadAssignments = async () => {
    isLoadingAssignments.value = true
    try {
        // GET /<class_id>/assignments
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

const loadAnnotationAssignments = async () => {
    isLoadingAnnotations.value = true
    try {
        annotationAssignments.value = await annotationAssignmentService.listByClass(classId.value)
    } catch {
        toast.error('Failed to load annotation assignments')
    } finally {
        isLoadingAnnotations.value = false
    }
}

// This student's own submissions, keyed by assignment, so every row in the list can show
// where they stand. One request covers the whole page: GET /submissions ignores its filters
// for a student and returns all of their rows. Instructors don't need it - their pill is the
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
    loadAnnotationAssignments(),
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
    const opens = exam.opens_at ? $dayjs(exam.opens_at) : null
    const closes = exam.closes_at ? $dayjs(exam.closes_at) : null
    if (opens && now.isBefore(opens)) return `Opens ${opens.format('MMM D, HH:mm')}`
    if (closes && now.isAfter(closes)) return `Closed ${closes.format('MMM D')}`
    if (closes) return `Open until ${closes.format('MMM D, HH:mm')}`
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

// Annotation assignments are consolidated INTO the Assignments tab (no separate tab). GET /assignments
// returns them too (they are assignment rows with is_exam=false), so classic rows exclude their ids to
// avoid a double listing, and the annotation rows come from their own list with the right icon + route.
const annotationIds = computed(
    () => new Set(annotationAssignments.value.map((a) => a.id)),
)

type AssignmentRow =
    | { kind: 'classic'; item: AssignmentListItem }
    | { kind: 'annotation'; item: AnnotationAssignmentListItem }

const assignmentRows = computed<AssignmentRow[]>(() => [
    ...assignments.value
        .filter((a) => !a.is_exam && !annotationIds.value.has(a.id))
        .map((item) => ({ kind: 'classic' as const, item })),
    ...annotationAssignments.value.map((item) => ({
        kind: 'annotation' as const,
        item,
    })),
])

const rowLink = (row: AssignmentRow) =>
    row.kind === 'annotation'
        ? `/annotation-assignments/${row.item.id}/annotate`
        : `/classes/${classId.value}/assignments/${row.item.id}`

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

// One "New Assignment" dialog, with a type switch deciding which form (and service) is used.
const isCreateDialogOpen = ref(false)
const newAssignmentType = ref<'classic' | 'annotation'>('classic')

const handleCreateAnnotation = async (values: CreateAnnotationAssignmentInput) => {
    try {
        const created = await annotationAssignmentService.create(values)
        annotationAssignments.value.push(created)
        isCreateDialogOpen.value = false
        toast.success('Annotation assignment created')
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to create annotation assignment'))
    }
}

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

const studentSearch = ref('')

// Page and search live server-side: the table shows one page, so filtering what arrived would
// only ever match the rows that page happened to hold. `page` is 1-based to match the query.
const studentPage = ref(1)
const studentPerPage = ref(15)

// Writable rather than a ref the table owns, so changing the page IS the refetch - no watcher
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
// changes under the pager - page 4 of the old search is meaningless for the new one.
const onStudentSearch = useDebounceFn(() => {
    studentPage.value = 1
    void loadStudents()
}, SEARCH_DEBOUNCE_MS)

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
                            {{ classItem.semester }}, {{ classItem.code }}
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
                        {{ assignmentRows.length }} assignments
                    </span>
                    <McButton v-if="!isStudent" @click="isCreateDialogOpen = true">
                        <Plus class="tw:w-4 tw:h-4 tw:mr-1" />
                        New Assignment
                    </McButton>
                </div>

                <div
                    v-if="isLoadingAssignments || isLoadingAnnotations"
                    class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60"
                >
                    Loading assignments…
                </div>

                <div v-else-if="assignmentRows.length > 0" class="tw:flex tw:flex-col tw:gap-3">
                    <div
                        v-for="row in assignmentRows"
                        :key="`${row.kind}-${row.item.id}`"
                        class="tw:flex tw:justify-between tw:items-center tw:gap-4 tw:p-4 tw:bg-white tw:rounded-xl tw:border tw:border-navy-10 tw:cursor-pointer tw:hover:border-primary/30 tw:hover:shadow-md tw:transition-all"
                        @click="router.push(rowLink(row))"
                    >
                        <div class="tw:flex tw:min-w-0 tw:items-center tw:gap-3">
                            <span
                                class="tw:flex tw:h-10 tw:w-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary/10 tw:text-primary"
                            >
                                <component
                                    :is="row.kind === 'annotation' ? Shapes : FileText"
                                    class="tw:h-5 tw:w-5"
                                />
                            </span>
                            <div class="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
                                <div class="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
                                    <h3
                                        class="tw:truncate tw:text-sm tw:font-semibold tw:text-navy-100"
                                    >
                                        {{ row.item.name }}
                                    </h3>
                                    <span
                                        v-if="row.kind === 'annotation'"
                                        class="tw:shrink-0 tw:rounded-full tw:bg-primary/10 tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-medium tw:text-primary"
                                    >
                                        Annotation
                                    </span>
                                </div>
                                <p class="tw:text-xs tw:text-navy-50">
                                    {{
                                        row.item.due_date
                                            ? `Due ${dueDateText(row.item.due_date, 'MMM D, YYYY')}`
                                            : 'Never due'
                                    }}
                                </p>
                            </div>
                        </div>
                        <div class="tw:flex tw:items-center tw:gap-4">
                            <!-- Students get their own standing on the work; instructors get
                                 the assignment's own state, which is what they author. -->
                            <template v-if="isStudent">
                                <div class="tw:flex tw:flex-col tw:items-end tw:gap-1">
                                    <McBadge :variant="rowStatus(row.item).variant">
                                        {{ rowStatus(row.item).label }}
                                    </McBadge>
                                    <span
                                        v-if="rowScore(row.item)"
                                        data-testid="row-score"
                                        class="tw:text-[11px] tw:font-medium tw:text-navy-60 tw:tabular-nums"
                                    >
                                        {{ rowScore(row.item) }}
                                    </span>
                                </div>
                            </template>
                            <McBadge
                                v-else
                                :variant="row.item.status === 'active' ? 'default' : 'outline'"
                            >
                                {{ row.item.status === 'active' ? 'Active' : 'Closed' }}
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
                            <!-- Same two-format menu as the assignment's Submissions tab. Exports
                                 the whole class, not the page on screen: see collectGradeRows.
                                 Disabled while empty so it can't produce a header-only file. -->
                            <McDropdownMenu>
                                <McDropdownMenuTrigger as-child>
                                    <McButton
                                        variant="outline"
                                        size="sm"
                                        class="tw:flex-1 tw:sm:flex-none"
                                        :loading="isExportingGrades"
                                        :disabled="studentTotal === 0"
                                    >
                                        <Download class="tw:w-4 tw:h-4 tw:mr-1" />
                                        Export grades
                                    </McButton>
                                </McDropdownMenuTrigger>
                                <McDropdownMenuContent align="end" class="tw:w-64">
                                    <McDropdownMenuItem @select="exportGrades('xlsx')">
                                        <div class="tw:flex tw:flex-col">
                                            <span class="tw:text-sm">Excel report (.xlsx)</span>
                                            <span class="tw:text-xs tw:text-navy-50">
                                                Earned, possible and percent
                                            </span>
                                        </div>
                                    </McDropdownMenuItem>
                                    <McDropdownMenuItem @select="exportGrades('csv')">
                                        <div class="tw:flex tw:flex-col">
                                            <span class="tw:text-sm">Canvas / Mango (.csv)</span>
                                            <span class="tw:text-xs tw:text-navy-50">
                                                Overall percentage, out of 100
                                            </span>
                                        </div>
                                    </McDropdownMenuItem>
                                    <McDropdownMenuSeparator />
                                    <div class="tw:px-2 tw:py-1.5 tw:text-xs tw:text-navy-50">
                                        All {{ studentTotal }} students
                                    </div>
                                </McDropdownMenuContent>
                            </McDropdownMenu>
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
                <McDialogHeader>
                    <McDialogTitle>Create New Assignment</McDialogTitle>
                </McDialogHeader>
                <!-- Type switch: a classic question-based assignment, or an annotation assignment.
                     The two forms (and services) are otherwise independent. -->
                <div class="tw:flex tw:gap-2 tw:px-2 tw:pt-1">
                    <button
                        type="button"
                        class="tw:flex-1 tw:rounded-lg tw:border tw:p-3 tw:text-left tw:transition-colors"
                        :class="
                            newAssignmentType === 'classic'
                                ? 'tw:border-primary tw:bg-primary/5'
                                : 'tw:border-navy-15 tw:hover:bg-navy-5'
                        "
                        @click="newAssignmentType = 'classic'"
                    >
                        <span
                            class="tw:flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-semibold"
                            :class="
                                newAssignmentType === 'classic'
                                    ? 'tw:text-primary'
                                    : 'tw:text-navy-80'
                            "
                        >
                            <FileText class="tw:size-4" /> Classic
                        </span>
                        <span class="tw:mt-0.5 tw:block tw:text-xs tw:text-navy-50">
                            Questions — choice, fill-in, image, slide.
                        </span>
                    </button>
                    <button
                        type="button"
                        class="tw:flex-1 tw:rounded-lg tw:border tw:p-3 tw:text-left tw:transition-colors"
                        :class="
                            newAssignmentType === 'annotation'
                                ? 'tw:border-primary tw:bg-primary/5'
                                : 'tw:border-navy-15 tw:hover:bg-navy-5'
                        "
                        @click="newAssignmentType = 'annotation'"
                    >
                        <span
                            class="tw:flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-semibold"
                            :class="
                                newAssignmentType === 'annotation'
                                    ? 'tw:text-primary'
                                    : 'tw:text-navy-80'
                            "
                        >
                            <Shapes class="tw:size-4" /> Annotation
                        </span>
                        <span class="tw:mt-0.5 tw:block tw:text-xs tw:text-navy-50">
                            Students annotate an album's images.
                        </span>
                    </button>
                </div>
                <CreateAssignment
                    v-if="newAssignmentType === 'classic'"
                    :default-class-id="classId"
                    @save="handleCreate"
                    @cancel="isCreateDialogOpen = false"
                />
                <CreateAnnotationAssignment
                    v-else
                    :default-class-id="classId"
                    @save="handleCreateAnnotation"
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
