<script setup lang="ts">
import { FileText, Users, Plus, ChevronLeft } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import CreateAssignment from '~/features/components/forms/CreateAssignment.vue'
import EditClass from '~/features/components/forms/EditClass.vue'
import type { CreateAssignmentFormData } from '~/features/types/forms/assignment'
import type { EditClassFormData } from '~/features/types/forms/class'
import { classService, type ClassItem, type StudentRosterItem } from '~/services/classService'
import { assignmentService, type AssignmentListItem } from '~/services/assignmentService'

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()

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

await Promise.all([loadClass(), loadAssignments()])

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([
    { label: 'Classes', to: '/classes' },
    { label: classItem.value?.name ?? 'Class' },
])

const activeTab = ref<'assignments' | 'students'>('assignments')

const onTabChange = async (tab: 'assignments' | 'students') => {
    activeTab.value = tab
    if (tab === 'students' && students.value.length === 0) {
        await loadStudents()
    }
}

const isCreateDialogOpen = ref(false)
const isEditDialogOpen = ref(false)

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

const formatDate = (date: string) => $dayjs(date).format('MMM D, YYYY')

const studentInitials = (s: StudentRosterItem) =>
    `${s.user.firstname[0] ?? ''}${s.user.lastname[0] ?? ''}`.toUpperCase()
</script>

<template>
    <div>
        <div v-if="isLoadingClass" class="tw:text-center tw:py-16 tw:text-navy-60">Loading…</div>

        <template v-else-if="classItem">
            <div class="tw:flex tw:items-start tw:justify-between tw:mb-6">
                <div class="tw:flex tw:items-start tw:gap-3">
                    <button
                        class="tw:flex tw:items-center tw:gap-1.5 tw:p-1 tw:text-navy-60 tw:hover:text-primary tw:hover:bg-primary/20 tw:transition-colors tw:bg-navy-10 tw:rounded-md"
                        @click="router.push('/classes')"
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
                    <McButton variant="outline" size="sm" @click="isEditDialogOpen = true">
                        Edit Class
                    </McButton>
                </div>
            </div>

            <div class="tw:flex tw:border-b tw:border-navy-10 tw:mb-6">
                <button
                    v-for="tab in [
                        { value: 'assignments', label: 'Assignments' },
                        { value: 'students', label: 'Students' },
                    ]"
                    :key="tab.value"
                    class="tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:border-b-2 tw:-mb-px tw:transition-colors"
                    :class="
                        activeTab === tab.value
                            ? 'tw:border-primary tw:text-primary'
                            : 'tw:border-transparent tw:text-navy-60 tw:hover:text-navy-100'
                    "
                    @click="onTabChange(tab.value as 'assignments' | 'students')"
                >
                    {{ tab.label }}
                </button>
            </div>

            <template v-if="activeTab === 'assignments'">
                <div class="tw:flex tw:justify-between tw:mb-4">
                    <span class="tw:text-sm tw:text-navy-60">
                        {{ assignments.length }} assignments
                    </span>
                    <McButton @click="isCreateDialogOpen = true">
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
                        <McBadge :variant="assignment.status === 'active' ? 'default' : 'outline'">
                            {{ assignment.status }}
                        </McBadge>
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
                    class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-md tw:overflow-hidden"
                >
                    <div
                        class="tw:flex tw:items-center tw:justify-between tw:px-6 tw:py-4 tw:border-b tw:border-navy-10"
                    >
                        <div class="tw:flex tw:items-center tw:gap-2">
                            <Users class="tw:w-4 tw:h-4 tw:text-navy-60" />
                            <span class="tw:text-sm tw:font-semibold tw:text-navy-100">
                                {{ students.length }} Enrolled Students
                            </span>
                        </div>
                        <span class="tw:text-xs tw:text-navy-40">{{ classItem.semester }}</span>
                    </div>

                    <div
                        v-if="isLoadingStudents"
                        class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60"
                    >
                        Loading students…
                    </div>

                    <div v-else class="tw:divide-y tw:divide-navy-10">
                        <div
                            v-for="student in students"
                            :key="student.student_id"
                            class="tw:flex tw:items-center tw:gap-3 tw:px-6 tw:py-3"
                        >
                            <div
                                class="tw:w-8 tw:h-8 tw:rounded-full tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:text-primary tw:text-xs tw:font-bold tw:shrink-0"
                            >
                                {{ studentInitials(student) }}
                            </div>
                            <div>
                                <p class="tw:text-sm tw:font-medium tw:text-navy-100">
                                    {{ student.user.firstname }} {{ student.user.lastname }}
                                </p>
                                <p class="tw:text-xs tw:text-navy-50">
                                    {{ student.user.email }} · {{ student.student_id }}
                                </p>
                            </div>
                        </div>

                        <div
                            v-if="students.length === 0"
                            class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-50"
                        >
                            No students enrolled
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
    </div>
</template>
