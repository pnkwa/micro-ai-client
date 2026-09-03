<script setup lang="ts">
import { toast } from 'vue-sonner'
import { ArrowLeft, Search, Shapes } from '@lucide/vue'
import {
    annotationAssignmentService,
    type AnnotationAssignment,
    type SubmissionListItem,
} from '~/services/annotationAssignmentService'
import { classService } from '~/services/classService'
import { apiErrorMessage } from '~/core/helpers/error'

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()
const assignmentId = Number(route.params.id)

const assignment = ref<AnnotationAssignment | null>(null)
const rows = ref<SubmissionListItem[]>([])
const names = ref<Map<string, string>>(new Map())
const loading = ref(true)
const search = ref('')
const statusFilter = ref<'all' | 'submitted' | 'graded' | 'rejected'>('all')

onMounted(async () => {
    try {
        assignment.value = await annotationAssignmentService.getById(assignmentId)
        rows.value = await annotationAssignmentService.listSubmissions(assignmentId)
        // Names come from the roster; the submission list carries only student_id.
        const { data } = await classService.getStudents(assignment.value.class_id, {})
        names.value = new Map(
            data.map((s) => [s.student_id, `${s.user.firstname} ${s.user.lastname}`.trim()]),
        )
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Could not load submissions'))
    } finally {
        loading.value = false
    }
})

const nameOf = (studentId: string) => names.value.get(studentId) || studentId

const visible = computed(() => {
    const q = search.value.trim().toLowerCase()
    return rows.value.filter((r) => {
        if (statusFilter.value !== 'all' && r.status !== statusFilter.value) return false
        if (!q) return true
        return nameOf(r.student_id).toLowerCase().includes(q) || r.student_id.includes(q)
    })
})

const statusBadge = (status: string) =>
    status === 'graded'
        ? 'tw:border-primary tw:text-primary'
        : status === 'rejected'
          ? 'tw:border-danger tw:text-danger'
          : 'tw:border-sky-500 tw:text-sky-500'

const openReview = (id: number) => router.push(`/annotation-assignments/submissions/${id}`)
</script>

<template>
    <div class="tw:mx-auto tw:flex tw:w-full tw:max-w-5xl tw:flex-col tw:gap-4 tw:p-4">
        <!-- header -->
        <div class="tw:flex tw:items-center tw:gap-3">
            <button
                class="tw:flex tw:size-8 tw:items-center tw:justify-center tw:rounded-md tw:border tw:border-border tw:text-navy-60 tw:hover:bg-navy-5"
                aria-label="Back"
                @click="router.back()"
            >
                <ArrowLeft class="tw:size-4" />
            </button>
            <div class="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary/10">
                <Shapes class="tw:size-5 tw:text-primary" />
            </div>
            <div>
                <h1 class="tw:text-xl tw:font-bold tw:leading-tight tw:text-primary">
                    {{ assignment?.name || 'Annotation assignment' }}
                </h1>
                <p class="tw:text-xs tw:text-navy-60">Annotation submissions</p>
            </div>
        </div>

        <!-- controls -->
        <div class="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
            <span class="tw:text-sm tw:text-navy-60">
                {{ rows.length }} submitted
            </span>
            <div class="tw:flex tw:items-center tw:gap-2">
                <select
                    v-model="statusFilter"
                    class="tw:h-8 tw:rounded-md tw:border tw:border-border tw:bg-white tw:px-2 tw:text-sm"
                >
                    <option value="all">All statuses</option>
                    <option value="submitted">Submitted</option>
                    <option value="graded">Graded</option>
                    <option value="rejected">Returned</option>
                </select>
                <div
                    class="tw:flex tw:h-8 tw:w-56 tw:items-center tw:gap-2 tw:rounded-md tw:border tw:border-navy-20 tw:bg-white tw:px-3"
                >
                    <Search class="tw:size-4 tw:text-navy-40" />
                    <input
                        v-model="search"
                        placeholder="Search student"
                        class="tw:flex-1 tw:text-sm tw:outline-none"
                    />
                </div>
            </div>
        </div>

        <!-- table -->
        <div class="tw:overflow-hidden tw:rounded-md tw:border tw:border-navy-10 tw:bg-white">
            <table class="tw:w-full tw:text-sm">
                <thead class="tw:bg-navy-5 tw:text-navy-60">
                    <tr>
                        <th class="tw:px-4 tw:py-2.5 tw:text-left tw:font-medium">Student</th>
                        <th class="tw:px-4 tw:py-2.5 tw:text-left tw:font-medium">Submitted</th>
                        <th class="tw:px-4 tw:py-2.5 tw:text-left tw:font-medium">Annotated</th>
                        <th class="tw:px-4 tw:py-2.5 tw:text-left tw:font-medium">Reviewed</th>
                        <th class="tw:px-4 tw:py-2.5 tw:text-left tw:font-medium">Status</th>
                        <th class="tw:px-4 tw:py-2.5"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading">
                        <td colspan="6" class="tw:px-4 tw:py-8 tw:text-center tw:text-navy-40">Loading…</td>
                    </tr>
                    <tr v-else-if="!visible.length">
                        <td colspan="6" class="tw:px-4 tw:py-8 tw:text-center tw:text-navy-40">
                            No submissions yet.
                        </td>
                    </tr>
                    <tr
                        v-for="r in visible"
                        :key="r.id"
                        class="tw:border-t tw:border-navy-5 tw:hover:bg-navy-5/50"
                    >
                        <td class="tw:px-4 tw:py-2.5">
                            <div class="tw:font-medium tw:text-navy-90">{{ nameOf(r.student_id) }}</div>
                            <div class="tw:font-mono tw:text-[11px] tw:text-navy-50">{{ r.student_id }}</div>
                        </td>
                        <td class="tw:px-4 tw:py-2.5 tw:text-navy-70">
                            {{ $dayjs(r.submitted_at).format('MMM D · HH:mm') }}
                        </td>
                        <td class="tw:px-4 tw:py-2.5 tw:font-mono tw:tabular-nums tw:text-navy-70">
                            {{ r.annotated }} / {{ r.total }}
                        </td>
                        <td class="tw:px-4 tw:py-2.5 tw:font-mono tw:tabular-nums tw:text-navy-70">
                            {{ r.reviewed }} / {{ r.total }}
                        </td>
                        <td class="tw:px-4 tw:py-2.5">
                            <span
                                class="tw:inline-flex tw:items-center tw:rounded-full tw:border tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium tw:capitalize"
                                :class="statusBadge(r.status)"
                            >
                                {{ r.status === 'rejected' ? 'Returned' : r.status }}
                            </span>
                        </td>
                        <td class="tw:px-4 tw:py-2.5 tw:text-right">
                            <McButton variant="outline" size="sm" @click="openReview(r.id)">
                                Review
                            </McButton>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
