<script setup lang="ts">
import { ArrowLeft, FileText, Users, Plus } from 'lucide-vue-next'
import CreateAssignment from '~/features/components/forms/CreateAssignment.vue'
import EditClass from '~/features/components/forms/EditClass.vue'
import type { CreateAssignmentFormData } from '~/features/types/forms/assignment'
import type { EditClassFormData, ClassFormData } from '~/features/types/forms/class'

import classesData from '~/data/classes.json'
import assignmentsData from '~/data/assignments.json'
import studentsData from '~/data/students.json'

interface StudentItem {
    id: number
    name: string
    initials: string
    email: string
    classId: number
    submissionsCompleted: number
    submissionsTotal: number
    avgScore: number
}

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

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()

const classId = computed(() => Number(route.params.id))
const classes = ref<ClassFormData[]>(classesData.classes as ClassFormData[])
const classItem = computed(() => classes.value.find((c) => c.id === classId.value))

const assignments = ref<AssignmentItem[]>(assignmentsData.assignments as AssignmentItem[])
const classAssignments = computed(() =>
    assignments.value.filter((a) => a.classId === classId.value),
)

const classStudents = computed(() =>
    (studentsData.students as StudentItem[]).filter((s) => s.classId === classId.value),
)

const activeTab = ref<'assignments' | 'students'>('assignments')
const isCreateDialogOpen = ref(false)
const breadcrumb = useBreadcrumb()
watchEffect(() => {
    breadcrumb.setBreadcrumbs([
        { label: 'Classes', to: '/classes' },
        { label: classItem.value?.name ?? 'Class' },
    ])
})

const isEditDialogOpen = ref(false)

const editFormValues = computed(() => {
    if (classItem.value) {
        return {
            id: classItem.value.id,
            name: classItem.value.name,
            semester: classItem.value.semester,
            students: classItem.value.students,
            status: classItem.value.status,
        }
    }
    return { id: 0, name: '', semester: '', students: 0, status: 'active' as const }
})

const handleCreate = (values: CreateAssignmentFormData & { attachmentFiles?: string[] }) => {
    const newId = Math.max(...assignments.value.map((a) => a.id)) + 1
    const { attachmentFiles, ...rest } = values
    assignments.value.push({
        id: newId,
        submissions: 0,
        attachments: attachmentFiles || [],
        ...rest,
    })
    isCreateDialogOpen.value = false
}

const handleEdit = (values: EditClassFormData) => {
    const index = classes.value.findIndex((c) => c.id === values.id)
    if (index !== -1) classes.value[index] = values as ClassFormData
    isEditDialogOpen.value = false
}

const handleDelete = (id: number) => {
    const index = classes.value.findIndex((c) => c.id === id)
    if (index !== -1) classes.value.splice(index, 1)
    router.push('/classes')
}

const formatDate = (date: string) => $dayjs(date).format('MMM D, YYYY')
</script>

<template>
    <div>
        <template v-if="classItem">
            <!-- Header -->
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-6">
                <div class="tw:flex tw:items-center tw:gap-3">
                    <button
                        class="tw:flex tw:items-center tw:gap-1.5 tw:text-navy-60 tw:hover:text-primary tw:transition-colors"
                        @click="router.push('/classes')"
                    >
                        <ArrowLeft class="tw:w-4 tw:h-4" />
                    </button>
                    <div class="tw:min-w-0">
                        <h1
                            class="tw:text-2xl tw:font-bold tw:text-primary tw:leading-tight tw:max-w-2xl"
                        >
                            {{ classItem.name }}
                        </h1>
                        <p class="tw:text-sm tw:text-navy-60">{{ classItem.semester }}</p>
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

            <!-- Tabs -->
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
                    @click="activeTab = tab.value as 'assignments' | 'students'"
                >
                    {{ tab.label }}
                </button>
            </div>

            <!-- Assignments Tab -->
            <template v-if="activeTab === 'assignments'">
                <div class="tw:flex tw:justify-end tw:mb-4">
                    <McButton @click="isCreateDialogOpen = true">
                        <Plus class="tw:w-4 tw:h-4 tw:mr-1" />
                        New Assignment
                    </McButton>
                </div>

                <div v-if="classAssignments.length > 0" class="tw:flex tw:flex-col tw:gap-3">
                    <div
                        v-for="assignment in classAssignments"
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
                                    Due {{ formatDate(assignment.dueDate) }}
                                </p>
                            </div>
                        </div>
                        <div class="tw:flex tw:items-center tw:gap-3">
                            <span class="tw:text-xs tw:text-navy-50">
                                {{ assignment.submissions }} submissions
                            </span>
                        </div>
                    </div>
                </div>

                <div
                    v-else
                    class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-md tw:py-16 tw:text-center"
                >
                    <FileText class="tw:w-8 tw:h-8 tw:text-navy-30 tw:mx-auto tw:mb-2" />
                    <p class="tw:text-sm tw:text-navy-60">No assignments yet</p>
                    <p class="tw:text-xs tw:text-navy-40 tw:mt-1">
                        Create the first assignment for this class
                    </p>
                </div>
            </template>

            <!-- Students Tab -->
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
                                {{ classStudents.length }} Enrolled Students
                            </span>
                        </div>
                        <span class="tw:text-xs tw:text-navy-40">{{ classItem.semester }}</span>
                    </div>

                    <div class="tw:divide-y tw:divide-navy-10">
                        <div
                            v-for="student in classStudents"
                            :key="student.id"
                            class="tw:flex tw:items-center tw:justify-between tw:px-6 tw:py-3"
                        >
                            <div class="tw:flex tw:items-center tw:gap-3">
                                <div
                                    class="tw:w-8 tw:h-8 tw:rounded-full tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:text-primary tw:text-xs tw:font-bold tw:shrink-0"
                                >
                                    {{ student.initials }}
                                </div>
                                <div>
                                    <p class="tw:text-sm tw:font-medium tw:text-navy-100">
                                        {{ student.name }}
                                    </p>
                                    <p class="tw:text-xs tw:text-navy-50">{{ student.email }}</p>
                                </div>
                            </div>
                            <div
                                class="tw:flex tw:items-center tw:gap-6 tw:text-xs tw:text-navy-60"
                            >
                                <span>
                                    {{ student.submissionsCompleted }}/{{
                                        student.submissionsTotal
                                    }}
                                    submitted
                                </span>
                                <span
                                    class="tw:font-semibold tw:text-navy-100 tw:w-16 tw:text-right"
                                >
                                    Avg {{ student.avgScore }}%
                                </span>
                            </div>
                        </div>

                        <div
                            v-if="classStudents.length === 0"
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
            <McDialogContent class="tw:sm:max-w-lg">
                <CreateAssignment @save="handleCreate" @cancel="isCreateDialogOpen = false" />
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
