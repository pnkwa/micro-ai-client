<script setup lang="ts">
import { h } from 'vue'
import { Search, User } from 'lucide-vue-next'
import type { ColumnDef, PaginationState } from '@tanstack/vue-table'
import type { Assignment } from '~/services/assignmentService'
import type { SubmissionView } from '~/services/submissionService'
import { getStatusVariant } from '~/core/helpers/variants'

const props = defineProps<{
    assignment: Assignment
    submissions: SubmissionView[]
    isLoading: boolean
}>()

const { $dayjs } = useNuxtApp()
const formatDateTime = (date: string) => $dayjs(date).format('MMM D, h:mm A')

const searchQuery = ref('')
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 10 })

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

const submissionScore = (s: SubmissionView): number | null => {
    if (s.score === null || s.score === undefined) return null
    const points = props.assignment.points
    if (!points) return null
    return Math.round((s.score / points) * 100)
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
                <div class="tw:flex tw:items-center tw:gap-2.5">
                    <div
                        class="tw:w-8 tw:h-8 tw:rounded-full tw:bg-navy-10 tw:border tw:border-navy-20 tw:flex tw:items-center tw:justify-center tw:shrink-0"
                    >
                        <User class="tw:w-4 tw:h-4 tw:text-navy-60" />
                    </div>
                    <div class="tw:flex tw:flex-col">
                        <span class="tw:text-sm tw:font-medium tw:text-navy-100">
                            {{ studentFullName(row.original) }}
                        </span>
                        <span class="tw:text-xs tw:text-navy-50">
                            {{ row.original.student_id }}
                        </span>
                    </div>
                </div>
            </template>

            <template #body-submitted_at="{ row }">
                <span class="tw:text-sm tw:text-slate-500">
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
                            {{ submissionScore(row.original) }}%
                        </span>
                    </template>
                    <span v-else class="tw:text-xs tw:text-navy-40">—</span>
                </div>
            </template>

            <template #body-status="{ row }">
                <McBadge :variant="getStatusVariant(row.original.status)" class="tw:capitalize">
                    {{ row.original.status }}
                </McBadge>
            </template>

            <template #body-actions="{ row }">
                <NuxtLink
                    :to="`/classes/${assignment.class_id}/assignments/${assignment.id}/submissions/${row.original.id}`"
                >
                    <McButton
                        variant="outline"
                        size="sm"
                        class="tw:text-xs tw:h-7 tw:border-slate-200 tw:text-primary tw:hover:bg-primary/5 tw:hover:border-primary/30"
                    >
                        Review
                    </McButton>
                </NuxtLink>
            </template>
        </McDataTable>
    </div>
</template>
