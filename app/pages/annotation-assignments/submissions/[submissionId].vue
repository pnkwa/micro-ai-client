<script setup lang="ts">
import { toast } from 'vue-sonner'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Eye, Flag, Undo2, X } from '@lucide/vue'
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
import { reviewBoxColor } from '~/core/helpers/annotationClasses'
import ReviewCanvas from '~/features/components/annotation/ReviewCanvas.vue'

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

// Review is numbered over the ALBUM images (the same order and count the student saw), not over
// submission.fields — the server returns fields only for images the student addressed, so a pending
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
        /* no palette / not permitted — boxes fall back to the default colour */
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
        toast.success('Review saved — the student can see their feedback')
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Could not finalize — is every field reviewed?'))
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

const reviewDotClass = (status: string) =>
    status === 'approved'
        ? 'tw:bg-success'
        : status === 'flagged'
          ? 'tw:bg-warning'
          : status === 'incorrect'
            ? 'tw:bg-danger'
            : 'tw:bg-an-n-300'

const fieldStatusLabel = (f: SubmissionField) =>
    f.status === 'skipped'
        ? 'skipped'
        : `${f.annotations.length} box${f.annotations.length === 1 ? '' : 'es'}`

const responseText = (f: SubmissionField, key: string) => {
    const v = f.responses[key]
    return v === undefined || v === null || v === '' ? '—' : String(v)
}

onMounted(load)
</script>

