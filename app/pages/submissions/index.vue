<script setup lang="ts">
import { Search, ChevronLeft, ChevronRight } from 'lucide-vue-next'

import submissionsData from '~/data/submissions.json'
import classesData from '~/data/classes.json'

interface SubmissionItem {
    id: number
    studentName: string
    studentInitials: string
    assignment: string
    classId: number
    submittedAt: string
    similarity: number
    quality: number
    status: 'pending' | 'submitted' | 'graded'
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
    const end = start + itemsPerPage.value
    return filteredSubmissions.value.slice(start, end)
})

watch([selectedClassId, selectedAssignment, searchQuery], () => {
    currentPage.value = 1
})

function goToPage(page: number) {
    if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page
    }
}

function formatDate(date: string) {
    return $dayjs(date).format('MMM D, h:mm A')
}

function getStatusVariant(status: string) {
    switch (status) {
        case 'graded':
            return 'default'
        case 'submitted':
            return 'secondary'
        case 'pending':
            return 'warning'
        default:
            return 'outline'
    }
}

function getStatusLabel(status: string) {
    return status.charAt(0).toUpperCase() + status.slice(1)
}

function getSimilarityColor(similarity: number) {
    if (similarity >= 50) return 'tw:text-red-500'
    if (similarity >= 20) return 'tw:text-amber-500'
    return 'tw:text-green-600'
}

function getQualityColor(quality: number) {
    if (quality >= 70) return 'bg-green-500'
    if (quality >= 40) return 'bg-amber-500'
    return 'bg-red-500'
}
</script>

<template>
    <div>
        <div class="submissions-header">
            <div>
                <h1 class="submissions-title">Submissions</h1>
                <p class="submissions-subtitle">Review and grade student submissions</p>
            </div>
            <div class="submissions-total">
                <span class="total-count">{{ filteredSubmissions.length }}</span>
                <span class="total-label">Total Submissions</span>
            </div>
        </div>

        <div class="tw:flex tw:items-center tw:gap-4 tw:mb-6">
            <McSelect
                v-model="selectedClassId"
                :options="classSelectOptions"
                option-value="value"
                option-label="label"
                placeholder="All Classes"
            />
            <McSelect
                v-model="selectedAssignment"
                :options="assignmentSelectOptions"
                option-value="value"
                option-label="label"
                placeholder="All Assignments"
            />
            <div class="search-input">
                <Search class="tw:w-4 tw:h-4 tw:text-gray-400" />
                <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="Search student ..."
                    class="tw:outline-none tw:w-full"
                />
            </div>
        </div>

        <div class="submissions-table">
            <McTable>
                <McTableHeader>
                    <McTableRow>
                        <McTableHead>Student</McTableHead>
                        <McTableHead>Assignment</McTableHead>
                        <McTableHead>Submitted</McTableHead>
                        <McTableHead>Similarity</McTableHead>
                        <McTableHead>Quality</McTableHead>
                        <McTableHead>Status</McTableHead>
                        <McTableHead>Action</McTableHead>
                    </McTableRow>
                </McTableHeader>
                <McTableBody>
                    <McTableRow v-for="submission in paginatedSubmissions" :key="submission.id">
                        <McTableCell>
                            <div class="student-cell">
                                <div class="student-avatar">
                                    {{ submission.studentInitials }}
                                </div>
                                <span class="student-name">{{ submission.studentName }}</span>
                            </div>
                        </McTableCell>
                        <McTableCell class="tw:text-gray-600">
                            {{ submission.assignment }}
                        </McTableCell>
                        <McTableCell class="tw:text-gray-600">
                            {{ formatDate(submission.submittedAt) }}
                        </McTableCell>
                        <McTableCell>
                            <span
                                :class="getSimilarityColor(submission.similarity)"
                                class="tw:font-medium"
                            >
                                {{ submission.similarity }}%
                            </span>
                        </McTableCell>
                        <McTableCell>
                            <div class="quality-cell">
                                <div class="quality-bar">
                                    <div
                                        class="quality-fill"
                                        :class="getQualityColor(submission.quality)"
                                        :style="{ width: `${submission.quality}%` }"
                                    />
                                </div>
                                <span class="quality-value">{{ submission.quality }}</span>
                            </div>
                        </McTableCell>
                        <McTableCell>
                            <McBadge :variant="getStatusVariant(submission.status)">
                                {{ getStatusLabel(submission.status) }}
                            </McBadge>
                        </McTableCell>
                        <McTableCell>
                            <McButton variant="link" size="sm" class="tw:text-primary">
                                Review
                            </McButton>
                        </McTableCell>
                    </McTableRow>
                </McTableBody>
            </McTable>

            <div class="pagination-container">
                <div class="pagination-info">
                    Showing {{ (currentPage - 1) * itemsPerPage + 1 }} to
                    {{ Math.min(currentPage * itemsPerPage, filteredSubmissions.length) }} of
                    {{ filteredSubmissions.length }} entries
                </div>
                <div class="pagination-controls">
                    <button
                        class="pagination-btn"
                        :disabled="currentPage === 1"
                        @click="goToPage(currentPage - 1)"
                    >
                        <ChevronLeft class="tw:w-4 tw:h-4" />
                    </button>
                    <template v-for="page in totalPages" :key="page">
                        <button
                            v-if="
                                page === 1 ||
                                page === totalPages ||
                                (page >= currentPage - 1 && page <= currentPage + 1)
                            "
                            class="pagination-btn"
                            :class="{ active: page === currentPage }"
                            @click="goToPage(page)"
                        >
                            {{ page }}
                        </button>
                        <span
                            v-else-if="page === currentPage - 2 || page === currentPage + 2"
                            class="pagination-ellipsis"
                        >
                            ...
                        </span>
                    </template>
                    <button
                        class="pagination-btn"
                        :disabled="currentPage === totalPages"
                        @click="goToPage(currentPage + 1)"
                    >
                        <ChevronRight class="tw:w-4 tw:h-4" />
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.submissions-page {
    padding: 1rem 0;
}

