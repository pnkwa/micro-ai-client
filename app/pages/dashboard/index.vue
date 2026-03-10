<script setup lang="ts">
import { ref, computed } from 'vue'
import {
    Users,
    Mail,
    Clock,
    CheckCircle,
    LayoutGrid,
    FileText,
    TrendingUp,
    Award,
    Timer,
    Filter,
} from 'lucide-vue-next'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { BarChart } from '~/core/components/bar-chart'
import { getStatusVariant } from '~/core/helpers/variants'

import dashboardData from '~/data/dashboard.json'
import classesData from '~/data/classes.json'

dayjs.extend(relativeTime)

interface ClassItem {
    id: number
    name: string
    students: number
    status: 'active' | 'inactive'
}

const classes = ref<ClassItem[]>(classesData.classes as ClassItem[])
const selectedClassId = ref<number | 'all'>('all')
const selectedPeriod = ref('Weekly')

const activeClasses = computed(() => classes.value.filter((c) => c.status === 'active'))

const classSelectOptions = computed(() => [
    { value: 'all', label: 'All Classes' },
    ...activeClasses.value.map((c) => ({ value: c.id, label: c.name })),
])

const selectedClassName = computed(() => {
    if (selectedClassId.value === 'all') return 'All Classes'
    const cls = classes.value.find((c) => c.id === selectedClassId.value)
    return cls?.name || 'All Classes'
})

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
        label: 'Pending Reviews',
        value: dashboardData.stats.pendingReviews,
        icon: Clock,
        type: 'pending',
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
const recentSubmissions = dashboardData.recentSubmissions
</script>

<template>
    <div>
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-6">
            <div>
                <h1 class="tw:text-2xl tw:font-bold tw:text-primary tw:mb-1">Dashboard</h1>
                <p class="tw:text-sm tw:text-navy-60">Overview of {{ selectedClassName }}</p>
            </div>
            <McSelect
                v-model="selectedClassId"
                :options="classSelectOptions"
                option-value="value"
                option-label="label"
                placeholder="All Classes"
            />
        </div>

        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:lg:grid-cols-4 tw:gap-4 tw:mb-6">
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
            <McTable>
                <McTableHeader>
                    <McTableRow>
                        <McTableHead>Student</McTableHead>
                        <McTableHead>Assignment</McTableHead>
                        <McTableHead>Submitted</McTableHead>
                        <McTableHead>Status</McTableHead>
                    </McTableRow>
                </McTableHeader>
                <McTableBody>
                    <McTableRow v-for="submission in recentSubmissions" :key="submission.id">
                        <McTableCell>
                            <div class="tw:flex tw:items-center tw:gap-6">
                                <div
                                    class="tw:w-9 tw:h-9 tw:rounded-full tw:bg-navy-10 tw:flex tw:items-center tw:justify-center"
                                >
                                    <Users class="avatar-icon" />
                                </div>
                                <div>
                                    <p class="tw:text-sm tw:font-medium tw:text-navy-100">
                                        {{ submission.studentName }}
                                    </p>
                                    <p class="tw:text-xs tw:text-navy-50">
                                        {{ submission.studentId }}
                                    </p>
                                </div>
                            </div>
                        </McTableCell>
                        <McTableCell class="tw:text-sm tw:text-navy-80">
                            {{ submission.assignment }}
                        </McTableCell>
                        <McTableCell class="tw:text-xs tw:text-navy-50">
                            {{ formatSubmittedAt(submission.submittedAt) }}
                        </McTableCell>
                        <McTableCell>
                            <McBadge
                                :variant="getStatusVariant(submission.status)"
                                class="tw:capitalize"
                            >
                                {{ submission.status }}
                            </McBadge>
                        </McTableCell>
                    </McTableRow>
                </McTableBody>
            </McTable>
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
