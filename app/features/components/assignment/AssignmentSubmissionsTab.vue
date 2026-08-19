<script setup lang="ts">
import { h } from 'vue'
import * as XLSX from 'xlsx'
import { Search, Download } from '@lucide/vue'
import {
    buildCanvasGradebook,
    buildScoreReport,
    exportFilename,
    type ScoreRow,
} from '~/core/helpers/scoreExport'
import type { ColumnDef, PaginationState } from '@tanstack/vue-table'
import { assignmentTotalPoints, type Assignment } from '~/services/assignmentService'
import type { SubmissionView } from '~/services/submissionService'
import type { StudentRosterItem } from '~/services/classService'
import { studentStatus, type StudentStatus } from '~/core/helpers/studentAssignmentStatus'

const props = defineProps<{
    assignment: Assignment
    // The whole enrolled roster, so the table can show who HASN'T submitted, not just who has.
    students: StudentRosterItem[]
    submissions: SubmissionView[]
    isLoading: boolean
}>()

const { $dayjs } = useNuxtApp()
const formatDateTime = (date: string) => $dayjs(date).format('MMM D, HH:mm')

const searchQuery = ref('')
// The input stays instant; the filtering runs off a debounced copy, so a class roster isn't
// re-scanned and the table re-rendered on every keystroke. Same delay as the other search boxes.
const searchTerm = refDebounced(searchQuery, SEARCH_DEBOUNCE_MS)
// Default to the whole roster (completion tracking); the dropdown narrows to one status.
type StatusFilter = 'all' | StudentStatus['label']

const filter = ref<StatusFilter>('all')
// The Status column's own labels, so a chosen filter and the badges left on screen always agree.
const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All students' },
    { value: 'Not submitted', label: 'Not submitted' },
    { value: 'Overdue', label: 'Overdue' },
    { value: 'Submitted', label: 'Submitted' },
    { value: 'Late submission', label: 'Late submission' },
    { value: 'Rejected', label: 'Rejected' },
]

const isStatusFilter = (v: unknown): v is StatusFilter => filterOptions.some((o) => o.value === v)

// One row per enrolled student, carrying their submission if any - null means "not submitted".
interface RosterRow {
    studentId: string
    name: string
    submission: SubmissionView | null
}

const submittedCount = computed(() => props.submissions.length)

const rows = computed<RosterRow[]>(() => {
    const byStudent = new Map(props.submissions.map((s) => [s.student_id, s]))
    return props.students.map((st) => ({
        studentId: st.student_id,
        name: `${st.user.firstname} ${st.user.lastname}`,
        submission: byStudent.get(st.student_id) ?? null,
    }))
})

// Status via the shared helper - a null submission yields "Not submitted" / "Overdue".
const statusFor = (r: RosterRow) => studentStatus(props.assignment, r.submission)

const filteredRows = computed<RosterRow[]>(() => {
    let list = rows.value
    if (filter.value !== 'all') list = list.filter((r) => statusFor(r).label === filter.value)
    if (searchTerm.value) {
        const q = searchTerm.value.toLowerCase()
        list = list.filter((r) => r.name.toLowerCase().includes(q) || r.studentId.includes(q))
    }
    return list
})

// Same arrangement as the class page's Students roster: the table fills the screen and scrolls
// its rows, measured from the card so it holds on both the assignment and exam pages despite
// their different header heights, with the gap leaving room for the pagination bar below.
const tableCard = useTemplateRef<HTMLElement>('tableCard')
const tableBodyHeight = useViewportFillHeight(tableCard, { gap: 76 })

const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 15 })