.submissions-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
}

.submissions-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-primary);
    margin-bottom: 0.25rem;
}

.submissions-subtitle {
    font-size: 0.875rem;
    color: var(--color-navy-60);
}

.submissions-total {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.75rem 1.5rem;
    background: var(--color-gray-50, #f9fafb);
    border-radius: 8px;
    border: 1px solid var(--color-gray-200, #e5e7eb);
}

.total-count {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-primary);
}

.total-label {
    font-size: 0.75rem;
    color: var(--color-navy-60);
}

.submissions-filters {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.search-input {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: 6px;
    background: white;
    width: 240px;

    input {
        font-size: 0.875rem;
        &::placeholder {
            color: var(--color-gray-400);
        }
    }
}

.submissions-table {
    background: white;
    border-radius: 8px;
    border: 1px solid var(--color-gray-200, #e5e7eb);
    overflow: hidden;
    width: 100%;
}

.student-cell {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.student-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-gray-200, #e5e7eb);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--color-navy-80);
}

.student-name {
    font-weight: 500;
    color: var(--color-navy-100);
}

.quality-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.quality-bar {
    width: 60px;
    height: 6px;
    background: var(--color-gray-200, #e5e7eb);
    border-radius: 3px;
    overflow: hidden;
}

.quality-fill {
    height: 100%;
    border-radius: 3px;
}

.quality-value {
    font-size: 0.8125rem;
    color: var(--color-navy-60);
}

.pagination-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-top: 1px solid var(--color-gray-200, #e5e7eb);
}

.pagination-info {
    font-size: 0.875rem;
    color: var(--color-navy-60);
}

.pagination-controls {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.pagination-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    padding: 0 0.5rem;
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: 6px;
    background: white;
    font-size: 0.875rem;
    color: var(--color-navy-80);
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
        background: var(--color-gray-50, #f9fafb);
        border-color: var(--color-gray-300);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &.active {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: white;
    }
}

.pagination-ellipsis {
    padding: 0 0.5rem;
    color: var(--color-navy-60);
}
</style>
