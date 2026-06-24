import { classService, type ClassItem } from '~/services/classService'

export type { ClassItem }

export const useClassFilterStore = defineStore('classFilter', () => {
    const classes = ref<ClassItem[]>([])
    const selectedClassId = ref<number | 'all'>('all')
    const isLoading = ref(false)
    const error = ref<string | null>(null)

    const activeClasses = computed(() => classes.value.filter((c) => c.status === 'active'))

    const selectedClass = computed<ClassItem | null>(() =>
        selectedClassId.value === 'all'
            ? null
            : (classes.value.find((c) => c.id === selectedClassId.value) ?? null),
    )

    const selectedClassName = computed(() => selectedClass.value?.name ?? 'All Classes')

    const classSelectOptions = computed(() => [
        { value: 'all' as const, label: 'All Classes' },
        ...activeClasses.value.map((c) => ({ value: c.id, label: c.name })),
    ])

    const isAllSelected = computed(() => selectedClassId.value === 'all')

    const fetchClasses = async () => {
        isLoading.value = true
        error.value = null
        try {
            classes.value = await classService.list()
        } catch (e) {
            error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to load classes'
        } finally {
            isLoading.value = false
        }
    }

    const selectClass = (id: number | 'all') => {
        selectedClassId.value = id
    }

    const resetSelection = () => {
        selectedClassId.value = 'all'
    }

    const getClassNameById = (id: number | 'all'): string => {
        if (id === 'all') return 'All Classes'
        return classes.value.find((c) => c.id === id)?.name ?? 'All Classes'
    }

    return {
        classes,
        selectedClassId,
        isLoading,
        error,
        activeClasses,
        selectedClass,
        selectedClassName,
        classSelectOptions,
        isAllSelected,
        fetchClasses,
        selectClass,
        resetSelection,
        getClassNameById,
    }
})