const resetToFirstPage = () => {
    pagination.value = { ...pagination.value, pageIndex: 0 }
}
// Debounced to the same delay as `searchTerm`, so the reset and the narrowed rows land together.
// The status dropdown keeps the undebounced version: that is one deliberate click, not a burst.
const onSearchInput = useDebounceFn(resetToFirstPage, SEARCH_DEBOUNCE_MS)
const onFilterChange = (value: unknown) => {
    if (isStatusFilter(value)) {
        filter.value = value
        resetToFirstPage()
    }
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

// The sizes matter under the table's fixed layout: they are the column widths, and holding them
// steady is what stops the columns shifting as you page through longer and shorter names. Student
// takes the slack since it carries two lines beside an avatar.
const columns: ColumnDef<RosterRow>[] = [
    { accessorKey: 'studentName', header: 'Student', size: 260 },
    { accessorKey: 'submitted_at', header: 'Submitted', size: 130 },
    {
        accessorKey: 'quality',
        header: () => h('div', { class: 'tw:text-center' }, 'Score'),
        size: 150,
    },
    {
        accessorKey: 'status',
        header: () => h('div', { class: 'tw:text-center' }, 'Status'),
        size: 150,
    },
    {
        accessorKey: 'actions',
        header: () => h('div', { class: 'tw:text-center' }, 'Actions'),
        size: 110,
    },
]

/**
 * Export what is ON SCREEN, not the whole roster: `filteredRows` is what the instructor is looking
 * at, and handing them a different set than the one they filtered to is a surprise. The button
 * label says so.
 *
 * Rows are built from the same helpers the table renders with - statusFor, totalPoints,
 * formatDateTime - so the file and the screen cannot disagree.
 */
const exportRows = computed<ScoreRow[]>(() =>
    filteredRows.value.map((r) => ({
        studentId: r.studentId,
        name: r.name,
        // null, not 0: a student who has not submitted, or has submitted but is not yet graded,
        // has no mark. Exporting 0 for them would mark them down in the gradebook.
        score: r.submission?.score ?? null,
        status: statusFor(r).label,
        submittedAt: r.submission ? formatDateTime(r.submission.submitted_at) : null,
    })),
)

const exportMeta = computed(() => ({
    assignmentName: props.assignment.name,
    totalPoints: totalPoints.value,
}))

const canExport = computed(() => exportRows.value.length > 0)

const exportReport = () => {
    XLSX.writeFile(
        buildScoreReport(exportRows.value, exportMeta.value),
        exportFilename(props.assignment.name, 'xlsx'),
    )
}

const exportForCanvas = () => {
    XLSX.writeFile(
        buildCanvasGradebook(exportRows.value, exportMeta.value),
        exportFilename(props.assignment.name, 'csv'),
        { bookType: 'csv' },
    )
}

function getScoreColor(score: number) {
    if (score >= 70) return { bar: 'tw:bg-emerald-500', text: 'tw:text-emerald-600' }
    if (score >= 40) return { bar: 'tw:bg-amber-400', text: 'tw:text-amber-600' }
    return { bar: 'tw:bg-red-400', text: 'tw:text-red-600' }
}
</script>

<template>
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:mb-4">
        <span class="tw:text-sm tw:text-navy-60">
            {{ submittedCount }} of {{ students.length }} submitted
        </span>
        <div class="tw:flex tw:items-center tw:gap-2">
            <!-- One option per Status badge the table can print. All is the default so missing
                 work stays visible. -->
            <McSelect
                :model-value="filter"
                :options="filterOptions"
                option-value="value"
                option-label="label"
                class="tw:w-48 tw:bg-white"
                @update:model-value="onFilterChange"
            />
            <div
                class="tw:flex tw:items-center tw:gap-2 tw:bg-white tw:border tw:border-slate-200 tw:rounded-md tw:px-3 tw:py-2 tw:w-64"
            >
                <Search class="tw:w-3.5 tw:h-3.5 tw:text-slate-400 tw:shrink-0" />
                <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="Search student..."
                    class="tw:outline-none tw:w-full tw:text-sm tw:text-slate-700 tw:placeholder-slate-400 tw:bg-transparent"
                    @input="onSearchInput"
                />
            </div>

            <!-- Two formats because they answer different questions: the .xlsx is a report to
                 read or keep, the .csv is shaped for a Canvas gradebook import (Canvas takes CSV,
                 not .xlsx). Both carry the rows currently on screen. -->
            <McDropdownMenu>
                <McDropdownMenuTrigger as-child>
                    <McButton variant="outline" size="sm" :disabled="!canExport">
                        <Download class="tw:size-3.5 tw:mr-1" />
                        Export
                    </McButton>
                </McDropdownMenuTrigger>
                <McDropdownMenuContent align="end" class="tw:w-64">
                    <McDropdownMenuItem @select="exportReport">
                        <div class="tw:flex tw:flex-col">
                            <span class="tw:text-sm">Excel report (.xlsx)</span>
                            <span class="tw:text-xs tw:text-navy-50">Scores, status and times</span>
                        </div>
                    </McDropdownMenuItem>
                    <McDropdownMenuItem @select="exportForCanvas">
                        <div class="tw:flex tw:flex-col">
                            <span class="tw:text-sm">Canvas / Mango (.csv)</span>
                            <span class="tw:text-xs tw:text-navy-50">For a gradebook import</span>
                        </div>
                    </McDropdownMenuItem>
                    <McDropdownMenuSeparator />
                    <div class="tw:px-2 tw:py-1.5 tw:text-xs tw:text-navy-50">
                        {{ filteredRows.length }} of {{ rows.length }} students
                        {{ filteredRows.length === rows.length ? '' : '(filtered)' }}
                    </div>
                </McDropdownMenuContent>
            </McDropdownMenu>
        </div>
    </div>

    <div v-if="isLoading" class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60">
        Loading submissions…
    </div>

    <div
        v-else
        ref="tableCard"
        class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-md tw:overflow-hidden"
    >
        <McDataTable
            v-model:pagination="pagination"
            :columns="columns"
            :data="filteredRows"
            :total="filteredRows.length"
            :body-height="tableBodyHeight"
        >
            <template #body-studentName="{ row }">
                <!-- The table sits flush to the card edge, so the avatar needs its own inset. -->
                <McStudentIdentity
                    :name="row.original.name"
                    :student-id="row.original.studentId"
                    class="tw:pl-4"
                />
            </template>

            <template #body-submitted_at="{ row }">
                <span v-if="row.original.submission" class="tw:text-xs tw:text-navy-50">
                    {{ formatDateTime(row.original.submission.submitted_at) }}
                </span>
                <span v-else class="tw:text-xs tw:text-navy-40">-</span>
            </template>

            <template #body-quality="{ row }">
                <div class="tw:flex tw:items-center tw:justify-center tw:gap-2.5">
                    <template
                        v-if="
                            row.original.submission &&
                            submissionScore(row.original.submission) !== null
                        "
                    >
                        <div
                            class="tw:w-14 tw:h-1.5 tw:bg-slate-100 tw:rounded-md tw:overflow-hidden tw:shrink-0"
                        >
                            <div
                                class="tw:h-full tw:rounded-md tw:transition-all"
                                :class="
                                    getScoreColor(submissionScore(row.original.submission)!).bar
                                "
                                :style="{ width: `${submissionScore(row.original.submission)}%` }"
                            />
                        </div>
                        <span
                            class="tw:text-xs tw:font-semibold tw:tabular-nums"
                            :class="getScoreColor(submissionScore(row.original.submission)!).text"
                        >
                            {{ scoreFraction(row.original.submission) }}
                        </span>
                    </template>
                    <span v-else class="tw:text-xs tw:text-navy-40">-</span>
                </div>
            </template>

            <template #body-status="{ row }">
                <div class="tw:flex tw:items-center tw:justify-center">
                    <McBadge :variant="statusFor(row.original).variant">
                        {{ statusFor(row.original).label }}
                    </McBadge>
                </div>
            </template>

            <template #body-actions="{ row }">
                <div class="tw:flex tw:justify-center">
                    <NuxtLink
                        v-if="row.original.submission"
                        :to="`/classes/${assignment.class_id}/assignments/${assignment.id}/submissions/${row.original.submission.id}`"
                    >
                        <McButton variant="outline" size="sm">Review</McButton>
                    </NuxtLink>
                    <span v-else class="tw:text-xs tw:text-navy-40">-</span>
                </div>
            </template>
        </McDataTable>
    </div>
</template>
