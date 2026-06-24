<script setup lang="ts">
import {
    Users,
    Mail,
    CheckCircle,
    LayoutGrid,
    FileText,
    TrendingUp,
    Award,
    Timer,
} from 'lucide-vue-next'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { BarChart } from '~/core/components/bar-chart'
import { getStatusVariant } from '~/core/helpers/variants'
import { useClassFilterStore } from '~/core/store/useClassFilterStore'
import { classService, type StudentRosterItem } from '~/services/classService'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import { assignmentService, type AssignmentListItem } from '~/services/assignmentService'
import type { ColumnDef } from '@tanstack/vue-table'

dayjs.extend(relativeTime)

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: 'Dashboard', to: '/dashboard' }])

// ---- state ----

const classFilterStore = useClassFilterStore()
const selectedPeriod = ref('Weekly')

const submissions = ref<SubmissionView[]>([])
const classStudents = ref(new Map<number, StudentRosterItem[]>())
const assignments = ref<AssignmentListItem[]>([])
const isLoading = ref(true)

// ---- loaders ----

const loadSubmissions = async () => {
    submissions.value = await submissionService.list()
}

const loadAllStudents = async () => {
    const classes = classFilterStore.classes
    if (!classes.length) return
    const results = await Promise.all(classes.map((c) => classService.getStudents(c.id)))
    const map = new Map<number, StudentRosterItem[]>()
    classes.forEach((c, i) => map.set(c.id, results[i] ?? []))
    classStudents.value = map
}

const loadAssignments = async () => {
    if (classFilterStore.isAllSelected) {
        assignments.value = await assignmentService.list()
    } else {
        assignments.value = await assignmentService.listByClass(
            classFilterStore.selectedClassId as number,
        )
    }
}

isLoading.value = true
try {
    await Promise.all([classFilterStore.fetchClasses(), loadSubmissions()])
    await loadAllStudents()
    await loadAssignments()
} catch {
    // auth failure or network error — show empty state, don't 500
} finally {
    isLoading.value = false
}

watch(() => classFilterStore.selectedClassId, loadAssignments)

// ---- helpers ----

const isLate = (s: SubmissionView) =>
    s.status === 'submitted' &&
    !!s.assignment?.due_date &&
    new Date(s.submitted_at) > new Date(s.assignment.due_date)

// ---- computed: scoping ----

const scopedSubmissions = computed(() => {
    if (classFilterStore.isAllSelected) return submissions.value
    return submissions.value.filter(
        (s) => s.assignment?.class?.id === classFilterStore.selectedClassId,
    )
})

const totalStudents = computed(() => {
    if (classFilterStore.isAllSelected) {
        const ids = new Set([...classStudents.value.values()].flat().map((s) => s.student_id))
        return ids.size
    }
    return classStudents.value.get(classFilterStore.selectedClassId as number)?.length ?? 0
})

const enrolledCount = computed(() => totalStudents.value)

// ---- computed: stat cards ----

const stats = computed(() => [
    {
        label: 'Total Students',
        value: totalStudents.value,
        icon: Users,
        type: 'students',
    },
    {
        label: 'Submissions',
        value: scopedSubmissions.value.length,
        icon: Mail,
        type: 'submissions',
    },
    {
        label: 'Late Submissions',
        value: scopedSubmissions.value.filter(isLate).length,
        icon: Timer,
        type: 'warning',
    },
    {
        label: 'Graded',
        value: scopedSubmissions.value.filter((s) => s.status === 'graded').length,
        icon: CheckCircle,
        type: 'graded',
    },
])

// ---- computed: activity chart ----

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

const weeklyActivity = computed(() => {
    const counts = new Array(7).fill(0)
    scopedSubmissions.value.forEach((s) => {
        counts[dayjs(s.submitted_at).day()]++
    })
    return DAY_LABELS.map((label, i) => ({ label, value: counts[i] as number }))
})

const monthlyActivity = computed(() => {
    const now = dayjs()
    const buckets = [0, 0, 0, 0]
    scopedSubmissions.value.forEach((s) => {
        const weeksAgo = now.diff(dayjs(s.submitted_at), 'week')
        if (weeksAgo >= 0 && weeksAgo < 4) {
            buckets[3 - weeksAgo]++
        }
    })
    return buckets.map((count, i) => ({ label: `Week ${i + 1}`, value: count }))
})

const submissionActivity = computed(() =>
    selectedPeriod.value === 'Monthly' ? monthlyActivity.value : weeklyActivity.value,
)