<template>
    <div class="tw:flex tw:h-dvh tw:flex-col tw:bg-an-chrome">
        <header
            class="tw:flex tw:h-12 tw:shrink-0 tw:items-center tw:gap-2 tw:border-b tw:border-an-border tw:bg-an-panel tw:px-2"
        >
            <button
                class="tw:flex tw:size-8 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-500 tw:hover:bg-an-n-100"
                aria-label="Back"
                @click="router.back()"
            >
                <ArrowLeft class="tw:size-4" />
            </button>

            <template v-if="isStaff">
                <span class="tw:text-sm tw:font-semibold tw:text-an-text">
                    {{ studentName || 'Student' }}
                </span>
                <span class="tw:text-[11px] tw:text-an-faint">· {{ submission?.student_id }}</span>
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
        </header>

        <div
            v-if="loading"
            class="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:text-an-faint"
        >
            Loading…
        </div>

        <div v-else class="tw:flex tw:min-h-0 tw:flex-1">
            <!-- FIELD QUEUE -->
            <aside
                class="tw:flex tw:w-[240px] tw:shrink-0 tw:flex-col tw:border-r tw:border-an-border tw:bg-an-panel"
            >
                <div class="tw:border-b tw:border-an-divider tw:p-2.5">
                    <span class="tw:text-[12.5px] tw:font-semibold tw:text-an-text">Images</span>
                    <span class="tw:ml-2 tw:font-mono tw:text-[10px] tw:text-an-faint">
                        {{ items.length }}
                    </span>
                </div>
                <ul
                    class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-px tw:overflow-y-auto tw:p-1.5"
                >
                    <li v-for="(item, i) in items" :key="item.imageId">
                        <button
                            class="tw:flex tw:h-11 tw:w-full tw:items-center tw:gap-2.5 tw:rounded-lg tw:px-2 tw:text-left"
                            :class="
                                i === currentIndex
                                    ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-an-accent'
                                    : 'tw:hover:bg-an-n-50'
                            "
                            @click="goTo(i)"
                        >
                            <span
                                class="tw:size-2 tw:shrink-0 tw:rounded-full"
                                :class="
                                    item.field
                                        ? reviewDotClass(item.field.review_status)
                                        : 'tw:bg-an-n-200'
                                "
                            />
                            <span class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
                                <span
                                    class="tw:truncate tw:font-mono tw:text-[11.5px] tw:text-an-text"
                                >
                                    Image {{ String(item.index + 1).padStart(2, '0') }}
                                </span>
                                <span class="tw:text-[10.5px] tw:text-an-faint">
                                    {{
                                        item.field ? fieldStatusLabel(item.field) : 'not attempted'
                                    }}
                                </span>
                            </span>
                        </button>
                    </li>
                </ul>
            </aside>

            <!-- READ-ONLY COMPARE CANVAS -->
            <main class="tw:relative tw:min-w-0 tw:flex-1">
                <ReviewCanvas
                    :key="currentItem?.imageId ?? -1"
                    :src="currentUrl"
                    :student-boxes="current?.annotations ?? []"
                    :expert-boxes="current?.expert ?? []"
                    :label-colors="labelColors"
                    :show-expert="isStaff && showExpert"
                />

                <!-- read-only badge -->
                <div
                    class="tw:absolute tw:top-3 tw:left-3 tw:z-10 tw:flex tw:items-center tw:gap-1.5 tw:rounded-[10px] tw:border tw:border-white/10 tw:bg-an-overlay/95 tw:px-2.5 tw:py-1.5 tw:text-[11.5px] tw:text-an-d-text tw:backdrop-blur"
                >
                    <Eye class="tw:size-3.5 tw:text-an-d-icon" />
                    Reviewing · read-only
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
                    <span
                        class="tw:px-1 tw:font-mono tw:text-[12px] tw:tabular-nums tw:text-an-d-text"
                    >
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
            </main>

            <!-- REVIEW / DETAIL PANEL -->
            <aside
                class="tw:flex tw:w-[340px] tw:shrink-0 tw:flex-col tw:gap-3 tw:overflow-y-auto tw:border-l tw:border-an-border tw:bg-an-panel tw:p-3"
            >
                <!-- student's boxes -->
                <div
                    class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-an-border tw:bg-white tw:p-3"
                >
                    <div class="tw:text-[12.5px] tw:font-semibold tw:text-an-text">
                        Student's boxes ({{ current?.annotations.length ?? 0 }})
                    </div>
                    <div
                        v-for="b in current?.annotations ?? []"
                        :key="b.id"
                        class="tw:flex tw:items-center tw:gap-2 tw:text-[12px] tw:text-an-n-700"
                    >
                        <span
                            class="tw:h-4 tw:w-[3px] tw:shrink-0 tw:rounded"
                            :style="{ background: reviewBoxColor(b.label, labelColors) }"
                        />
                        {{ b.label || 'Unlabelled' }}
                        <span class="tw:ml-auto tw:text-[10.5px] tw:text-an-faint">
                            {{ b.polygon ? 'polygon' : 'box' }}
                        </span>
                    </div>
                    <p
                        v-if="!(current?.annotations.length ?? 0)"
                        class="tw:text-[11.5px] tw:text-an-faint"
                    >
                        {{
                            !current
                                ? 'Student did not attempt this image.'
                                : current.status === 'skipped'
                                  ? 'Marked as skipped.'
                                  : 'No boxes on this image.'
                        }}
                    </p>
                </div>

                <!-- student's answers -->
                <div
                    v-if="prompts.length"
                    class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-an-border tw:bg-white tw:p-3"
                >
                    <div class="tw:text-[12.5px] tw:font-semibold tw:text-an-text">
                        Student's answers
                    </div>
                    <div
                        v-for="p in prompts"
                        :key="p.key"
                        class="tw:flex tw:items-baseline tw:gap-2 tw:text-[12px]"
                    >
                        <span class="tw:w-24 tw:shrink-0 tw:text-an-faint">{{ p.label }}</span>
                        <span class="tw:font-medium tw:text-an-n-700">
                            {{ current ? responseText(current, p.key) : '—' }}
                        </span>
                        <!-- gradable field: staff tick correct/incorrect; others see the result -->
                        <template v-if="p.gradable && current">
                            <label
                                v-if="isStaff && !isGraded && !isRejected"
                                class="tw:ml-auto tw:flex tw:shrink-0 tw:cursor-pointer tw:items-center tw:gap-1 tw:text-[11px] tw:text-an-faint"
                                title="Tick if the student's answer is correct"
                            >
                                <input
                                    type="checkbox"
                                    class="tw:accent-an-accent"
                                    :checked="!!fieldMarks[current.image_id]?.[p.key]"
                                    @change="
                                        setMark(
                                            current.image_id,
                                            p.key,
                                            ($event.target as HTMLInputElement).checked,
                                        )
                                    "
                                />
                                Correct ({{ p.points ?? 1 }} pt)
                            </label>
                            <span
                                v-else
                                class="tw:ml-auto tw:shrink-0 tw:text-[11px] tw:font-medium"
                                :class="
                                    current.field_marks?.[p.key]
                                        ? 'tw:text-success'
                                        : 'tw:text-danger'
                                "
                            >
                                {{
                                    current.field_marks?.[p.key]
                                        ? `Correct +${p.points ?? 1}`
                                        : 'Incorrect'
                                }}
                            </span>
                        </template>
                    </div>
                </div>

                <!-- staff: remark + approve/flag (only for an image the student worked) -->
                <div
                    v-if="isStaff && current"
                    class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-an-border tw:bg-white tw:p-3"
                >
                    <div class="tw:text-[12.5px] tw:font-medium tw:text-an-text">
                        Remark on this field
                    </div>
                    <textarea
                        v-if="current"
                        v-model="remarks[current.image_id]"
                        rows="4"
                        :disabled="isGraded || isRejected"
                        placeholder="What the student should notice on this image…"
                        class="tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:py-2 tw:text-sm tw:outline-none tw:focus:border-an-accent tw:disabled:opacity-60"
                    />
                    <div class="tw:flex tw:items-center tw:gap-2">
                        <McButton
                            variant="outline"
                            size="sm"
                            class="tw:border-success tw:text-success"
                            :disabled="savingField || isGraded || isRejected"
                            @click="review('approved')"
                        >
                            <Check class="tw:mr-1 tw:size-4" />
                            Approve
                        </McButton>
                        <McButton
                            variant="outline"
                            size="sm"
                            class="tw:border-warning tw:text-warning"
                            :disabled="savingField || isGraded || isRejected"
                            @click="review('flagged')"
                        >
                            <Flag class="tw:mr-1 tw:size-4" />
                            Flag
                        </McButton>
                        <McButton
                            variant="outline"
                            size="sm"
                            class="tw:border-danger tw:text-danger"
                            :disabled="savingField || isGraded || isRejected"
                            @click="review('incorrect')"
                        >
                            <X class="tw:mr-1 tw:size-4" />
                            Incorrect
                        </McButton>
                        <span
                            v-if="current && current.review_status !== 'unreviewed'"
                            class="tw:ml-auto tw:text-[11px] tw:capitalize"
                            :class="
                                current.review_status === 'approved'
                                    ? 'tw:text-success'
                                    : current.review_status === 'flagged'
                                      ? 'tw:text-warning'
                                      : 'tw:text-danger'
                            "
                        >
                            {{ current.review_status }}
                        </span>
                    </div>
                </div>

                <!-- student: read-only verdict + remark for this field -->
                <div
                    v-else-if="current && current.review_status !== 'unreviewed'"
                    class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-an-border tw:bg-white tw:p-3"
                >
                    <div class="tw:flex tw:items-center tw:gap-2 tw:text-[12.5px] tw:font-medium">
                        <span
                            :class="
                                current.review_status === 'approved'
                                    ? 'tw:text-success'
                                    : current.review_status === 'flagged'
                                      ? 'tw:text-warning'
                                      : 'tw:text-danger'
                            "
                        >
                            <component
                                :is="
                                    current.review_status === 'approved'
                                        ? Check
                                        : current.review_status === 'flagged'
                                          ? Flag
                                          : X
                                "
                                class="tw:inline tw:size-4"
                            />
                            <span class="tw:ml-1 tw:capitalize">{{ current.review_status }}</span>
                        </span>
                    </div>
                    <p v-if="current.remark" class="tw:text-[12px] tw:text-an-n-700">
                        {{ current.remark }}
                    </p>
                </div>

                <!-- staff: nothing to review on an image the student left untouched -->
                <p
                    v-if="isStaff && !current"
                    class="tw:rounded-lg tw:border tw:border-dashed tw:border-an-border tw:bg-white tw:p-3 tw:text-[12px] tw:text-an-faint"
                >
                    The student did not attempt this image, so there is nothing to review here.
                </p>

                <!-- overall feedback -->
                <div
                    class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-an-border tw:bg-white tw:p-3"
                >
                    <div class="tw:text-[12.5px] tw:font-medium tw:text-an-text">
                        Overall feedback
                    </div>
                    <textarea
                        v-if="isStaff && submission"
                        v-model="feedbackDraft"
                        rows="3"
                        :disabled="isGraded || isRejected"
                        placeholder="Summary the student sees on their feedback page…"
                        class="tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:py-2 tw:text-sm tw:outline-none tw:focus:border-an-accent tw:disabled:opacity-60"
                    />
                    <p v-else class="tw:text-[12px] tw:text-an-n-700">
                        {{ submission?.feedback || 'No overall feedback yet.' }}
                    </p>
                    <p
                        v-if="!isStaff && isRejected && submission?.rejection_reason"
                        class="tw:text-[12px] tw:text-danger"
                    >
                        Returned: {{ submission.rejection_reason }}
                    </p>
                </div>
            </aside>
        </div>

        <!-- return / reject dialog -->
        <McDialog v-model:open="rejectOpen">
            <McDialogContent>
                <McDialogHeader>
                    <McDialogTitle>Return submission to the student</McDialogTitle>
                </McDialogHeader>
                <div class="tw:flex tw:flex-col tw:gap-2 tw:p-1">
                    <label class="tw:text-sm tw:text-navy-70">Reason (the student sees this)</label>
                    <textarea
                        v-model="rejectReason"
                        rows="3"
                        placeholder="e.g. Several images are unlabelled — please complete them and resubmit."
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
    </div>
</template>
