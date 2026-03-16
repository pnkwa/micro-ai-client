<script setup lang="ts">
import { Users, Plus } from 'lucide-vue-next'
import CreateClass from '~/features/components/forms/CreateClass.vue'
import EditClass from '~/features/components/forms/EditClass.vue'
import type {
    CreateClassFormData,
    EditClassFormData,
    ClassFormData,
} from '~/features/types/forms/class'

import classesData from '~/data/classes.json'

const classes = ref<ClassFormData[]>(classesData.classes as ClassFormData[])
const isCreateDialogOpen = ref(false)
const isEditDialogOpen = ref(false)
const selectedClass = ref<EditClassFormData | null>(null)

const editFormValues = computed(() => {
    if (selectedClass.value) {
        return {
            id: selectedClass.value.id,
            name: selectedClass.value.name,
            semester: selectedClass.value.semester,
            students: selectedClass.value.students,
            status: selectedClass.value.status,
        }
    }
    return { id: 0, name: '', semester: '', students: 0, status: 'active' as const }
})

const openCreateDialog = () => {
    isCreateDialogOpen.value = true
}

const openEditDialog = (classItem: EditClassFormData) => {
    selectedClass.value = classItem
    isEditDialogOpen.value = true
}

const handleCreate = (values: CreateClassFormData) => {
    const newId = Math.max(...classes.value.map((c) => c.id)) + 1
    classes.value.push({ id: newId, ...values })
    isCreateDialogOpen.value = false
}

const handleEdit = (values: EditClassFormData) => {
    const index = classes.value.findIndex((c) => c.id === values.id)
    if (index !== -1) {
        classes.value[index] = values
    }
    isEditDialogOpen.value = false
}

const handleCreateCancel = () => {
    isCreateDialogOpen.value = false
}

const handleEditCancel = () => {
    isEditDialogOpen.value = false
}

const handleDelete = (id: number) => {
    const index = classes.value.findIndex((c) => c.id === id)
    if (index !== -1) {
        classes.value.splice(index, 1)
    }
    isEditDialogOpen.value = false
}

const getStatusLabel = (status: string) => {
    return status === 'active' ? 'Active' : 'Closed'
}
</script>

<template>
    <div>
        <div class="tw:flex tw:justify-between tw:items-center tw:mb-6">
            <div>
                <h1 class="tw:text-2xl tw:font-bold tw:text-primary tw:mb-1">Classes</h1>
                <p class="tw:text-sm tw:text-navy-60">Manage your courses and sections</p>
            </div>
            <McButton @click="openCreateDialog">
                <Plus class="tw:w-4 tw:h-4 tw:mr-1" />
                New Class
            </McButton>
        </div>

        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:lg:grid-cols-4 tw:gap-4">
            <div
                v-for="classItem in classes"
                :key="classItem.id"
                class="tw:bg-white tw:p-4 tw:rounded-lg tw:border tw:border-gray-200 tw:cursor-pointer hover:tw:shadow-md"
                @click="openEditDialog(classItem)"
            >
                <div class="tw:flex tw:justify-between tw:items-start tw:gap-2 tw:mb-1">
                    <h3 class="tw:text-sm tw:font-semibold tw:text-navy-100">
                        {{ classItem.name }}
                    </h3>
                    <McBadge :variant="classItem.status === 'active' ? 'default' : 'outline'">
                        {{ getStatusLabel(classItem.status) }}
                    </McBadge>
                </div>
                <p class="tw:text-xs tw:text-navy-60">{{ classItem.semester }}</p>
                <div class="tw:flex tw:justify-between tw:items-center tw:mt-4">
                    <span class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-navy-60">
                        <Users class="tw:w-4 tw:h-4" />
                        {{ classItem.students }} students
                    </span>
                </div>
            </div>
        </div>

        <McDialog v-model:open="isCreateDialogOpen">
            <McDialogContent class="tw:sm:max-w-md">
                <CreateClass @save="handleCreate" @cancel="handleCreateCancel" />
            </McDialogContent>
        </McDialog>

        <McDialog v-model:open="isEditDialogOpen">
            <McDialogContent class="tw:sm:max-w-md">
                <EditClass
                    :initial-values="editFormValues"
                    @save="handleEdit"
                    @cancel="handleEditCancel"
                    @delete="handleDelete"
                />
            </McDialogContent>
        </McDialog>
    </div>
</template>
