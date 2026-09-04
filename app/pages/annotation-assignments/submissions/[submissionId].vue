<script setup lang="ts">
import { toast } from 'vue-sonner'
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, PanelLeft, Shapes, Undo2 } from '@lucide/vue'
import {
    annotationAssignmentService,
    type AnnotationAssignment,
    type AnnotationSubmission,
    type SubmissionField,
} from '~/services/annotationAssignmentService'
import { classService } from '~/services/classService'
import { imageService } from '~/services/imageService'
import { annotationLabelService } from '~/services/annotationLabelService'
import { apiErrorMessage } from '~/core/helpers/error'
import ReviewCanvas from '~/features/components/annotation/ReviewCanvas.vue'
import ReviewQueue from '~/features/components/annotation/ReviewQueue.vue'
import ReviewPanel from '~/features/components/annotation/ReviewPanel.vue'
import AnnotatorShell from '~/features/components/annotator/AnnotatorShell.vue'
import { useAnnotatorLayout } from '~/core/composables/useAnnotatorLayout'

const route = useRoute()
const router = useRouter()
const authStore = useAuth()
const submissionId = Number(route.params.submissionId)
const isStaff = computed(() => authStore.user?.user_type === 'staff')

// Full-bleed dark workspace, like the annotator.
const APP_FILL = 'mc-app-fill'
const HIDE_BAR = 'mc-hide-app-bar'
onMounted(() => document.documentElement.classList.add(APP_FILL, HIDE_BAR))
onBeforeUnmount(() => {
    document.documentElement.classList.remove(APP_FILL, HIDE_BAR)
    for (const url of imageUrls.value.values()) URL.revokeObjectURL(url)
})

const submission = ref<AnnotationSubmission | null>(null)
const assignment = ref<AnnotationAssignment | null>(null)
const studentName = ref<string | null>(null)
const loading = ref(true)
const currentIndex = ref(0)
const showExpert = ref(false)
const imageUrls = ref<Map<number, string>>(new Map())
// Per-image remark drafts (staff), keyed by image_id and seeded from the saved review.
const remarks = ref<Record<number, string>>({})
// Per-image correct/incorrect marks for gradable prompts (staff), keyed by image_id then prompt key.
const fieldMarks = ref<Record<number, Record<string, boolean>>>({})
// Overall feedback draft, kept apart from `submission` so an approve/flag (which replaces
// `submission` with the server's copy) doesn't wipe what the instructor is still typing.
const feedbackDraft = ref('')
const savingField = ref(false)
const finalizing = ref(false)
const rejecting = ref(false)
const rejectOpen = ref(false)
const rejectReason = ref('')

// ---- responsive layout (tablet), the same shell /image-annotator uses ----
// Read-only, so no bottom bars: `stacked` just moves the queue and the detail panel into sheets and
// swaps to the compact header. The queue never collapses (leftOpen stays true) so the shell never
// enters focus mode.
const { layout } = useAnnotatorLayout()
const leftOpen = ref(true)
const rightOpen = ref(true)
const queueSheetOpen = ref(false)
const panelSheetOpen = ref(false)

// Review is numbered over the ALBUM images (the same order and count the student saw), not over
// submission.fields the server returns fields only for images the student addressed, so a pending
// image earlier in the album would otherwise shift every later "Image NN" out of step with the
// student's view (and show a different photo). Each album image carries its field when worked.
interface ReviewItem {
    index: number
    imageId: number
    field: SubmissionField | null
}

const fieldByImageId = computed(() => {
    const map = new Map<number, SubmissionField>()
    for (const f of submission.value?.fields ?? []) map.set(f.image_id, f)
    return map
})
const items = computed<ReviewItem[]>(() => {
    const albumIds = (assignment.value?.images ?? []).map((img) => img.image_id)
    if (albumIds.length) {
        return albumIds.map((imageId, index) => ({
            index,
            imageId,
            field: fieldByImageId.value.get(imageId) ?? null,
        }))
    }
    // Fallback if the album list didn't come back on the read: the submitted fields in order.
    return (submission.value?.fields ?? []).map((field, index) => ({
        index,
        imageId: field.image_id,
        field,
    }))
})
const currentItem = computed<ReviewItem | null>(() => items.value[currentIndex.value] ?? null)
const current = computed<SubmissionField | null>(() => currentItem.value?.field ?? null)
const currentUrl = computed(() =>
    currentItem.value ? (imageUrls.value.get(currentItem.value.imageId) ?? null) : null,
)

// Only images the student actually worked are reviewable; pending ones have no field to judge.
const reviewable = computed(() => items.value.filter((i) => i.field))

