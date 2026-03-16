<script setup lang="ts">
import { Search, ChevronLeft, ChevronRight, User } from 'lucide-vue-next'

import submissionsData from '~/data/submissions.json'
import classesData from '~/data/classes.json'
import assignmentsData from '~/data/assignments.json'

interface SubmissionItem {
    id: number
    studentName: string
    studentInitials: string
    assignment: string
    classId: number
    submittedAt: string
    quality: number
    status: 'submitted' | 'graded'
}

interface ClassItem {
    id: number
    name: string
    students: number
    status: 'active' | 'inactive'
}

const { $dayjs } = useNuxtApp()

const submissions = ref<SubmissionItem[]>(submissionsData.submissions as SubmissionItem[])
const classes = ref<ClassItem[]>(classesData.classes as ClassItem[])
const searchQuery = ref('')
const selectedAssignment = ref('all')
const selectedClassId = ref<number | 'all'>('all')
const currentPage = ref(1)
const itemsPerPage = ref(10)

const activeClasses = computed(() => classes.value.filter((c) => c.status === 'active'))

const assignmentOptions = computed(() => {
    const unique = [...new Set(submissions.value.map((s) => s.assignment))]
    return unique
})

const classSelectOptions = computed(() => [
    { value: 'all', label: 'All Classes' },
    ...activeClasses.value.map((c) => ({ value: c.id, label: c.name })),
])

const assignmentSelectOptions = computed(() => [
    { value: 'all', label: 'All Assignments' },
    ...assignmentOptions.value.map((a) => ({ value: a, label: a })),
])

const filteredSubmissions = computed(() => {
    let result = submissions.value
    if (selectedClassId.value !== 'all') {
        result = result.filter((s) => s.classId === selectedClassId.value)
    }
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        result = result.filter((s) => s.studentName.toLowerCase().includes(query))
    }
    if (selectedAssignment.value !== 'all') {
        result = result.filter((s) => s.assignment === selectedAssignment.value)
    }
    return result
})

const totalPages = computed(() => Math.ceil(filteredSubmissions.value.length / itemsPerPage.value))

const paginatedSubmissions = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value
    return filteredSubmissions.value.slice(start, start + itemsPerPage.value)
})

watch([selectedClassId, selectedAssignment, searchQuery], () => {
    currentPage.value = 1
})

function goToPage(page: number) {
    if (page >= 1 && page <= totalPages.value) currentPage.value = page
}

function formatDate(date: string) {
    return $dayjs(date).format('MMM D, h:mm A')
}

function getStatusVariant(status: string) {
    return status === 'graded' ? 'default' : 'secondary'
}

function getStatusLabel(status: string) {
    return status.charAt(0).toUpperCase() + status.slice(1)
}

function getScoreColor(score: number) {
    if (score >= 70) return { bar: 'tw:bg-emerald-500', text: 'tw:text-emerald-600' }
    if (score >= 40) return { bar: 'tw:bg-amber-400', text: 'tw:text-amber-600' }
    return { bar: 'tw:bg-red-400', text: 'tw:text-red-600' }
}

function getAssignmentId(assignmentName: string) {
    const found = (assignmentsData.assignments || []).find((a) => a.name === assignmentName)
    return found ? found.id : 'unknown'
}

const showingFrom = computed(() => (currentPage.value - 1) * itemsPerPage.value + 1)
const showingTo = computed(() =>
    Math.min(currentPage.value * itemsPerPage.value, filteredSubmissions.value.length),
)
</script>

