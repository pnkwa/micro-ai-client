<script setup lang="ts">
import {
    ArrowLeft,
    FileText,
    Calendar,
    ClipboardList,
    Paperclip,
    Trophy,
    Search,
    User,
    Send,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { ColumnDef, PaginationState } from '@tanstack/vue-table'
import { assignmentService, type Assignment } from '~/services/assignmentService'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import { classService, type ClassItem } from '~/services/classService'
import { getStatusVariant } from '~/core/helpers/variants'

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()
const authStore = useAuth()

const classId = computed(() => Number(route.params.id))
const assignmentId = computed(() => Number(route.params.assignmentId))

const assignment = ref<Assignment | null>(null)
const classItem = ref<ClassItem | null>(null)
const submissions = ref<SubmissionView[]>([])
const isLoadingAssignment = ref(false)
const isLoadingSubmissions = ref(false)

const loadAssignment = async () => {
    isLoadingAssignment.value = true
    try {
        assignment.value = await assignmentService.getById(assignmentId.value)
    } catch {
        toast.error('Failed to load assignment')
    } finally {
        isLoadingAssignment.value = false
    }
}

const loadClass = async () => {
    try {
        classItem.value = await classService.getById(classId.value)
    } catch {
        // breadcrumb fallback only — non-critical
    }
}

const loadSubmissions = async () => {
    isLoadingSubmissions.value = true
    try {
        submissions.value = await submissionService.listByAssignment(assignmentId.value)
    } catch {
        toast.error('Failed to load submissions')
    } finally {
        isLoadingSubmissions.value = false
    }
}

await Promise.all([loadAssignment(), loadClass()])

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([
    { label: 'Classes', to: '/classes' },
    { label: classItem.value?.name ?? 'Class', to: `/classes/${classId.value}` },
    { label: assignment.value?.name ?? 'Assignment' },
])

const isStudent = computed(() => authStore.user?.user_type === 'student' || !authStore.user)

const activeTab = ref<'detail' | 'submissions'>('detail')
const isSubmitDialogOpen = ref(false)
const searchQuery = ref('')
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 10 })

const onTabChange = async (tab: 'detail' | 'submissions') => {
    activeTab.value = tab
    if (tab === 'submissions' && submissions.value.length === 0) {
        await loadSubmissions()
    }
}

const studentFullName = (s: SubmissionView) =>
    s.student ? `${s.student.user.firstname} ${s.student.user.lastname}` : s.student_id

const filteredSubmissions = computed(() => {
    if (!searchQuery.value) return submissions.value
    const q = searchQuery.value.toLowerCase()
    return submissions.value.filter((s) => studentFullName(s).toLowerCase().includes(q))
})

watch(searchQuery, () => {
    pagination.value = { ...pagination.value, pageIndex: 0 }
})

