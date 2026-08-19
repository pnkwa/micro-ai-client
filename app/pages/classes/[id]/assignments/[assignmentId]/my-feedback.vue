<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { submissionService } from '~/services/submissionService'
import { submissionBadges } from '~/core/helpers/studentAssignmentStatus'
import { useSubmissionDetail } from '~/core/composables/useSubmissionDetail'

// The student's own result. No submission id in the URL: they shouldn't have to know it,
// and looking it up from their own list means this route can only ever resolve to their
// own work. The API enforces that independently (getOne 403s on someone else's).
definePageMeta({ role: 'student' })

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()

const classId = computed(() => Number(route.params.id))
const assignmentId = computed(() => Number(route.params.assignmentId))
const submissionId = ref(0)

const {
    submission,
    isLoading,
    loadFailed,
    answerGroups,
    exerciseTitles,
    imageUrls,
    totalPoints,
    load,
} = useSubmissionDetail(submissionId, assignmentId)

const notSubmitted = ref(false)

// The student list endpoint ignores the assignment_id filter, so match on assignment_id
// here rather than trusting a non-empty list (same caveat as StudentExerciseForm).
const mine = await submissionService
    .listByAssignment(assignmentId.value)
    .then((all) => all.find((s) => s.assignment_id === assignmentId.value) ?? null)
    .catch(() => null)

if (mine) {
    submissionId.value = mine.id
    await load()
} else {
    notSubmitted.value = true
}

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs(() => [
    { label: 'Classes', to: '/classes' },
    {
        label: submission.value?.assignment?.class?.name ?? 'Class',
        to: `/classes/${classId.value}`,
    },
    {
        label: submission.value?.assignment?.name ?? 'Assignment',
        to: `/classes/${classId.value}/assignments/${assignmentId.value}`,
    },
    { label: 'My feedback' },
])

const isGraded = computed(() => submission.value?.status === 'graded')
const isRejected = computed(() => submission.value?.status === 'rejected')
// An exam and an assignment are the same read but different pages, and this button is the whole
// recovery path out of a rejection (BE-ADR-019: re-submitting is the only way out), so it has to
// land on the form the student can actually answer. The detail read carries is_exam.
const resubmitPath = computed(() =>
    submission.value?.assignment?.is_exam
        ? `/classes/${classId.value}/exams/${assignmentId.value}`
        : `/classes/${classId.value}/assignments/${assignmentId.value}`,
)
const statusBadges = computed(() =>
    submission.value
        ? submissionBadges(submission.value, submission.value.assignment?.due_date)
        : [],
)
const formatDateTime = (date: string) => $dayjs(date).format('MMM D, YYYY HH:mm')
</script>

<template>
    <div class="tw:mx-auto tw:flex tw:w-full tw:max-w-3xl tw:flex-col tw:gap-4">
        <button
            class="tw:flex tw:items-center tw:gap-1.5 tw:text-navy-60 tw:hover:text-primary tw:transition-colors tw:text-sm tw:self-start"
            @click="router.push(`/classes/${classId}/assignments/${assignmentId}`)"
        >
            <ArrowLeft class="tw:w-4 tw:h-4" />
            Back to assignment
        </button>

        <div v-if="isLoading" class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60">
            Loading…
        </div>

        <div v-else-if="notSubmitted" class="tw:text-center tw:py-16 tw:text-navy-60">
            You haven't submitted this assignment yet.
        </div>

        <div v-else-if="loadFailed || !submission" class="tw:text-center tw:py-16 tw:text-navy-60">
            We couldn't load your feedback. Try again in a moment.
        </div>

        <template v-else>
            <div
                class="tw:flex tw:items-center tw:justify-between tw:bg-white tw:border tw:border-navy-10 tw:rounded-xl tw:px-6 tw:py-5"
            >
                <div>
                    <div class="tw:flex tw:items-center tw:gap-2">
                        <span class="tw:font-semibold tw:text-navy-100">
                            {{ submission.assignment?.name }}
                        </span>
                        <McBadge v-for="b in statusBadges" :key="b.label" :variant="b.variant">
                            {{ b.label }}
                        </McBadge>
                    </div>
                    <p class="tw:text-xs tw:text-navy-50 tw:mt-0.5">
                        Submitted {{ formatDateTime(submission.submitted_at) }}
                    </p>
                </div>
                <div v-if="isGraded" class="tw:text-right">
                    <span class="tw:text-lg tw:font-bold tw:text-primary">
                        {{ submission.score ?? 0 }} / {{ totalPoints }}
                    </span>
                    <p class="tw:text-[11px] tw:text-navy-40">final score</p>
                </div>
            </div>

            <!-- Returned to redo: the work wasn't graded, it was handed back. Lead with the
                 reason and point at resubmitting, rather than the neutral "not graded" note. -->
            <div
                v-if="isRejected"
                class="tw:bg-danger/5 tw:border tw:border-danger/30 tw:rounded-xl tw:px-6 tw:py-5"
            >
                <p class="tw:font-semibold tw:text-danger">Returned — please resubmit</p>
                <p class="tw:text-sm tw:text-navy-70 tw:mt-1">
                    Your instructor returned this submission without grading it:
                </p>
                <p
                    v-if="submission.rejection_reason"
                    class="tw:text-sm tw:text-navy-90 tw:mt-2 tw:whitespace-pre-line tw:border-l-2 tw:border-danger/40 tw:pl-3"
                >
                    {{ submission.rejection_reason }}
                </p>
                <McButton class="tw:mt-4" @click="router.push(resubmitPath)">
                    {{
                        submission.assignment?.is_exam
                            ? 'Go to exam to resubmit'
                            : 'Go to assignment to resubmit'
                    }}
                </McButton>
            </div>

            <!-- Reachable before grading if the student keeps the URL, so say so plainly
                 rather than showing a page of blank marks. -->
            <div
                v-else-if="!isGraded"
                class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-xl tw:py-12 tw:text-center"
            >
                <p class="tw:font-semibold tw:text-navy-100">Not graded yet</p>
                <p class="tw:text-sm tw:text-navy-60 tw:mt-1">
                    Your score and your instructor's feedback appear here once your work has been
                    graded.
                </p>
            </div>

            <template v-else>
                <template v-for="group in answerGroups" :key="group.exerciseId">
                    <div class="tw:flex tw:items-center tw:gap-2.5">
                        <span
                            class="tw:flex tw:size-6 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary/10 tw:text-xs tw:font-semibold tw:text-primary"
                        >
                            {{ group.exIndex + 1 }}
                        </span>
                        <span class="tw:text-sm tw:font-semibold tw:text-navy-90">
                            {{
                                exerciseTitles[group.exerciseId] ?? `Exercise ${group.exIndex + 1}`
                            }}
                        </span>
                        <div class="tw:h-px tw:flex-1 tw:bg-navy-10"></div>
                    </div>

                    <!-- No slots: the card's defaults ARE the student's view. Nothing here can
                     expose a marking control or the answer key. -->
                    <McSubmissionAnswerCard
                        v-for="{ answer, qIndex } in group.items"
                        :key="answer.question_id"
                        :answer="answer"
                        :label="`${group.exIndex + 1}.${qIndex + 1}`"
                        :image-url="imageUrls[answer.question_id]"
                        :tint-class="
                            answer.is_correct === true
                                ? 'tw:border-success/40 tw:bg-success/5'
                                : answer.is_correct === false
                                  ? 'tw:border-danger/40 tw:bg-danger/5'
                                  : 'tw:border-navy-15 tw:bg-navy-10/20'
                        "
                    />
                </template>
            </template>
        </template>
    </div>
</template>
