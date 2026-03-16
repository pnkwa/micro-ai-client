<script setup lang="ts">
import { FileText, Plus } from 'lucide-vue-next'
import CreateAssignment from '~/features/components/forms/CreateAssignment.vue'
import type { CreateAssignmentFormData } from '~/features/types/forms/assignment'

import assignmentsData from '~/data/assignments.json'
import classesData from '~/data/classes.json'

interface AssignmentItem {
    id: number
    name: string
    dueDate: string
    classId: number
    submissions: number
    status: 'active' | 'closed'
    description?: string
    instructions?: string
    points?: number
    attachments?: string[]
}

interface ClassItem {
    id: number
    name: string
    students: number
    status: 'active' | 'inactive'
}

const router = useRouter()
const { $dayjs } = useNuxtApp()

const assignments = ref<AssignmentItem[]>(assignmentsData.assignments as AssignmentItem[])
const classes = ref<ClassItem[]>(classesData.classes as ClassItem[])
const isCreateDialogOpen = ref(false)
const selectedClassId = ref<number | 'all'>('all')

const activeClasses = computed(() => classes.value.filter((c) => c.status === 'active'))

const classSelectOptions = computed(() => [
    { value: 'all', label: 'All Classes' },
    ...activeClasses.value.map((c) => ({ value: c.id, label: c.name })),
])

const filteredAssignments = computed(() => {
    if (selectedClassId.value === 'all') {
        return assignments.value
    }
    return assignments.value.filter((a) => a.classId === selectedClassId.value)
})

const openCreateDialog = () => {
    isCreateDialogOpen.value = true
}

const goToDetail = (assignment: AssignmentItem) => {
    router.push(`/assignments/${assignment.id}`)
}

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

const handleCreateCancel = () => {
    isCreateDialogOpen.value = false
}

const formatDate = (date: string) => {
    return $dayjs(date).format('MMM D, YYYY')
}

const getStatusLabel = (status: string) => {
    return status === 'active' ? 'Active' : 'Closed'
}
</script>

<template>
    <div>
        <div class="tw:flex tw:justify-between tw:items-center tw:mb-6">
            <div>
                <h1 class="tw:text-2xl tw:font-semibold tw:text-primary">Assignments</h1>
                <p class="tw:text-sm tw:text-navy-60">Create and manage course assignments</p>
            </div>
            <div class="tw:flex tw:items-center tw:gap-3">
                <McSelect
                    v-model="selectedClassId"
                    :options="classSelectOptions"
                    option-value="value"
                    option-label="label"
                    placeholder="All Classes"
                />
                <McButton @click="openCreateDialog">
                    <Plus class="tw:w-4 tw:h-4 tw:mr-1" />
                    New Assignment
                </McButton>
            </div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-3">
            <div
                v-for="assignment in filteredAssignments"
                :key="assignment.id"
                class="tw:flex tw:justify-between tw:items-center tw:p-4 tw:bg-white tw:rounded-lg tw:border tw:border-gray-200 tw:cursor-pointer tw:transition-all tw:duration-200 hover:tw:shadow-md"
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
                <div class="tw:flex tw:items-center tw:gap-0.75">
                    <McBadge :variant="assignment.status === 'active' ? 'default' : 'outline'">
                        {{ getStatusLabel(assignment.status) }}
                    </McBadge>
                </div>
            </div>
        </div>

        <McDialog v-model:open="isCreateDialogOpen">
            <McDialogContent class="tw:sm:max-w-lg">
                <CreateAssignment @save="handleCreate" @cancel="handleCreateCancel" />
            </McDialogContent>
        </McDialog>
    </div>
</template>