// ---- computed: class summary ----

const assignmentPointsMap = computed(() => new Map(assignments.value.map((a) => [a.id, a.points])))

const activeAssignmentsCount = computed(
    () => assignments.value.filter((a) => dayjs(a.due_date).isAfter(dayjs())).length,
)

const avgSubmissionsPerDay = computed(() => (scopedSubmissions.value.length / 7).toFixed(1))

const completionRate = computed(() => {
    if (!enrolledCount.value) return '—'
    const unique = new Set(scopedSubmissions.value.map((s) => s.student_id)).size
    return `${Math.round((unique / enrolledCount.value) * 100)}%`
})

const avgGrade = computed(() => {
    const graded = scopedSubmissions.value.filter((s) => s.status === 'graded' && s.score != null)
    if (!graded.length) return '—'
    const percentages = graded
        .map((s) => {
            const points = assignmentPointsMap.value.get(s.assignment_id)
            if (!points) return null
            return (s.score! / points) * 100
        })
        .filter((v): v is number => v != null)
    if (!percentages.length) return '—'
    return `${Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)}%`
})

const classSummaryItems = computed(() => [
    { label: 'Active assignments', value: activeAssignmentsCount.value, icon: FileText },
    { label: 'Avg submissions/day', value: avgSubmissionsPerDay.value, icon: Mail },
    { label: 'Completion rate', value: completionRate.value, icon: TrendingUp },
    { label: 'Avg grade', value: avgGrade.value, icon: Award },
])

// ---- computed: recent submissions table ----

interface AssessmentData {
    id: number
    studentName: string
    studentId: string
    className: string
    assignment: string
    assignmentId: number
    classId: number | null
    submittedAt: string
    status: 'graded' | 'submitted' | 'late'
}

const columns: ColumnDef<AssessmentData>[] = [
    { accessorKey: 'studentName', header: 'Student' },
    { accessorKey: 'className', header: () => h('div', { class: 'tw:text-center' }, 'Class') },
    { accessorKey: 'assignment', header: 'Assignment' },
    { accessorKey: 'submittedAt', header: 'Submitted At' },
    { accessorKey: 'status', header: () => h('div', { class: 'tw:text-center' }, 'Status') },
    { accessorKey: 'actions', header: () => h('div', { class: 'tw:text-center' }, 'Actions') },
]

const filteredSubmissions = computed((): AssessmentData[] =>
    scopedSubmissions.value.map((s) => ({
        id: s.id,
        studentName: s.student
            ? `${s.student.user.firstname} ${s.student.user.lastname}`
            : s.student_id,
        studentId: s.student_id,
        className: s.assignment?.class?.name ?? '—',
        assignment: s.assignment?.name ?? '—',
        assignmentId: s.assignment_id,
        classId: s.assignment?.class?.id ?? null,
        submittedAt: s.submitted_at,
        status: isLate(s) ? 'late' : s.status,
    })),
)

const formatSubmittedAt = (dateString: string) => dayjs(dateString).fromNow()
</script>