<template>
    <div>
        <!-- ── Header ── -->
        <div class="tw:flex tw:items-center tw:justify-between">
            <div>
                <h1 class="tw:text-2xl tw:font-bold tw:text-primary">Submissions</h1>
                <p class="tw:text-sm tw:text-navy-60">Review and grade student submissions</p>
            </div>
            <div
                class="tw:bg-white tw:border tw:border-slate-200 tw:rounded-md tw:px-4 tw:py-2.5 tw:text-center tw:min-w-[90px]"
            >
                <div class="tw:text-xl tw:font-bold tw:text-primary tw:leading-none">
                    {{ filteredSubmissions.length }}
                </div>
                <div class="tw:text-[11px] tw:text-slate-400 tw:mt-1">Total</div>
            </div>
        </div>

        <!-- ── Filters ── -->
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:my-4">
            <McSelect
                v-model="selectedClassId"
                :options="classSelectOptions"
                option-value="value"
                option-label="label"
                placeholder="All Classes"
                class="tw:w-44"
            />
            <McSelect
                v-model="selectedAssignment"
                :options="assignmentSelectOptions"
                option-value="value"
                option-label="label"
                placeholder="All Assignments"
                class="tw:w-48"
            />
            <div
                class="tw:flex tw:items-center tw:gap-2 tw:bg-white tw:border tw:border-slate-200 tw:rounded-md tw:px-3 tw:py-2 tw:ml-auto tw:w-full tw:max-w-xs"
            >
                <Search class="tw:w-3.5 tw:h-3.5 tw:text-slate-400 tw:flex-shrink-0" />
                <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="Search student..."
                    class="tw:outline-none tw:w-full tw:text-sm tw:text-slate-700 tw:placeholder-slate-400 tw:bg-transparent"
                />
            </div>
        </div>

        <!-- ── Table Card ── -->
        <div class="tw:bg-white tw:rounded-md tw:border tw:border-slate-200 tw:overflow-hidden">
            <McTable>
                <McTableHeader>
                    <McTableRow class="tw:bg-slate-50">
                        <McTableHead
                            class="tw:text-xs tw:font-semibold tw:text-slate-500 tw:uppercase tw:tracking-wide tw:py-3 tw:px-6"
                        >
                            Student
                        </McTableHead>
                        <McTableHead
                            class="tw:text-xs tw:font-semibold tw:text-slate-500 tw:uppercase tw:tracking-wide tw:py-3"
                        >
                            Assignment
                        </McTableHead>
                        <McTableHead
                            class="tw:text-xs tw:font-semibold tw:text-slate-500 tw:uppercase tw:tracking-wide tw:py-3"
                        >
                            Submitted
                        </McTableHead>
                        <McTableHead
                            class="tw:text-xs tw:font-semibold tw:text-slate-500 tw:uppercase tw:tracking-wide tw:py-3"
                        >
                            AI Score
                        </McTableHead>
                        <McTableHead
                            class="tw:text-xs tw:font-semibold tw:text-slate-500 tw:uppercase tw:tracking-wide tw:py-3"
                        >
                            Status
                        </McTableHead>
                        <McTableHead
                            class="tw:text-xs tw:font-semibold tw:text-slate-500 tw:uppercase tw:tracking-wide tw:py-3"
                        ></McTableHead>
                    </McTableRow>
                </McTableHeader>
                <McTableBody>
                    <McTableRow
                        v-for="submission in paginatedSubmissions"
                        :key="submission.id"
                        class="tw:border-slate-100 tw:hover:bg-slate-50/60 tw:transition-colors"
                    >
                        <!-- Student -->
                        <McTableCell class="tw:px-6 tw:py-2">
                            <div class="tw:flex tw:items-center tw:gap-2.5">
                                <div
                                    class="tw:w-8 tw:h-8 tw:rounded-full tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:flex-shrink-0"
                                >
                                    <User class="tw:w-4 tw:h-4 tw:text-primary" />
                                </div>
                                <span class="tw:text-sm tw:font-medium tw:text-slate-800">
                                    {{ submission.studentName }}
                                </span>
                            </div>
                        </McTableCell>

                        <!-- Assignment -->
                        <McTableCell class="tw:p-3">
                            <span class="tw:text-sm tw:text-slate-600">
                                {{ submission.assignment }}
                            </span>
                        </McTableCell>

                        <!-- Submitted -->
                        <McTableCell class="tw:p-3">
                            <span class="tw:text-sm tw:text-slate-500">
                                {{ formatDate(submission.submittedAt) }}
                            </span>
                        </McTableCell>

                        <!-- AI Score -->
                        <McTableCell class="tw:p-3">
                            <div class="tw:flex tw:items-center tw:gap-2.5">
                                <div
                                    class="tw:w-14 tw:h-1.5 tw:bg-slate-100 tw:rounded-md tw:overflow-hidden tw:flex-shrink-0"
                                >
                                    <div
                                        class="tw:h-full tw:rounded-md tw:transition-all"
                                        :class="getScoreColor(submission.quality).bar"
                                        :style="{ width: `${submission.quality}%` }"
                                    />
                                </div>
                                <span
                                    class="tw:text-xs tw:font-semibold tw:tabular-nums"
                                    :class="getScoreColor(submission.quality).text"
                                >
                                    {{ submission.quality }}
                                </span>
                            </div>
                        </McTableCell>

                        <!-- Status -->
                        <McTableCell class="tw:p-3">
                            <McBadge
                                :variant="getStatusVariant(submission.status)"
                                class="tw:capitalize tw:w-20 tw:text-center"
                            >
                                {{ getStatusLabel(submission.status) }}
                            </McBadge>
                        </McTableCell>

                        <!-- Action -->
                        <McTableCell class="tw:p-3">
                            <NuxtLink
                                :to="`/submissions/${getAssignmentId(submission.assignment)}/${submission.id}`"
                            >
                                <McButton
                                    variant="outline"
                                    size="sm"
                                    class="tw:text-xs tw:h-7 tw:border-slate-200 tw:text-primary tw:hover:bg-primary/5 tw:hover:border-primary/30"
                                >
                                    Review
                                </McButton>
                            </NuxtLink>
                        </McTableCell>
                    </McTableRow>

                    <!-- Empty state -->
                    <McTableRow v-if="paginatedSubmissions.length === 0">
                        <McTableCell colspan="6" class="tw:py-16 tw:text-center">
                            <div class="tw:flex tw:flex-col tw:items-center tw:gap-2">
                                <div
                                    class="tw:w-10 tw:h-10 tw:rounded-full tw:bg-slate-100 tw:flex tw:items-center tw:justify-center"
                                >
                                    <Search class="tw:w-5 tw:h-5 tw:text-slate-400" />
                                </div>
                                <p class="tw:text-sm tw:font-medium tw:text-slate-500">
                                    No submissions found
                                </p>
                                <p class="tw:text-xs tw:text-slate-400">
                                    Try adjusting your filters
                                </p>
                            </div>
                        </McTableCell>
                    </McTableRow>
                </McTableBody>
            </McTable>

            <!-- ── Pagination ── -->
            <div
                class="tw:flex tw:items-center tw:justify-between tw:px-4 tw:py-3 tw:border-t tw:border-slate-100 tw:bg-slate-50/50"
            >
                <span class="tw:text-xs tw:text-slate-400">
                    Showing {{ showingFrom }}–{{ showingTo }} of {{ filteredSubmissions.length }}
                </span>

                <div class="tw:flex tw:items-center tw:gap-1">
                    <button
                        class="tw:flex tw:items-center tw:justify-center tw:w-7 tw:h-7 tw:rounded-md tw:border tw:border-slate-200 tw:bg-white tw:text-slate-500 tw:transition-all tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:hover:enabled:border-primary/40 tw:hover:enabled:text-primary"
                        :disabled="currentPage === 1"
                        @click="goToPage(currentPage - 1)"
                    >
                        <ChevronLeft class="tw:w-3.5 tw:h-3.5" />
                    </button>

                    <template v-for="page in totalPages" :key="page">
                        <button
                            v-if="
                                page === 1 ||
                                page === totalPages ||
                                (page >= currentPage - 1 && page <= currentPage + 1)
                            "
                            class="tw:flex tw:items-center tw:justify-center tw:w-7 tw:h-7 tw:rounded-md tw:border tw:text-xs tw:font-medium tw:transition-all"
                            :class="
                                page === currentPage
                                    ? 'tw:bg-primary tw:border-primary tw:text-white'
                                    : 'tw:bg-white tw:border-slate-200 tw:text-slate-600 tw:hover:border-primary/40 tw:hover:text-primary'
                            "
                            @click="goToPage(page)"
                        >
                            {{ page }}
                        </button>
                        <span
                            v-else-if="page === currentPage - 2 || page === currentPage + 2"
                            class="tw:w-7 tw:text-center tw:text-xs tw:text-slate-400"
                        >
                            …
                        </span>
                    </template>

                    <button
                        class="tw:flex tw:items-center tw:justify-center tw:w-7 tw:h-7 tw:rounded-md tw:border tw:border-slate-200 tw:bg-white tw:text-slate-500 tw:transition-all tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:hover:enabled:border-primary/40 tw:hover:enabled:text-primary"
                        :disabled="currentPage === totalPages"
                        @click="goToPage(currentPage + 1)"
                    >
                        <ChevronRight class="tw:w-3.5 tw:h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