// The reviewing instructor's own label palette (annotation_labels), label -> bare six-hex. A
// student box is coloured by its label's match here (case-insensitive); loaded on mount for staff.
const labelColors = ref<Record<string, string>>({})
const prompts = computed(() => assignment.value?.annotation.field_prompts ?? [])

// The grade the server computes (BE-ADR-039): staff see the live tally; the student sees it once
// graded. `score` is null before it exists; `points_possible` is the total it is out of.
const score = computed(() => submission.value?.score ?? null)
const pointsPossible = computed(() => submission.value?.points_possible ?? null)
const showScore = computed(() => score.value !== null && pointsPossible.value !== null)
// Trim binary-float noise from summed half-points without forcing trailing zeros.
const formatPts = (n: number) => Number(n.toFixed(2))

const reviewedCount = computed(
    () => reviewable.value.filter((i) => i.field!.review_status !== 'unreviewed').length,
)
const allReviewed = computed(
    () => reviewable.value.length > 0 && reviewedCount.value === reviewable.value.length,
)
const isGraded = computed(() => submission.value?.status === 'graded')
const isRejected = computed(() => submission.value?.status === 'rejected')

async function load() {
    try {
        const sub = await annotationAssignmentService.getSubmission(submissionId)
        submission.value = sub
        remarks.value = Object.fromEntries(sub.fields.map((f) => [f.image_id, f.remark ?? '']))
        fieldMarks.value = Object.fromEntries(
            sub.fields.map((f) => [f.image_id, { ...(f.field_marks ?? {}) }]),
        )
        feedbackDraft.value = sub.feedback ?? ''
        assignment.value = await annotationAssignmentService.getById(sub.assignment_id)
        if (isStaff.value) void resolveStudentName(assignment.value.class_id, sub.student_id)
        await loadReviewColors()
        await loadImage(0)
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Could not load this submission'))
    } finally {
        loading.value = false
    }
}

// Best-effort name from the roster; the submission itself carries only student_id.
async function resolveStudentName(classId: number, studentId: string) {
    try {
        const { data } = await classService.getStudents(classId, {})
        const row = data.find((s) => s.student_id === studentId)
        if (row) studentName.value = `${row.user.firstname} ${row.user.lastname}`.trim()
    } catch {
        /* fall back to the student_id shown beside the (missing) name */
    }
}

// Box colours in review: an assignment with a fixed label_set colours by that vocabulary (for staff
// AND the student's read-only view). A free-text assignment falls back to the reviewing instructor's
// own annotation_labels palette (staff only, owner-scoped server-side). Unmatched labels use the
// default. Keyed label -> bare six-hex.
async function loadReviewColors() {
    const set = assignment.value?.annotation.label_set ?? []
    if (set.length) {
        labelColors.value = Object.fromEntries(set.map((c) => [c.label, c.color]))
        return
    }
    if (!isStaff.value) return
    try {
        const labels = await annotationLabelService.list()
        labelColors.value = Object.fromEntries(labels.map((l) => [l.label, l.color_hex]))
    } catch {
        /* no palette / not permitted boxes fall back to the default colour */
    }
}

async function loadImage(index: number) {
    const item = items.value[index]
    if (!item || imageUrls.value.has(item.imageId)) return
    try {
        imageUrls.value.set(item.imageId, await imageService.blobUrl(item.imageId))
    } catch {
        /* the canvas falls back to "No image" */
    }
}

async function goTo(index: number) {
    if (index < 0 || index >= items.value.length) return
    currentIndex.value = index
    await loadImage(index)
}

// Verdict persists immediately with the current remark draft and field marks (mirrors "Mark
// reviewed"). approved=1, flagged=0.5, incorrect=0 toward the image's point (BE-ADR-039).
const verdictToast: Record<'approved' | 'flagged' | 'incorrect', string> = {
    approved: 'Field approved',
    flagged: 'Field flagged',
    incorrect: 'Field marked incorrect',
}
async function review(status: 'approved' | 'flagged' | 'incorrect') {
    const field = current.value
    if (!field || savingField.value) return
    savingField.value = true
    try {
        submission.value = await annotationAssignmentService.reviewField(
            submissionId,
            field.image_id,
            {
                reviewStatus: status,
                remark: remarks.value[field.image_id]?.trim() || null,
                fieldMarks: fieldMarks.value[field.image_id] ?? {},
            },
        )
        toast.success(verdictToast[status])
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Could not save the review'))
    } finally {
        savingField.value = false
    }
}

