<script setup lang="ts">
import { ref, computed } from 'vue'
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

import dashboardData from '~/data/dashboard.json'
import { useClassFilterStore } from '~/core/store/useClassFilterStore'
import type { ColumnDef } from '@tanstack/vue-table'

dayjs.extend(relativeTime)

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: 'Dashboard', to: '/dashboard' }])

interface AssessmentData {
    id: number
    studentName: string
    studentId: string
    className: string
    assignment: string
    submittedAt: string
    status: 'graded' | 'submitted' | 'late'
}

const columns: ColumnDef<AssessmentData>[] = [
    {
        accessorKey: 'studentName',
        header: 'Student',
    },
    {
        accessorKey: 'className',
        header: () => h('div', { class: 'tw:text-center' }, 'Class'),
    },
    {
        accessorKey: 'assignment',
        header: 'Assignment',
    },
    {
        accessorKey: 'submittedAt',
        header: 'Submitted At',
    },
    {
        accessorKey: 'status',
        header: () => h('div', { class: 'tw:text-center' }, 'Status'),
    },
    {
        accessorKey: 'actions',
        header: () => h('div', { class: 'tw:text-center' }, 'Actions'),
    },
]

const classFilterStore = useClassFilterStore()
const selectedPeriod = ref('Weekly')

const formatSubmittedAt = (dateString: string) => {
    return dayjs(dateString).fromNow()
}

const stats = computed(() => [
    {
        label: 'Total Students',
        value: dashboardData.stats.totalStudents,
        icon: Users,
        type: 'students',
    },
    {
        label: 'Submissions',
        value: dashboardData.stats.submissions,
        icon: Mail,
        type: 'submissions',
    },
    {
        label: 'Late Submissions',
        value: dashboardData.stats.pendingReviews,
        icon: Timer,
        type: 'warning',
    },
    {
        label: 'Graded',
        value: dashboardData.stats.graded,
        icon: CheckCircle,
        type: 'graded',
    },
])

const submissionActivity = computed(() => {
    const periodKey = selectedPeriod.value.toLowerCase()
    const activityData = dashboardData.submissionActivity
    const data = periodKey === 'monthly' ? activityData.monthly : activityData.weekly
    return data.map((date: { day: string; count: number }) => ({
        label: date.day,
        value: date.count,
    }))
})
const classSummary = dashboardData.classSummary
const classSummaryItems = computed(() => [
    {
        label: 'Active assignments',
        value: classSummary.activeAssignments,
        icon: FileText,
    },
    {
        label: 'Avg submissions/day',
        value: classSummary.avgSubmissionsPerDay,
        icon: Mail,
    },
    {
        label: 'Completion rate',
        value: classSummary.completionRate,
        icon: TrendingUp,
    },
    {
        label: 'Avg grade',
        value: classSummary.avgGrade,
        icon: Award,
    },
])
const recentSubmissions = dashboardData.recentSubmissions as AssessmentData[]

const filteredSubmissions = computed(() => {
    if (classFilterStore.selectedClassId === 'all') return recentSubmissions
    const className = classFilterStore.selectedClassName
    return recentSubmissions.filter((item) => item.className === className)
})
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
                :max-y="dashboardData.stats.totalStudents"
                class="activity-chart"
            />

            <div class="tw:bg-white tw:p-6 tw:border tw:border-navy-10 tw:rounded-md summary-card">
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
                    <span class="tw-text-sm tw:text-navy-80">
                        {{ row.original.className }}
                    </span>
                </template>
                <template #body-assignment="{ row }">
                    <span class="tw-text-sm tw:text-navy-80">
                        {{ row.original.assignment }}
                    </span>
                </template>
                <template #body-submittedAt="{ row }">
                    <span class="tw-text-xs tw:text-navy-50">
                        {{ formatSubmittedAt(row.original.submittedAt) }}
                    </span>
                </template>
                <template #body-status="{ row }">
                    <McBadge :variant="getStatusVariant(row.original.status)" class="tw:capitalize">
                        {{ row.original.status }}
                    </McBadge>
                </template>
                <template #body-actions="{ row }">
                    <NuxtLink
                        :to="`/submissions/${encodeURIComponent(row.original.assignment)}/${row.original.studentId}`"
                    >
                        <McButton variant="outline" size="sm">Review</McButton>
                    </NuxtLink>
                </template>
            </McDataTable>
        </div>
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

.filter-select {
    min-width: 180px;
    background: white;
    border: 1px solid #e5e7eb;

    &:hover {
        background: #f9fafb;
    }
}
</style>
