<script setup lang="ts">
import { h } from 'vue'
import { Search } from 'lucide-vue-next'
import type { ColumnDef, PaginationState } from '@tanstack/vue-table'
import { assignmentTotalPoints, type Assignment } from '~/services/assignmentService'
import type { SubmissionView } from '~/services/submissionService'
import { submissionBadges } from '~/core/helpers/studentAssignmentStatus'

const props = defineProps<{
    assignment: Assignment
    submissions: SubmissionView[]
    isLoading: boolean
}>()

const { $dayjs } = useNuxtApp()
const formatDateTime = (date: string) => $dayjs(date).format('MMM D, HH:mm')

const searchQuery = ref('')
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 10 })

// Lateness is per submission against this assignment's deadline, so the due date comes from
// the assignment prop rather than the row (the list rows carry their own assignment relation,
// but every row here belongs to this one).
const statusFor = (s: SubmissionView) => submissionBadges(s, props.assignment.due_date)

const studentFullName = (s: SubmissionView) =>
    s.student ? `${s.student.user.firstname} ${s.student.user.lastname}` : s.student_id

const filteredSubmissions = computed(() => {
    if (!searchQuery.value) return props.submissions
    const q = searchQuery.value.toLowerCase()
    return props.submissions.filter((s) => studentFullName(s).toLowerCase().includes(q))
})

const resetToFirstPage = () => {
    pagination.value = { ...pagination.value, pageIndex: 0 }
}

// Total points is derived from the exercises' questions, not assignments.points; see
// assignmentTotalPoints for why (the stored field is disconnected from the authored content).
const totalPoints = computed(() => assignmentTotalPoints(props.assignment))

// Drives the progress-bar width/color only; the visible label is the raw fraction below.
const submissionScore = (s: SubmissionView): number | null => {
    if (s.score === null || s.score === undefined) return null
    if (!totalPoints.value) return null
    return Math.round((s.score / totalPoints.value) * 100)
}

// "3.5/4": raw points earned over the assignment total, not a percentage.
const scoreFraction = (s: SubmissionView): string | null => {
    if (s.score === null || s.score === undefined) return null
    return `${s.score}/${totalPoints.value}`
}

const columns: ColumnDef<SubmissionView>[] = [
    { accessorKey: 'studentName', header: 'Student' },
    { accessorKey: 'submitted_at', header: 'Submitted' },
    { accessorKey: 'quality', header: () => h('div', { class: 'tw:text-center' }, 'Score') },
    { accessorKey: 'status', header: () => h('div', { class: 'tw:text-center' }, 'Status') },
    { accessorKey: 'actions', header: () => h('div', { class: 'tw:text-center' }, 'Actions') },
]

function getScoreColor(score: number) {
    if (score >= 70) return { bar: 'tw:bg-emerald-500', text: 'tw:text-emerald-600' }
    if (score >= 40) return { bar: 'tw:bg-amber-400', text: 'tw:text-amber-600' }
    return { bar: 'tw:bg-red-400', text: 'tw:text-red-600' }
}
</script>

<template>
    <div class="tw:flex tw:items-center tw:justify-between tw:mb-4">
        <span class="tw:text-sm tw:text-navy-60">
            {{ filteredSubmissions.length }} submission{{
                filteredSubmissions.length !== 1 ? 's' : ''
            }}
        </span>
        <div
            class="tw:flex tw:items-center tw:gap-2 tw:bg-white tw:border tw:border-slate-200 tw:rounded-md tw:px-3 tw:py-2 tw:w-64"
        >
            <Search class="tw:w-3.5 tw:h-3.5 tw:text-slate-400 tw:shrink-0" />
            <input
                v-model="searchQuery"
                type="text"
                placeholder="Search student..."
                class="tw:outline-none tw:w-full tw:text-sm tw:text-slate-700 tw:placeholder-slate-400 tw:bg-transparent"
                @input="resetToFirstPage"
            />
        </div>
    </div>

    <div v-if="isLoading" class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60">
        Loading submissions…
    </div>

    <div v-else class="tw:bg-white tw:p-6 tw:border tw:border-navy-10 tw:rounded-md">
        <McDataTable
            v-model:pagination="pagination"
            :columns="columns"
            :data="filteredSubmissions"
            :total="filteredSubmissions.length"
        >
            <template #body-studentName="{ row }">
                <McStudentIdentity
                    :name="studentFullName(row.original)"
                    :student-id="row.original.student_id"
                />
            </template>

            <template #body-submitted_at="{ row }">
                <span class="tw:text-xs tw:text-navy-50">
                    {{ formatDateTime(row.original.submitted_at) }}
                </span>
            </template>

            <template #body-quality="{ row }">
                <div class="tw:flex tw:items-center tw:justify-center tw:gap-2.5">
                    <template v-if="submissionScore(row.original) !== null">
                        <div
                            class="tw:w-14 tw:h-1.5 tw:bg-slate-100 tw:rounded-md tw:overflow-hidden tw:shrink-0"
                        >
                            <div
                                class="tw:h-full tw:rounded-md tw:transition-all"
                                :class="getScoreColor(submissionScore(row.original)!).bar"
                                :style="{ width: `${submissionScore(row.original)}%` }"
                            />
                        </div>
                        <span
                            class="tw:text-xs tw:font-semibold tw:tabular-nums"
                            :class="getScoreColor(submissionScore(row.original)!).text"
                        >
                            {{ scoreFraction(row.original) }}
                        </span>
                    </template>
                    <span v-else class="tw:text-xs tw:text-navy-40">—</span>
                </div>
            </template>

            <template #body-status="{ row }">
                <div class="tw:flex tw:items-center tw:justify-center tw:gap-1.5">
                    <McBadge
                        v-for="b in statusFor(row.original)"
                        :key="b.label"
                        :variant="b.variant"
                    >
                        {{ b.label }}
                    </McBadge>
                </div>
            </template>

            <template #body-actions="{ row }">
                <NuxtLink
                    :to="`/classes/${assignment.class_id}/assignments/${assignment.id}/submissions/${row.original.id}`"
                >
                    <McButton variant="outline" size="sm">Review</McButton>
                </NuxtLink>
            </template>
        </McDataTable>
    </div>
</template>
