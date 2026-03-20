import { ref, computed } from 'vue'
import classesData from '~/data/classes.json'

export interface ClassItem {
    id: number | string
    name: string
    semester?: string
    students?: number
    status?: 'active' | 'inactive' | 'closed'
}

export const useClassFilterStore = defineStore('classFilter', () => {
    // ─── State ────────────────────────────────────────────────────────────────
    const classes = ref<ClassItem[]>(classesData.classes as ClassItem[])
    const selectedClassId = ref<number | string>('all')
    const isLoading = ref(false) // ready for real API later

    // ─── Getters ──────────────────────────────────────────────────────────────

    const activeClasses = computed(() =>
        classes.value.filter((classItem) => classItem.status === 'active'),
    )
    const selectedClass = computed<ClassItem | null>(() =>
        selectedClassId.value === 'all'
            ? null
            : (classes.value.find((classItem) => classItem.id === selectedClassId.value) ?? null),
    )
    const selectedClassName = computed(() => selectedClass.value?.name ?? 'All Classes')
    const classSelectOptions = computed(() => [
        { value: 'all', label: 'All Classes' },
        ...activeClasses.value.map((classItem) => ({ value: classItem.id, label: classItem.name })),
    ])
    const isAllSelected = computed(() => selectedClassId.value === 'all')

    // Actions as arrow functions
    const fetchClasses = async () => {
        isLoading.value = true
        try {
            // TODO: replace with real API call
            // const data = await $fetch('/api/classes')
            // classes.value = data
            classes.value = classesData.classes as ClassItem[]
        } finally {
            isLoading.value = false
        }
    }

    const selectClass = (id: number | string) => {
        selectedClassId.value = id
    }

    const resetSelection = () => {
        selectedClassId.value = 'all'
    }

    // Helper as arrow function
    const getClassNameById = (id: number | string): string => {
        if (id === 'all') return 'All Classes'
        return classes.value.find((classItem) => classItem.id === id)?.name ?? 'All Classes'
    }

    return {
        // State
        classes,
        selectedClassId,
        isLoading,
        // Getters
        activeClasses,
        selectedClass,
        selectedClassName,
        classSelectOptions,
        isAllSelected,
        // Actions
        fetchClasses,
        selectClass,
        resetSelection,
        getClassNameById,
    }
})