// Toggle a gradable field's correct/incorrect draft; it persists on the next verdict click, like
// the remark draft does.
function setMark(imageId: number, key: string, correct: boolean) {
    ;(fieldMarks.value[imageId] ??= {})[key] = correct
}

async function finalize() {
    if (finalizing.value) return
    finalizing.value = true
    try {
        submission.value = await annotationAssignmentService.finalize(
            submissionId,
            feedbackDraft.value.trim() || null,
        )
        toast.success('Review saved. The student can see their feedback')
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Could not finalize: is every field reviewed?'))
    } finally {
        finalizing.value = false
    }
}

async function reject() {
    if (!rejectReason.value.trim() || rejecting.value) return
    rejecting.value = true
    try {
        submission.value = await annotationAssignmentService.reject(
            submissionId,
            rejectReason.value.trim(),
        )
        rejectOpen.value = false
        rejectReason.value = ''
        toast.success('Submission returned to the student')
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Could not return the submission'))
    } finally {
        rejecting.value = false
    }
}

const statusBadge = (status: string) =>
    status === 'graded'
        ? 'tw:border-an-accent tw:text-an-accent'
        : status === 'rejected'
          ? 'tw:border-danger tw:text-danger'
          : 'tw:border-sky-500 tw:text-sky-500'

// The detail panel (ReviewPanel) writes its textareas back through these so it never mutates a prop.
const setRemark = (value: string) => {
    if (current.value) remarks.value[current.value.image_id] = value
}
const setFeedback = (value: string) => {
    feedbackDraft.value = value
}

onMounted(load)
</script>

