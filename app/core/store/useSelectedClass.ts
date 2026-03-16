import classesData from '~/data/classes.json'

interface ClassItem {
    id: number
    name: string
    semester: string
    students: number
    status: 'active' | 'closed'
}

export const useSelectedClass = defineStore('selectedClass', () => {
    const classes = ref<ClassItem[]>(classesData.classes as ClassItem[])
    const selectedClassId = ref<number | null>(null)

    // const activeClasses = computed(() => {
    //     return classes.value.filter((c) => c.status === 'active')
    // })

    const selectedClass = computed(() => {
        if (selectedClassId.value === null) return null
        return classes.value.find((c) => c.id === selectedClassId.value) || null
    })

    const setSelectedClass = (classId: number | null) => {
        selectedClassId.value = classId
    }

    // Auto-select first active class if none selected
    // const initializeSelection = () => {
    //     if (selectedClassId.value === null && activeClasses.value.length > 0) {
    //         selectedClassId.value = activeClasses.value[0].id
    //     }
    // }

    return {
        classes,
        selectedClassId,
        selectedClass,
        setSelectedClass,
    }
})
