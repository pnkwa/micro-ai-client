<script setup lang="ts">
import { h } from 'vue'
import { FileText, Users, Plus, ChevronLeft, UserPlus, Upload } from 'lucide-vue-next'
import type { ColumnDef } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'
import CreateAssignment from '~/features/components/forms/CreateAssignment.vue'
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
    type EnrollStudentInput,
} from '~/services/classService'
import { assignmentService, type AssignmentListItem } from '~/services/assignmentService'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import {
    studentAssignmentBadges,
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
const isLoadingClass = ref(false)
const isLoadingStudents = ref(false)
const isLoadingAssignments = ref(false)

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

const loadStudents = async () => {
    isLoadingStudents.value = true
    try {
        students.value = await classService.getStudents(classId.value)
    } catch {
        toast.error('Failed to load students')
    } finally {
        isLoadingStudents.value = false
    }
}

const loadAssignments = async () => {
    isLoadingAssignments.value = true
    try {
        assignments.value = await assignmentService.listByClass(classId.value)
    } catch {
        toast.error('Failed to load assignments')
    } finally {
        isLoadingAssignments.value = false
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
    ...(isStudent.value ? [loadMySubmissions()] : []),
])

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([
    isStudent.value ? { label: 'Home', to: '/' } : { label: 'Classes', to: '/classes' },
    { label: classItem.value?.name ?? 'Class' },
])

const assignmentStatus = (assignment: AssignmentListItem) =>
    studentAssignmentBadges(assignment, mySubmissions.value.get(assignment.id))

const activeTab = ref<'assignments' | 'students'>('assignments')

const onTabChange = async (tab: 'assignments' | 'students') => {
    activeTab.value = tab
    if (tab === 'students' && students.value.length === 0) {
        await loadStudents()
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

const filteredStudents = computed(() => {
    const q = studentSearch.value.trim().toLowerCase()
    if (!q) return students.value
    return students.value.filter((s) =>
        [s.student_id, s.user.firstname, s.user.lastname, s.user.email]
            .join(' ')
            .toLowerCase()
            .includes(q),
    )
})

const LAZY_STEP = 15
const visibleCount = ref(LAZY_STEP)
const visibleStudents = computed(() => filteredStudents.value.slice(0, visibleCount.value))
const hasMoreStudents = computed(() => visibleCount.value < filteredStudents.value.length)

const onStudentSearch = () => {
    visibleCount.value = LAZY_STEP
}

const studentScroll = useTemplateRef<HTMLElement>('studentScroll')
const { top: studentScrollTop } = useElementBounding(studentScroll)
const { height: windowHeight } = useWindowSize()
const tableMaxHeight = computed(
    () => `${Math.max(240, Math.round(windowHeight.value - studentScrollTop.value - 24))}px`,
)

const loadMoreEl = useTemplateRef<HTMLElement>('loadMoreEl')
useIntersectionObserver(
    loadMoreEl,
    (entries) => {
        if (entries[0]?.isIntersecting && hasMoreStudents.value) {
            visibleCount.value = Math.min(
                visibleCount.value + LAZY_STEP,
                filteredStudents.value.length,
            )
        }
    },
    { root: studentScroll },
)

const stickyHead = 'tw:text-left tw:sticky tw:top-0 tw:z-10 tw:bg-white tw:text-navy-100'
const leftHead = (label: string) => () => h('div', { class: 'tw:text-left' }, label)
const studentColumns: ColumnDef<StudentRosterItem>[] = [
    {
        accessorKey: 'no',
        header: () => h('div', { class: 'tw:text-left tw:pl-4' }, 'No.'),
        meta: { headerClass: stickyHead },
    },
    {
        accessorKey: 'student_id',
        header: leftHead('Student ID'),
        meta: { headerClass: stickyHead },
    },
    { accessorKey: 'name', header: leftHead('Name'), meta: { headerClass: stickyHead } },
    { accessorKey: 'email', header: leftHead('Email'), meta: { headerClass: stickyHead } },
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
                v-if="!isStudent"
                :model-value="activeTab"
                :tabs="[
                    { value: 'assignments', label: 'Assignments' },
                    { value: 'students', label: 'Students' },
                ]"
                @update:model-value="onTabChange($event as 'assignments' | 'students')"
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
                        class="tw:flex tw:justify-between tw:items-center tw:p-4 tw:bg-white tw:rounded-lg tw:border tw:border-gray-200 tw:cursor-pointer tw:hover:shadow-md tw:transition-shadow"
                        @click="router.push(`/classes/${classId}/assignments/${assignment.id}`)"
                    >
                        <div class="tw:flex tw:items-center tw:gap-3">
                            <FileText class="tw:w-5 tw:h-5 tw:text-gray-400" />
                            <div class="tw:flex tw:flex-col tw:gap-0.5">
                                <h3 class="tw:text-sm tw:font-medium tw:text-navy-100">
                                    {{ assignment.name }}
                                </h3>
                                <p class="tw:text-xs tw:text-navy-60">
                                    Due {{ formatDate(assignment.due_date) }}
                                </p>
                            </div>
                        </div>
                        <div class="tw:flex tw:items-center tw:gap-4">
                            <!-- Students get their own standing on the work; instructors get
                                 the assignment's own state, which is what they author. -->
                            <template v-if="isStudent">
                                <McBadge
                                    v-for="b in assignmentStatus(assignment)"
                                    :key="b.label"
                                    :variant="b.variant"
                                >
                                    {{ b.label }}
                                </McBadge>
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
                    class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-md tw:py-16 tw:text-center"
                >
                    <FileText class="tw:w-8 tw:h-8 tw:text-navy-60 tw:mx-auto tw:mb-2" />
                    <p class="tw:text-sm tw:text-navy-60">No assignments yet</p>
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
                    class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-md tw:overflow-hidden"
                >
                    <div
                        ref="studentScroll"
                        class="tw:overflow-y-auto tw:[&>div]:overflow-visible tw:**:data-[slot=table-container]:overflow-visible"
                        :style="{ maxHeight: tableMaxHeight }"
                    >
                        <McDataTable
                            v-if="filteredStudents.length > 0"
                            :columns="studentColumns"
                            :data="visibleStudents"
                            :total="filteredStudents.length"
                            server-side
                        >
                            <template #body-no="{ row }">
                                <div class="tw:text-left tw:text-sm tw:text-navy-40 tw:pl-4">
                                    {{ row.index + 1 }}
                                </div>
                            </template>
                            <template #body-student_id="{ row }">
                                <div class="tw:text-left tw:text-sm tw:text-navy-60">
                                    {{ row.original.student_id }}
                                </div>
                            </template>
                            <template #body-name="{ row }">
                                <div
                                    class="tw:text-left tw:text-sm tw:font-medium tw:text-navy-100"
                                >
                                    {{ row.original.user.firstname }}
                                    {{ row.original.user.lastname }}
                                </div>
                            </template>
                            <template #body-email="{ row }">
                                <div class="tw:text-left tw:text-sm tw:text-navy-60">
                                    {{ row.original.user.email }}
                                </div>
                            </template>
                        </McDataTable>

                        <div v-else class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-50">
                            {{
                                students.length === 0
                                    ? 'No students enrolled'
                                    : 'No students match your search'
                            }}
                        </div>

                        <div
                            v-if="hasMoreStudents"
                            ref="loadMoreEl"
                            class="tw:py-3 tw:text-center tw:text-xs tw:text-navy-40"
                        >
                            Loading more…
                        </div>
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
