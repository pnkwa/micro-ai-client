<script setup lang="ts">
import { Plus, Pencil } from '@lucide/vue'
import { toast } from 'vue-sonner'
import CreateClass from '~/features/components/forms/CreateClass.vue'
import EditClass from '~/features/components/forms/EditClass.vue'
import type { CreateClassFormData, EditClassFormData } from '~/features/types/forms/class'
import { classService, type ClassItem } from '~/services/classService'

const router = useRouter()
const authStore = useAuth()
const isStudent = computed(() => authStore.user?.user_type === 'student' || !authStore.user)

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: isStudent.value ? 'My Classes' : 'Classes', to: '/classes' }])

const classes = ref<ClassItem[]>([])
const isLoading = ref(false)
const isCreateDialogOpen = ref(false)
const isEditDialogOpen = ref(false)
const selectedClass = ref<ClassItem | null>(null)

const loadClasses = async () => {
    isLoading.value = true
    try {
        classes.value =
            isStudent.value && authStore.user
                ? await classService.listEnrolled(authStore.user.id)
                : await classService.list()
    } catch {
        toast.error('Failed to load classes')
    } finally {
        isLoading.value = false
    }
}

await loadClasses()

const editFormValues = computed<EditClassFormData>(() => {
    if (selectedClass.value) {
        return {
            id: selectedClass.value.id,
            name: selectedClass.value.name,
            semester: selectedClass.value.semester,
            code: selectedClass.value.code,
            status: selectedClass.value.status,
        }
    }
    return { id: 0, name: '', semester: '', code: '', status: 'active' as const }
})

const openEditDialog = (classItem: ClassItem) => {
    selectedClass.value = classItem
    isEditDialogOpen.value = true
}

const handleCreate = async (values: CreateClassFormData) => {
    try {
        const created = await classService.create(values)
        classes.value.push(created)
        isCreateDialogOpen.value = false
        toast.success('Class created')
    } catch {
        toast.error('Failed to create class')
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
        const idx = classes.value.findIndex((c) => c.id === updated.id)
        if (idx !== -1) classes.value[idx] = updated
        isEditDialogOpen.value = false
        toast.success('Class updated')
    } catch {
        toast.error('Failed to update class')
    }
}

const handleDelete = async (id: number) => {
    try {
        await classService.remove(id)
        classes.value = classes.value.filter((c) => c.id !== id)
        isEditDialogOpen.value = false
        toast.success('Class deleted')
    } catch (e) {
        toast.error(apiErrorMessage(e, 'Failed to delete class'))
    }
}
</script>

<template>
    <div>
        <div class="tw:flex tw:justify-between tw:items-center tw:mb-6">
            <div>
                <h1 class="tw:text-2xl tw:font-bold tw:text-primary tw:mb-1">
                    {{ isStudent ? 'My Classes' : 'Classes' }}
                </h1>
                <p class="tw:text-sm tw:text-navy-60">
                    {{
                        isStudent
                            ? 'Classes you are enrolled in'
                            : 'Manage your courses and sections'
                    }}
                </p>
            </div>
            <McButton v-if="!isStudent" @click="isCreateDialogOpen = true">
                <Plus class="tw:w-4 tw:h-4 tw:mr-1" />
                New Class
            </McButton>
        </div>

        <div v-if="isLoading" class="tw:text-center tw:py-16 tw:text-navy-60">Loading…</div>

        <div
            v-else-if="classes.length === 0"
            class="tw:bg-white tw:border tw:border-dashed tw:border-navy-20 tw:rounded-lg tw:py-16 tw:text-center"
        >
            <p class="tw:text-sm tw:text-navy-60">
                {{
                    isStudent
                        ? 'You are not enrolled in any classes yet.'
                        : 'No classes yet. Create your first class to get started.'
                }}
            </p>
        </div>

        <div v-else class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:lg:grid-cols-4 tw:gap-4">
            <div
                v-for="classItem in classes"
                :key="classItem.id"
                class="tw:bg-white tw:rounded-lg tw:border tw:border-gray-200 tw:cursor-pointer tw:hover:shadow-md tw:transition-shadow tw:flex tw:flex-col tw:overflow-hidden"
                @click="router.push(`/classes/${classItem.id}`)"
            >
                <div class="tw:p-4 tw:flex-1">
                    <div class="tw:flex tw:justify-between tw:items-start tw:gap-2 tw:mb-1">
                        <h3 class="tw:text-sm tw:font-semibold tw:text-navy-100">
                            {{ classItem.name }}
                        </h3>
                        <McBadge :variant="classItem.status === 'active' ? 'default' : 'outline'">
                            {{ classItem.status === 'active' ? 'Active' : 'Closed' }}
                        </McBadge>
                    </div>
                    <p class="tw:text-xs tw:text-navy-60">{{ classItem.semester }}</p>
                    <p class="tw:text-xs tw:text-navy-40 tw:mt-0.5">{{ classItem.code }}</p>
                </div>

                <div
                    v-if="!isStudent"
                    class="tw:flex tw:justify-end tw:items-center tw:px-4 tw:py-3 tw:border-t"
                >
                    <button
                        class="tw:p-1.5 tw:rounded tw:text-navy-50 tw:hover:bg-navy-10 tw:hover:text-primary tw:transition-colors"
                        @click.stop="openEditDialog(classItem)"
                    >
                        <Pencil class="tw:w-3.5 tw:h-3.5" />
                    </button>
                </div>
            </div>
        </div>

        <McDialog v-model:open="isCreateDialogOpen">
            <McDialogContent class="tw:sm:max-w-md">
                <CreateClass @save="handleCreate" @cancel="isCreateDialogOpen = false" />
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