<template>
    <AnnotatorShell v-model:left-open="leftOpen" v-model:right-open="rightOpen">
        <!-- desktop header (full, and medium-landscape) -->
        <template #header>
            <button
                class="tw:flex tw:size-8 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-500 tw:hover:bg-an-n-100"
                aria-label="Back"
                @click="router.back()"
            >
                <ArrowLeft class="tw:size-4" />
            </button>
            <!-- In medium the queue is a drawer, not a docked column, so it needs a way open. -->
            <McButton
                v-if="layout === 'medium'"
                variant="ghost"
                size="icon-sm"
                aria-label="Show the image list"
                @click="queueSheetOpen = true"
            >
                <PanelLeft class="tw:size-4" />
            </McButton>

            <template v-if="isStaff">
                <span class="tw:text-sm tw:font-semibold tw:text-an-text">
                    {{ studentName || 'Student' }}
                </span>
                <span class="tw:text-[11px] tw:text-an-faint">{{ submission?.student_id }}</span>
            </template>
            <span v-else class="tw:text-sm tw:font-semibold tw:text-an-text">
                {{ assignment?.name || 'Your submission' }}
            </span>

            <span
                v-if="submission"
                class="tw:ml-1 tw:inline-flex tw:items-center tw:rounded-full tw:border tw:px-1.5 tw:text-[11px] tw:capitalize"
                :class="statusBadge(submission.status)"
            >
                {{ submission.status }}
            </span>

            <span
                v-if="showScore"
                class="tw:ml-1 tw:inline-flex tw:items-center tw:rounded-full tw:border tw:border-an-accent tw:px-1.5 tw:text-[11px] tw:font-medium tw:tabular-nums tw:text-an-accent"
                :title="isStaff && !isGraded ? 'Running score so far' : 'Score'"
            >
                {{ formatPts(score!) }} / {{ formatPts(pointsPossible!) }}
            </span>

            <div class="tw:flex-1"></div>

            <template v-if="isStaff">
                <span class="tw:text-[13px] tw:text-an-muted">
                    <b class="tw:text-an-text">{{ reviewedCount }}</b>
                    / {{ reviewable.length }} reviewed
                </span>
                <McButton
                    v-if="!isRejected"
                    variant="outline"
                    size="sm"
                    class="tw:border-danger/40 tw:text-danger"
                    :disabled="isGraded"
                    @click="rejectOpen = true"
                >
                    <Undo2 class="tw:mr-1 tw:size-4" />
                    Return
                </McButton>
                <McButton
                    size="sm"
                    :disabled="!allReviewed || finalizing || isGraded"
                    @click="finalize"
                >
                    {{ isGraded ? 'Reviewed' : 'Save review' }}
                </McButton>
            </template>

            <McButton
                v-if="!isStaff && isRejected"
                size="sm"
                @click="
                    router.push(`/annotation-assignments/${submission?.assignment_id}/annotate`)
                "
            >
                <Undo2 class="tw:mr-1 tw:size-4" />
                Edit &amp; resubmit
            </McButton>
        </template>

        <!-- compact header (portrait tablet / phone) -->
        <template #header-compact>
            <button
                class="tw:flex tw:size-8 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-500 tw:hover:bg-an-n-100"
                aria-label="Back"
                @click="router.back()"
            >
                <ArrowLeft class="tw:size-4" />
            </button>
            <McButton
                variant="ghost"
                size="icon-sm"
                aria-label="Show the image list"
                @click="queueSheetOpen = true"
            >
                <PanelLeft class="tw:size-4" />
            </McButton>
            <div class="tw:flex tw:min-w-0 tw:flex-col">
                <span class="tw:truncate tw:text-[13px] tw:font-semibold tw:text-an-text">
                    {{ isStaff ? studentName || 'Student' : assignment?.name || 'Your submission' }}
                </span>
                <span v-if="submission" class="tw:text-[10.5px] tw:capitalize tw:text-an-faint">
                    {{ submission.status }}
                    <template v-if="showScore">
                        ({{ formatPts(score!) }}/{{ formatPts(pointsPossible!) }})
                    </template>
                </span>
            </div>
            <div class="tw:flex-1"></div>
            <McButton
                v-if="isStaff && !isRejected"
                variant="ghost"
                size="icon-sm"
                class="tw:text-danger"
                :disabled="isGraded"
                aria-label="Return to student"
                @click="rejectOpen = true"
            >
                <Undo2 class="tw:size-4" />
            </McButton>
            <McButton
                variant="ghost"
                size="icon-sm"
                aria-label="Review details"
                @click="panelSheetOpen = true"
            >
                <Shapes class="tw:size-4" />
            </McButton>
            <McButton
                v-if="isStaff"
                size="sm"
                :disabled="!allReviewed || finalizing || isGraded"
                @click="finalize"
            >
                {{ isGraded ? 'Reviewed' : 'Save' }}
            </McButton>
            <McButton
                v-else-if="isRejected"
                size="sm"
                @click="
                    router.push(`/annotation-assignments/${submission?.assignment_id}/annotate`)
                "
            >
                Edit
            </McButton>
        </template>

        <template #queue>
            <ReviewQueue :items="items" :current-index="currentIndex" @select="goTo" />
        </template>

        <template #canvas>
            <ReviewCanvas
                :key="currentItem?.imageId ?? -1"
                :src="currentUrl"
                :student-boxes="current?.annotations ?? []"
                :expert-boxes="current?.expert ?? []"
                :label-colors="labelColors"
                :show-expert="isStaff && showExpert"
            />

            <div
                v-if="loading"
                class="tw:absolute tw:inset-0 tw:z-20 tw:flex tw:items-center tw:justify-center tw:text-an-d-text"
            >
                Loading…
            </div>

            <!-- read-only badge -->
            <div
                class="tw:absolute tw:top-3 tw:left-3 tw:z-10 tw:flex tw:items-center tw:gap-1.5 tw:rounded-[10px] tw:border tw:border-white/10 tw:bg-an-overlay/95 tw:px-2.5 tw:py-1.5 tw:text-[11.5px] tw:text-an-d-text tw:backdrop-blur"
            >
                <Eye class="tw:size-3.5 tw:text-an-d-icon" />
                Reviewing (read-only)
            </div>

            <!-- show-expert toggle (staff only) -->
            <label
                v-if="isStaff"
                class="tw:absolute tw:top-3 tw:left-1/2 tw:z-10 tw:flex tw:-translate-x-1/2 tw:items-center tw:gap-2 tw:rounded-[10px] tw:border tw:border-white/10 tw:bg-an-overlay/95 tw:px-3 tw:py-1.5 tw:text-[11.5px] tw:text-an-d-strong tw:backdrop-blur"
            >
                <input v-model="showExpert" type="checkbox" class="tw:accent-an-accent" />
                Show answer key
            </label>

            <!-- pager -->
            <div
                class="tw:absolute tw:top-3 tw:right-3 tw:z-10 tw:flex tw:items-center tw:gap-1 tw:rounded-[10px] tw:border tw:border-white/10 tw:bg-an-overlay/95 tw:p-1 tw:backdrop-blur"
            >
                <button
                    class="tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded-md tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white"
                    aria-label="Previous"
                    @click="goTo(currentIndex - 1)"
                >
                    <ChevronLeft class="tw:size-3.5" />
                </button>
                <span class="tw:px-1 tw:font-mono tw:text-[12px] tw:tabular-nums tw:text-an-d-text">
                    {{ currentIndex + 1 }}/{{ items.length }}
                </span>
                <button
                    class="tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded-md tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white"
                    aria-label="Next"
                    @click="goTo(currentIndex + 1)"
                >
                    <ChevronRight class="tw:size-3.5" />
                </button>
            </div>

            <!-- legend -->
            <div
                v-if="isStaff && showExpert"
                class="tw:absolute tw:bottom-3 tw:left-3 tw:z-10 tw:flex tw:items-center tw:gap-3 tw:rounded-[10px] tw:border tw:border-white/10 tw:bg-an-overlay/95 tw:px-3 tw:py-1.5 tw:text-[11px] tw:text-an-d-text tw:backdrop-blur"
            >
                <span class="tw:flex tw:items-center tw:gap-1.5">
                    <span class="tw:w-4 tw:border-t-2 tw:border-dashed tw:border-an-accent" />
                    Answer key
                </span>
                <span class="tw:flex tw:items-center tw:gap-1.5">
                    <span class="tw:w-4 tw:border-t-2" style="border-color: #7c5ce0" />
                    Student
                </span>
            </div>
        </template>

        <!-- REVIEW / DETAIL PANEL -->
        <template #labels>
            <ReviewPanel
                :current="current"
                :prompts="prompts"
                :label-colors="labelColors"
                :is-staff="isStaff"
                :is-graded="isGraded"
                :is-rejected="isRejected"
                :saving-field="savingField"
                :remark="current ? (remarks[current.image_id] ?? '') : ''"
                :feedback="feedbackDraft"
                :submission-feedback="submission?.feedback ?? null"
                :rejection-reason="submission?.rejection_reason ?? null"
                :field-marks="current ? (fieldMarks[current.image_id] ?? {}) : {}"
                @update-remark="setRemark"
                @update-feedback="setFeedback"
                @set-mark="(key, correct) => current && setMark(current.image_id, key, correct)"
                @review="review"
            />
        </template>

        <template #sheets>
            <!-- image list, as a drawer on tablet/phone -->
            <McSheet v-model:open="queueSheetOpen">
                <McSheetContent side="left" class="tw:w-[280px] tw:p-0" hide-close>
                    <ReviewQueue
                        :items="items"
                        :current-index="currentIndex"
                        @select="
                            (i) => {
                                goTo(i)
                                queueSheetOpen = false
                            }
                        "
                    />
                </McSheetContent>
            </McSheet>

            <!-- review detail, as a drawer on tablet/phone -->
            <McSheet v-model:open="panelSheetOpen">
                <McSheetContent side="right" class="tw:flex tw:w-[340px] tw:flex-col tw:p-0">
                    <ReviewPanel
                        :current="current"
                        :prompts="prompts"
                        :label-colors="labelColors"
                        :is-staff="isStaff"
                        :is-graded="isGraded"
                        :is-rejected="isRejected"
                        :saving-field="savingField"
                        :remark="current ? (remarks[current.image_id] ?? '') : ''"
                        :feedback="feedbackDraft"
                        :submission-feedback="submission?.feedback ?? null"
                        :rejection-reason="submission?.rejection_reason ?? null"
                        :field-marks="current ? (fieldMarks[current.image_id] ?? {}) : {}"
                        @update-remark="setRemark"
                        @update-feedback="setFeedback"
                        @set-mark="
                            (key, correct) => current && setMark(current.image_id, key, correct)
                        "
                        @review="review"
                    />
                </McSheetContent>
            </McSheet>

            <!-- return / reject dialog -->
            <McDialog v-model:open="rejectOpen">
                <McDialogContent>
                    <McDialogHeader>
                        <McDialogTitle>Return submission to the student</McDialogTitle>
                    </McDialogHeader>
                    <div class="tw:flex tw:flex-col tw:gap-2 tw:p-1">
                        <label class="tw:text-sm tw:text-navy-70">
                            Reason (the student sees this)
                        </label>
                        <textarea
                            v-model="rejectReason"
                            rows="3"
                            placeholder="e.g. Several images are unlabelled, please complete them and resubmit."
                            class="tw:rounded-md tw:border tw:border-input tw:px-3 tw:py-2 tw:text-sm tw:outline-none tw:focus:border-primary"
                        />
                    </div>
                    <McDialogFooter>
                        <McButton variant="outline" @click="rejectOpen = false">Cancel</McButton>
                        <McButton
                            variant="destructive"
                            :disabled="!rejectReason.trim() || rejecting"
                            @click="reject"
                        >
                            Return submission
                        </McButton>
                    </McDialogFooter>
                </McDialogContent>
            </McDialog>
        </template>
    </AnnotatorShell>
</template>
