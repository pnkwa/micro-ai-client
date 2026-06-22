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
import type { ColumnDef, PaginationState } from '@tanstack/vue-table'
import assignmentsData from '~/data/assignments.json'
import submissionsData from '~/data/submissions.json'
import classesData from '~/data/classes.json'
import SubmitAssignment from '~/features/components/forms/SubmitAssignment.vue'
import type { SubmitAssignmentFormData } from '~/features/types/forms/submit-assignment'
import { getStatusVariant } from '~/core/helpers/variants'

interface AssignmentItem {
    id: number
    name: string
    dueDate: string
    classId: number
    submissions: number
    status: 'active' | 'closed'
    description?: string
    instructions?: string
    points?: number
    attachments?: string[]
}

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

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()
const authStore = useAuth()

const classId = computed(() => Number(route.params.id))
const assignmentId = computed(() => Number(route.params.assignmentId))

const assignment = computed(() =>
    (assignmentsData.assignments as AssignmentItem[]).find((a) => a.id === assignmentId.value),
)

const classItem = computed(() =>
    (classesData.classes as { id: number; name: string }[]).find((c) => c.id === classId.value),
)

const breadcrumb = useBreadcrumb()

breadcrumb.setBreadcrumbs([
    { label: 'Classes', to: '/classes' },
    { label: classItem.value?.name ?? 'Class', to: `/classes/${classId.value}` },
    { label: assignment.value?.name ?? 'Assignment' },
])

const isStudent = computed(() => authStore.user?.role === 'student' || !authStore.user)

const activeTab = ref<'detail' | 'submissions'>('detail')
const isSubmitDialogOpen = ref(false)
const searchQuery = ref('')
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 10 })

const allSubmissions = ref<SubmissionItem[]>(submissionsData.submissions as SubmissionItem[])

const filteredSubmissions = computed(() => {
    let result = allSubmissions.value.filter(
        (s) => s.classId === classId.value && s.assignment === assignment.value?.name,
    )
    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        result = result.filter((s) => s.studentName.toLowerCase().includes(q))
    }
    return result
})

watch(searchQuery, () => {
    pagination.value = { ...pagination.value, pageIndex: 0 }
})

const columns: ColumnDef<SubmissionItem>[] = [
    { accessorKey: 'studentName', header: 'Student' },
    { accessorKey: 'submittedAt', header: 'Submitted' },
    { accessorKey: 'quality', header: () => h('div', { class: 'tw:text-center' }, 'AI Score') },
    { accessorKey: 'status', header: () => h('div', { class: 'tw:text-center' }, 'Status') },
    { accessorKey: 'actions', header: () => h('div', { class: 'tw:text-center' }, 'Actions') },
]

const handleSubmit = (values: SubmitAssignmentFormData & { assignmentFile?: File | null }) => {
    allSubmissions.value.push({
        id: allSubmissions.value.length + 1,
        studentName: values.studentName,
        studentInitials: values.studentName
            .split(' ')
            .map((n: string) => n[0])
            .join(''),
        assignment: assignment.value?.name ?? '',
        classId: values.classId,
        submittedAt: new Date().toISOString(),
        quality: 0,
        status: 'submitted',
    })
    isSubmitDialogOpen.value = false
}

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
        <template v-if="assignment">
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
                                Due {{ formatDate(assignment.dueDate) }}
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
                            label: `Submissions (${filteredSubmissions.length})`,
                        },
                    ]"
                    :key="tab.value"
                    class="tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:border-b-2 tw:-mb-px tw:transition-colors"
                    :class="
                        activeTab === tab.value
                            ? 'tw:border-primary tw:text-primary'
                            : 'tw:border-transparent tw:text-navy-60 tw:hover:text-navy-100'
                    "
                    @click="activeTab = tab.value as 'detail' | 'submissions'"
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
                                {{ formatDate(assignment.dueDate) }}
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
                    v-if="assignment.attachments && assignment.attachments.length > 0"
                    class="tw:bg-white tw:rounded-md tw:border tw:border-gray-200 tw:p-6"
                >
                    <h2
                        class="tw:flex tw:items-center tw:gap-2 tw:text-base tw:font-semibold tw:text-navy-100 tw:mb-3"
                    >
                        <Paperclip class="tw:w-5 tw:h-5" />
                        Attachments
                    </h2>
                    <div class="tw:flex tw:flex-col tw:gap-2">
                        <div
                            v-for="file in assignment.attachments"
                            :key="file"
                            class="tw:flex tw:items-center tw:gap-2 tw:p-2 tw:bg-gray-50 tw:rounded-md tw:cursor-pointer tw:hover:bg-gray-100"
                        >
                            <FileText class="tw:w-4 tw:h-4 tw:text-primary" />
                            <span class="tw:text-sm">{{ file }}</span>
                        </div>
                    </div>
                </div>
            </template>

            <!-- Submissions Tab -->
            <template v-else>
                <!-- Search -->
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

                <div class="tw:bg-white tw:p-6 tw:border tw:border-navy-10 tw:rounded-md">
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
                                <span class="tw:text-sm tw:font-medium tw:text-navy-100">
                                    {{ row.original.studentName }}
                                </span>
                            </div>
                        </template>

                        <template #body-submittedAt="{ row }">
                            <span class="tw:text-sm tw:text-slate-500">
                                {{ formatDateTime(row.original.submittedAt) }}
                            </span>
                        </template>

                        <template #body-quality="{ row }">
                            <div class="tw:flex tw:items-center tw:justify-center tw:gap-2.5">
                                <div
                                    class="tw:w-14 tw:h-1.5 tw:bg-slate-100 tw:rounded-md tw:overflow-hidden tw:shrink-0"
                                >
                                    <div
                                        class="tw:h-full tw:rounded-md tw:transition-all"
                                        :class="getScoreColor(row.original.quality).bar"
                                        :style="{ width: `${row.original.quality}%` }"
                                    />
                                </div>
                                <span
                                    class="tw:text-xs tw:font-semibold tw:tabular-nums"
                                    :class="getScoreColor(row.original.quality).text"
                                >
                                    {{ row.original.quality }}
                                </span>
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

        <McDialog v-model:open="isSubmitDialogOpen">
            <McDialogContent class="tw:sm:max-w-xl">
                <SubmitAssignment @save="handleSubmit" @cancel="isSubmitDialogOpen = false" />
            </McDialogContent>
        </McDialog>
    </div>
</template>