const submissionScore = (s: SubmissionView): number | null => {
    if (s.score === null || s.score === undefined) return null
    const points = assignment.value?.points
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

const formatDate = (date: string) => $dayjs(date).format('MMM D, YYYY')
const formatDateTime = (date: string) => $dayjs(date).format('MMM D, h:mm A')

function getScoreColor(score: number) {
    if (score >= 70) return { bar: 'tw:bg-emerald-500', text: 'tw:text-emerald-600' }
    if (score >= 40) return { bar: 'tw:bg-amber-400', text: 'tw:text-amber-600' }
    return { bar: 'tw:bg-red-400', text: 'tw:text-red-600' }
}
</script>

<template>
    <div>
        <div
            v-if="isLoadingAssignment"
            class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60"
        >
            Loading…
        </div>

        <template v-else-if="assignment">
            <!-- Header -->
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-6">
                <div class="tw:flex tw:items-center tw:gap-3">
                    <button
                        class="tw:flex tw:items-center tw:gap-1.5 tw:text-navy-60 tw:hover:text-primary tw:transition-colors"
                        @click="router.push(`/classes/${classId}`)"
                    >
                        <ArrowLeft class="tw:w-4 tw:h-4" />
                    </button>
                    <div class="tw:flex tw:items-center tw:gap-3">
                        <div
                            class="tw:w-10 tw:h-10 tw:flex tw:items-center tw:justify-center tw:bg-primary/10 tw:rounded-lg"
                        >
                            <FileText class="tw:w-5 tw:h-5 tw:text-primary" />
                        </div>
                        <div>
                            <h1 class="tw:text-xl tw:font-bold tw:text-primary tw:leading-tight">
                                {{ assignment.name }}
                            </h1>
                            <p class="tw:text-xs tw:text-navy-60">
                                Due {{ formatDate(assignment.due_date) }}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="tw:flex tw:items-center tw:gap-2">
                    <McBadge :variant="assignment.status === 'active' ? 'default' : 'outline'">
                        {{ assignment.status === 'active' ? 'Active' : 'Closed' }}
                    </McBadge>
                    <McButton
                        v-if="assignment.status === 'active' && isStudent"
                        @click="isSubmitDialogOpen = true"
                    >
                        <Send class="tw:w-4 tw:h-4 tw:mr-1" />
                        Submit
                    </McButton>
                </div>
            </div>

            <!-- Tabs -->
            <div class="tw:flex tw:border-b tw:border-navy-10 tw:mb-6">
                <button
                    v-for="tab in [
                        { value: 'detail', label: 'Detail' },
                        {
                            value: 'submissions',
                            label: `Submissions (${submissions.length})`,
                        },
                    ]"
                    :key="tab.value"
                    class="tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:border-b-2 tw:-mb-px tw:transition-colors"
                    :class="
                        activeTab === tab.value
                            ? 'tw:border-primary tw:text-primary'
                            : 'tw:border-transparent tw:text-navy-60 tw:hover:text-navy-100'
                    "
                    @click="onTabChange(tab.value as 'detail' | 'submissions')"
                >
                    {{ tab.label }}
                </button>
            </div>

            <!-- Detail Tab -->
            <template v-if="activeTab === 'detail'">
                <div class="tw:grid tw:grid-cols-2 tw:gap-4 tw:mb-4">
                    <div
                        class="tw:flex tw:items-center tw:gap-4 tw:p-4 tw:bg-white tw:rounded-md tw:border tw:border-gray-200"
                    >
                        <Calendar class="tw:w-5 tw:h-5 tw:text-navy-60" />
                        <div>
                            <p class="tw:text-sm tw:text-navy-60">Due Date</p>
                            <p class="tw:text-base tw:font-medium">
                                {{ formatDate(assignment.due_date) }}
                            </p>
                        </div>
                    </div>
                    <div
                        v-if="assignment.points"
                        class="tw:flex tw:items-center tw:gap-4 tw:p-4 tw:bg-white tw:rounded-md tw:border tw:border-gray-200"
                    >
                        <Trophy class="tw:w-5 tw:h-5 tw:text-navy-60" />
                        <div>
                            <p class="tw:text-sm tw:text-navy-60">Points</p>
                            <p class="tw:text-base tw:font-medium">{{ assignment.points }} pts</p>
                        </div>
                    </div>
                </div>

                <div
                    v-if="assignment.description"
                    class="tw:bg-white tw:rounded-md tw:border tw:border-gray-200 tw:p-6 tw:mb-4"
                >
                    <h2 class="tw:text-base tw:font-semibold tw:text-navy-100 tw:mb-3">
                        Description
                    </h2>
                    <p class="tw:text-sm tw:leading-relaxed tw:text-navy-80">
                        {{ assignment.description }}
                    </p>
                </div>

                <div
                    v-if="assignment.instructions"
                    class="tw:bg-white tw:rounded-md tw:border tw:border-gray-200 tw:p-6 tw:mb-4"
                >
                    <h2
                        class="tw:flex tw:items-center tw:gap-2 tw:text-base tw:font-semibold tw:text-navy-100 tw:mb-3"
                    >
                        <ClipboardList class="tw:w-5 tw:h-5" />
                        Instructions
                    </h2>
                    <div class="tw:text-sm tw:leading-loose tw:text-navy-80">
                        <p
                            v-for="(line, i) in assignment.instructions.split('\n')"
                            :key="i"
                            class="tw:mb-1 last:tw:mb-0"
                        >
                            {{ line }}
                        </p>
                    </div>
                </div>

                <div
                    v-if="assignment.attachments.length > 0"
                    class="tw:bg-white tw:rounded-md tw:border tw:border-gray-200 tw:p-6"
                >
                    <h2
                        class="tw:flex tw:items-center tw:gap-2 tw:text-base tw:font-semibold tw:text-navy-100 tw:mb-3"
                    >
                        <Paperclip class="tw:w-5 tw:h-5" />
                        Attachments
                    </h2>
                    <div class="tw:flex tw:flex-col tw:gap-2">
                        <a
                            v-for="att in assignment.attachments"
                            :key="att.id"
                            :href="att.path"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="tw:flex tw:items-center tw:gap-2 tw:p-2 tw:bg-gray-50 tw:rounded-md tw:hover:bg-gray-100"
                        >
                            <FileText class="tw:w-4 tw:h-4 tw:text-primary" />
                            <span class="tw:text-sm">{{ att.filename }}</span>
                        </a>
                    </div>
                </div>
            </template>

            <!-- Submissions Tab -->
            <template v-else>
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
                        />
                    </div>
                </div>

                <div
                    v-if="isLoadingSubmissions"
                    class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60"
                >
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
                                            :class="
                                                getScoreColor(submissionScore(row.original)!).bar
                                            "
                                            :style="{
                                                width: `${submissionScore(row.original)}%`,
                                            }"
                                        />
                                    </div>
                                    <span
                                        class="tw:text-xs tw:font-semibold tw:tabular-nums"
                                        :class="
                                            getScoreColor(submissionScore(row.original)!).text
                                        "
                                    >
                                        {{ submissionScore(row.original) }}%
                                    </span>
                                </template>
                                <span v-else class="tw:text-xs tw:text-navy-40">—</span>
                            </div>
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
                                :to="`/classes/${classId}/assignments/${assignmentId}/submissions/${row.original.id}`"
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
        </template>

        <div v-else class="tw:text-center tw:py-16 tw:text-navy-60">Assignment not found.</div>

        <!-- Submit dialog placeholder — wired in Phase 4 (submissions) -->
        <McDialog v-model:open="isSubmitDialogOpen">
            <McDialogContent class="tw:sm:max-w-xl">
                <div class="tw:p-6 tw:text-center tw:text-navy-60 tw:text-sm">
                    Submit assignment — coming soon
                </div>
            </McDialogContent>
        </McDialog>
    </div>
</template>