<template>
    <div>
        <div class="tw:flex tw:justify-between tw:items-center tw:mb-6">
            <div>
                <h1 class="tw:text-2xl tw:font-bold tw:text-primary tw:mb-1">Dashboard</h1>
                <p class="tw:text-sm tw:text-navy-60">
                    Overview of {{ classFilterStore.selectedClassName }}
                </p>
            </div>
            <McSelect
                v-model="classFilterStore.selectedClassId"
                :options="classFilterStore.classSelectOptions"
                option-value="value"
                option-label="label"
                placeholder="All Classes"
                class="tw:w-100"
            />
        </div>

        <div v-if="isLoading" class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60">
            Loading…
        </div>

        <template v-else>
            <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-4 tw:gap-4 tw:mb-6">
                <div
                    v-for="stat in stats"
                    :key="stat.label"
                    class="tw:bg-white tw:p-4 tw:border tw:border-navy-10 tw:rounded-md"
                >
                    <div class="tw:flex tw:items-center tw:justify-between tw-mb-2">
                        <span class="tw:text-navy-60 text-md">{{ stat.label }}</span>
                        <component
                            :is="stat.icon"
                            class="stat-color tw:w-6 tw:h-6"
                            :class="getStatusVariant(stat.type)"
                        />
                    </div>
                    <p
                        class="stat-color tw:text-3xl tw:font-semibold"
                        :class="getStatusVariant(stat.type)"
                    >
                        {{ stat.value }}
                    </p>
                </div>
            </div>

            <div class="charts-section">
                <BarChart
                    v-model:selected-period="selectedPeriod"
                    title="Submission Activity"
                    :data="submissionActivity"
                    :periods="['Weekly', 'Monthly']"
                    :max-y="totalStudents || 10"
                    class="activity-chart"
                />

                <div
                    class="tw:bg-white tw:p-6 tw:border tw:border-navy-10 tw:rounded-md summary-card"
                >
                    <div class="tw:flex tw:items-center tw:justify-between tw:pb-2 tw:mb-4">
                        <div class="tw:flex tw:items-center tw:gap-2">
                            <LayoutGrid class="card-icon" />
                            <h3 class="tw:text-[1rem] tw:font-semibold">Class Summary</h3>
                        </div>
                    </div>
                    <McTable>
                        <McTableBody>
                            <McTableRow v-for="item in classSummaryItems" :key="item.label">
                                <McTableCell>
                                    <div class="tw:flex tw:items-center tw:gap-3">
                                        <component :is="item.icon" class="summary-icon" />
                                        <span class="tw:text-sm">{{ item.label }}</span>
                                    </div>
                                </McTableCell>
                                <McTableCell class="tw:text-navy-100 tw:text-sm tw:text-right">
                                    {{ item.value }}
                                </McTableCell>
                            </McTableRow>
                        </McTableBody>
                    </McTable>
                </div>
            </div>

            <div class="tw:bg-white tw:p-6 tw:border tw:border-navy-10 tw:rounded-md">
                <div class="tw:flex tw:items-center tw:gap-2 tw:mb-4">
                    <Timer class="card-icon" />
                    <h3 class="tw:text-[1rem] tw:font-semibold">Recent Submissions</h3>
                </div>

                <McDataTable :columns="columns" :data="filteredSubmissions" class="tw-mt-4">
                    <template #body-studentName="{ row }">
                        <div class="tw:flex tw:items-center tw:gap-6">
                            <div
                                class="tw:w-9 tw:h-9 tw:rounded-full tw:bg-navy-10 tw:flex tw:items-center tw:justify-center"
                            >
                                <Users class="avatar-icon" />
                            </div>
                            <div class="tw:flex tw:flex-col tw:items-start">
                                <p class="tw:text-sm tw:font-medium tw:text-navy-100">
                                    {{ row.original.studentName }}
                                </p>
                                <p class="tw:text-xs tw:text-navy-50">
                                    {{ row.original.studentId }}
                                </p>
                            </div>
                        </div>
                    </template>
                    <template #body-className="{ row }">
                        <span class="tw:text-sm tw:text-navy-80">
                            {{ row.original.className }}
                        </span>
                    </template>
                    <template #body-assignment="{ row }">
                        <span class="tw:text-sm tw:text-navy-80">
                            {{ row.original.assignment }}
                        </span>
                    </template>
                    <template #body-submittedAt="{ row }">
                        <span class="tw:text-xs tw:text-navy-50">
                            {{ formatSubmittedAt(row.original.submittedAt) }}
                        </span>
                    </template>
                    <template #body-status="{ row }">
                        <McBadge
                            :variant="getStatusVariant(row.original.status)"
                            class="tw:capitalize"
                        >
                            {{ row.original.status }}
                        </McBadge>
                    </template>
                    <template #body-actions="{ row }">
                        <NuxtLink
                            v-if="row.original.classId"
                            :to="`/classes/${row.original.classId}/assignments/${row.original.assignmentId}/submissions/${row.original.id}`"
                        >
                            <McButton variant="outline" size="sm">Review</McButton>
                        </NuxtLink>
                    </template>
                </McDataTable>
            </div>
        </template>
    </div>
</template>

<style scoped lang="scss">
.stat-color {
    &.warning {
        color: var(--color-warning);
    }
    &.success {
        color: var(--color-primary);
    }
    &.info {
        color: #0ea5e9;
    }
    &.secondary {
        color: #6b7280;
    }
    &.outline {
        color: var(--color-navy-60);
    }
}

.charts-section {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;

    @media (max-width: 1024px) {
        grid-template-columns: 1fr;
    }
}

.card-icon {
    width: 20px;
    height: 20px;
    color: var(--color-navy-60);
}

.summary-icon {
    width: 18px;
    height: 18px;
    color: var(--color-navy-50);
}

.avatar-icon {
    width: 18px;
    height: 18px;
    color: var(--color-navy-50);
}
</style>
