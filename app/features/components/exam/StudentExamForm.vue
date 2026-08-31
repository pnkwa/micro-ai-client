<script setup lang="ts">
import { Send, CheckCircle2, ImageUp, Camera, Images, Loader2, X, Clock, Lock } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import { imageService } from '~/services/imageService'
import { assignmentTotalPoints } from '~/services/assignmentService'
import type { Exam } from '~/services/examService'
import { normalizeSlideNumber } from '~/core/helpers/slideNumber'
import { useDetectionAvailability } from '~/core/composables/detectionAvailability'
import { rejectUnusableImage } from '~/core/helpers/imageUpload'
import { isAnswerFormLocked } from '~/core/helpers/studentAssignmentStatus'
import {
    useCameraAvailability,
    cameraFailureMessage,
    type CameraStartFailure,
} from '~/core/composables/cameraCapture'

const props = defineProps<{
    exam: Exam
    mySubmission: SubmissionView | null
}>()
const emit = defineEmits<{ submitted: [] }>()

// Shared with the sidebar and the detection page, so submitting releases the tool everywhere at
// once rather than waiting for a reload (request 5.2).
const { refresh: refreshAiAvailability } = useDetectionAvailability()

const { $dayjs } = useNuxtApp()

// Flatten the slide_identification questions; each is one slide "station".
let flatIndex = 0
const stations = props.exam.sections.flatMap((section, sectionIndex) =>
    section.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        points: q.points,
        sectionIndex,
        index: flatIndex++,
    })),
)

// Per-station answer: the self-reported slide label and the written diagnosis. The label is free
// text: it may carry a letter code ("V7") as easily as a bare number.
const answers = reactive<Record<number, { slideNumber: string; diagnosis: string }>>({})
const images = reactive<
    Record<number, { file: File | null; name: string; previewUrl: string | null }>
>({})
for (const s of stations) answers[s.id] = { slideNumber: '', diagnosis: '' }

const invalidIds = reactive(new Set<number>())
const submitting = ref(false)
// Locked out of answering: either they already had a submission on load, or they just made one.
// Tracked locally as well as via the prop so the confirmation panel appears the instant the POST
// returns, without waiting for the parent's refetch. isAnswerFormLocked holds the rejected
// exception - staff handed the attempt back, so the form reopens (BE-ADR-019).
const submitted = ref(isAnswerFormLocked(props.mySubmission))

/**
 * Redoing a returned exam: put back what they typed last time, and show the photo they sent.
 *
 * Without this the form they are sent to is completely blank, so a student told to fix their work
 * cannot see what they wrote - and re-submitting REPLACES the row (BE-ADR-019, there is no
 * un-reject), so the old attempt is gone the moment they hand in again. This is their only view
 * of it.
 *
 * The photo is shown but NOT restored: a browser cannot refill a file input from a URL, and an
 * exam is often returned precisely because the photo was unusable, so a fresh one is required.
 * Keyed off `image_id`, which survives the server's grade strip; `detection` does not (BE-ADR-027).
 */
const previousImageUrls = reactive<Record<number, string>>({})
/**
 * The image_id behind each preview, so a photo the student keeps can be re-sent at full size.
 * The preview URL is a thumb and must never be what gets submitted.
 */
const previousImageIds = reactive<Record<number, number>>({})

/**
 * The instructor's note on each station, from the attempt that was handed back.
 *
 * *** THIS IS THE POINT OF A RETURN. *** The banner says the exam came back; the reason says why
 * overall; this says what was wrong with THIS slide - and it is the only one of the three that
 * tells a student what to re-photograph. Shown beside the station rather than collected at the top,
 * because a note about station 4 read next to station 4 is instruction, and read at the top of the
 * page is a puzzle.
 *
 * *** IT IS EMPTY TODAY, AND THAT IS A SERVER ISSUE, NOT A BUG HERE. *** `stripUnpublishedGrades`
 * nulls `answer.comment` for anything not `graded`, so a rejected submission arrives with every
 * note removed. That rule is right for scores and wrong for these: a note on a returned attempt is
 * not an unpublished grade, it is the instruction to fix. Requested in
 * `.claude/backend-request-2026-08-31-grading-feedback.md`; this renders the moment it
 * arrives, and renders nothing until then.
 */
const previousComments = reactive<Record<number, string>>({})
/** Set once a previous attempt has actually been read back, so the notice never claims a prefill
 * that did not happen (the load is best-effort and silent). */
const isRedo = ref(false)
const loadPreviousAttempt = async () => {
    const previous = props.mySubmission
    if (!previous || previous.status !== 'rejected') return
    try {
        const detail = await submissionService.getById(previous.id)
        for (const answer of detail.answers) {
            const station = answers[answer.question_id]
            if (!station) continue
            // The raw label first: it is what they actually typed, and a label the server could
            // not normalize is stored only in that form.
            station.slideNumber = answer.slide_number_raw ?? answer.slide_number ?? ''
            station.diagnosis = answer.response_text ?? ''
            if (answer.comment) previousComments[answer.question_id] = answer.comment
            if (answer.image_id) {
                previousImageIds[answer.question_id] = answer.image_id
                // Per photo, so one that will not load does not abandon the prefill for every
                // answer after it. The id is recorded either way: a photo the student cannot
                // PREVIEW may still be re-sent on submit, and dropping the id would silently lose
                // their picture instead of merely not showing it.
                try {
                    previousImageUrls[answer.question_id] = await imageService.blobUrl(
                        answer.image_id,
                        'thumb',
                    )
                } catch {
                    /* the tile falls back to the empty dropzone */
                }
            }
            isRedo.value = true
        }
    } catch {
        // Silent, and deliberately not a toast: an empty form still works, and a failed prefill
        // must not read as a failed resubmit.
    }
}
onMounted(loadPreviousAttempt)
const isGraded = computed(() => props.mySubmission?.status === 'graded')
const totalPoints = computed(() => assignmentTotalPoints(props.exam))

// ---- window gating ----
const now = ref($dayjs())
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => {
    ticker = setInterval(() => (now.value = $dayjs()), 1000)
})
onBeforeUnmount(() => {
    if (ticker) clearInterval(ticker)
    for (const entry of Object.values(images)) {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl)
    }
    for (const url of Object.values(previousImageUrls)) URL.revokeObjectURL(url)
})

const opensAt = computed(() => (props.exam.opens_at ? $dayjs(props.exam.opens_at) : null))
const closesAt = computed(() => (props.exam.closes_at ? $dayjs(props.exam.closes_at) : null))
/** Their own submission, on the shared feedback page. Exams route through /assignments/. */
const feedbackPath = computed(
    () => `/classes/${props.exam.class_id}/assignments/${props.exam.id}/my-feedback`,
)

const windowState = computed<'before' | 'open' | 'closed'>(() => {
    if (opensAt.value && now.value.isBefore(opensAt.value)) return 'before'
    if (closesAt.value && now.value.isAfter(closesAt.value)) return 'closed'
    return 'open'
})

// mm:ss (or h:mm:ss) until close, for the live countdown.
const countdown = computed(() => {
    if (!closesAt.value) return null
    const secs = Math.max(0, closesAt.value.diff(now.value, 'second'))
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
})

// A station counts as answered once it carries a label of some kind, a diagnosis and a photo.
// The label is deliberately NOT checked against SLIDE_NUMBER_PATTERN here: that pattern is
// provisional (see slideNumber.ts) and the server accepts a label it cannot resolve on purpose,
// storing null and routing the answer to instructor review rather than failing the upload
// (BE-ADR-017). A stricter rule on this side turns a guess about the format into a student
// locked out of submitting mid-exam, which is the one place that cost is unrecoverable.
/** The photo the student kept, as a file to upload. Null when they attached a new one or none. */
const keptPhoto = async (stationId: number): Promise<File | null> => {
    const imageId = previousImageIds[stationId]
    if (!imageId) return null
    try {
        return await imageService.file(imageId)
    } catch {
        // Better to submit the rest than to fail the attempt over one image, and mid-exam that
        // difference is unrecoverable.
        return null
    }
}

/**
 * A station is answered by a NEW photo or by the one already sent on a returned attempt.
 *
 * Re-submitting replaces the row, so a kept photo is not merely displayed: it is re-uploaded on
 * submit. Demanding a fresh one would mean a student whose exam came back over a wrong diagnosis
 * had to re-photograph a slide they may no longer be sitting at.
 */
const isAnswered = (id: number): boolean =>
    answers[id]!.slideNumber.trim() !== '' &&
    answers[id]!.diagnosis.trim() !== '' &&
    (images[id]?.file != null || previousImageIds[id] != null)

// Progress and urgency, both of which the student otherwise has to work out by scrolling. The
// count is what tells them whether they are done; a station they skipped is easy to lose in a
// long form, and the first feedback they get today is the error on submit.
const answeredCount = computed(() => stations.filter((s) => isAnswered(s.id)).length)
const allAnswered = computed(() => answeredCount.value === stations.length)

// Escalate the countdown in the last five minutes. Same information, but warning-coloured text
// stops reading as urgent once it has been on screen for an hour.
const ENDING_SOON_SECONDS = 5 * 60
const isEndingSoon = computed(
    () =>
        closesAt.value !== null && closesAt.value.diff(now.value, 'second') <= ENDING_SOON_SECONDS,
)

// Input.vue's / Textarea.vue's own tokens rather than a call to inputVariants(), because cn()'s
// tailwind-merge does not recognise this project's `tw:` prefix: it cannot tell that h-9 and h-11
// conflict, so both survive and stylesheet order picks the winner.
//
// Written out in full rather than composed, because Tailwind scans source text for class names -
// a class assembled at runtime is a class that never gets generated.
const SHARED_FIELD_TOKENS =
    'tw:w-full tw:rounded-md tw:border tw:border-input tw:bg-transparent tw:px-3 tw:text-sm tw:shadow-xs tw:outline-none tw:transition-[color,box-shadow] tw:placeholder:text-muted-foreground tw:focus-visible:border-ring tw:focus-visible:ring-ring/50 tw:focus-visible:ring-[3px]'

// A plain input, matching every other field in the app. Safe to drop the tw:uppercase that used to
// be here: normalizeSlideNumber uppercases before matching on both sides of the wire, so "v7" is
// stored as "V7" either way - the transform was only ever cosmetic. Dropping it also lets the
// placeholder go back to "e.g. V7", which uppercase rendered as "E.G. V7".
const SLIDE_INPUT_CLASS = `tw:h-9 ${SHARED_FIELD_TOKENS}`

// min-h rather than h, plus resize-y: 4rem is a floor here, not a cap.
const TEXTAREA_CLASS = `tw:min-h-16 tw:py-2 tw:resize-y ${SHARED_FIELD_TOKENS}`

/**
 * Stations whose preview is still decoding.
 *
 * createObjectURL is instant, but a 12-megapixel phone photo is not: the <img> can take a visible
 * moment to paint, and until it does the tile looks like the tap did nothing. Cleared by the
 * image's own load/error, so it tracks the decode rather than a guessed duration.
 */
const decodingIds = reactive(new Set<number>())

const setImage = (id: number, file: File | null) => {
    const prev = images[id]
    if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
    images[id] = {
        file,
        name: file?.name ?? '',
        previewUrl: file ? URL.createObjectURL(file) : null,
    }
    if (file) {
        invalidIds.delete(id)
        decodingIds.add(id)
    } else {
        decodingIds.delete(id)
    }
}

// True when the file is unusable, having already told the student why. Both entry points below go
// through it, so a photo that a drop would accept is exactly the set the picker accepts.
const wasRejected = (file: File): boolean => {
    const rejection = rejectUnusableImage(file)
    if (rejection) toast.error(rejection.message)
    return rejection !== null
}

const onImage = (id: number, e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0] ?? null

    // Rejected before it replaces anything: a student swapping a good photo for a HEIC should not
    // lose the one that worked. Clearing the input lets them pick the same file again after
    // fixing it, which the browser otherwise treats as "no change".
    if (file && wasRejected(file)) {
        input.value = ''
        return
    }

    setImage(id, file)
}

/**
 * Camera or gallery, chosen from a menu on the tile rather than decided for the student.
 *
 * One pair of inputs for the whole form, not a pair per station: the station is carried in
 * `photoTargetId` instead. `capture="environment"` cannot be toggled on a single input reliably -
 * Safari reads it when the picker opens, so flipping the attribute first is racy - which is why
 * this is two fixed inputs and a menu rather than one input and a mode flag.
 */
const photoTargetId = ref<number | null>(null)
const cameraInput = useTemplateRef<HTMLInputElement>('cameraInput')
const galleryInput = useTemplateRef<HTMLInputElement>('galleryInput')

// Which camera routes this device has. Shared with the detection page so both screens offer
// "Take photo" under exactly the same conditions.
const { hasVideoInput, cameraBlocked, canTakePhoto, canUseInAppCamera } = useCameraAvailability()

const openPhotoSource = (id: number, source: 'camera' | 'gallery') => {
    photoTargetId.value = id

    if (source === 'gallery') {
        // Synchronous, inside the menu item's own click: browsers only honour a programmatic
        // .click() on a file input while a real user gesture is still on the stack.
        galleryInput.value?.click()
        return
    }

    // Already known to be blocked, so both camera routes would open onto a permission wall the
    // student cannot clear from here. Say so and take them to the route that does work rather
    // than leaving them to work out why nothing happened. Checked against state resolved on
    // mount: an await here would end the user gesture and the browser would refuse the click.
    if (cameraBlocked.value) {
        toast.error(
            'Camera access is blocked for this site. Allow it in your browser settings, or pick a photo from your device.',
        )
        galleryInput.value?.click()
        return
    }

    // Our own capture screen where it can run, the phone's camera app otherwise.
    if (canUseInAppCamera.value) {
        openCamera(id)
        return
    }
    cameraInput.value?.click()
}

// ---- in-app camera ----

/**
 * The capture screen is McCameraCapture, shared with the detection page - live preview, shutter,
 * then keep-or-retake, full-screen so framing a slide gets the whole display.
 *
 * The `capture` attribute only means something on a phone, so without this a laptop's "Take photo"
 * was a file dialog wearing a camera label. getUserMedia works on both, which is also why the
 * captured frame goes through the same rejectUnusableImage() guard as a picked file - the station
 * must not care which of the three routes the photo arrived by.
 */
const cameraOpen = ref(false)
const cameraStationId = ref<number | null>(null)

const openCamera = (id: number) => {
    cameraStationId.value = id
    cameraOpen.value = true
}

const onCapture = (file: File) => {
    const id = cameraStationId.value
    if (id === null) return

    // Same guard as the picked-file routes. A rejection leaves the screen open on the review step -
    // McCameraCapture does not close itself - so the student can simply retake rather than starting
    // the whole flow again.
    if (wasRejected(file)) return

    setImage(id, file)
    cameraOpen.value = false
}

/** The stream never started: say why, then send the student to the route that does work. */
const onCameraFail = (reason: CameraStartFailure) => {
    if (reason === 'denied') cameraBlocked.value = true
    if (reason === 'missing') hasVideoInput.value = false
    toast.error(cameraFailureMessage[reason])
    galleryInput.value?.click()
}

const onPhotoInput = (e: Event) => {
    const id = photoTargetId.value
    const input = e.target as HTMLInputElement
    if (id === null) return

    // A dismissed camera or picker fires `change` with an empty list on some Android browsers.
    // Passing that on would call setImage(id, null) and wipe a photo the student had already
    // attached - backing out of the camera must leave the tile exactly as it was.
    if (!input.files?.length) {
        input.value = ''
        return
    }

    onImage(id, e)

    // Shared inputs, so the value has to be cleared after every pick: choosing the same file for a
    // second station would otherwise not fire `change` at all - the value never changed - and that
    // station would silently stay empty.
    input.value = ''
}

// Which station is being dragged over, so only that tile lights up.
const dragOverId = ref<number | null>(null)

// dragleave fires every time the cursor crosses onto a child element, so clearing on it
// unconditionally makes the highlight flicker as you move across the tile. Only clear when the
// pointer has actually left the tile's subtree.
const onDragLeave = (e: DragEvent) => {
    const tile = e.currentTarget as HTMLElement
    const goingTo = e.relatedTarget as Node | null
    if (goingTo && tile.contains(goingTo)) return
    dragOverId.value = null
}

const onDrop = (id: number, e: DragEvent) => {
    dragOverId.value = null
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    // A drop bypasses the input's `accept` entirely, so it needs the same guard - and the full one,
    // not a type check: dragging a HEIC off the desktop is as easy as picking one.
    if (wasRejected(file)) return
    setImage(id, file)
}

const removeImage = (id: number) => {
    const prev = images[id]
    if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
    delete images[id]
}

const scrollToStation = (id: number) => {
    document
        .getElementById(`station-${id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const onSubmit = async () => {
    if (windowState.value !== 'open') return
    invalidIds.clear()
    let firstUnanswered: number | null = null
    for (const s of stations) {
        if (!isAnswered(s.id)) {
            invalidIds.add(s.id)
            if (firstUnanswered === null) firstUnanswered = s.id
        }
    }
    if (firstUnanswered !== null) {
        toast.error('Complete every slide: number, diagnosis and a photo')
        scrollToStation(firstUnanswered)
        return
    }

    submitting.value = true
    try {
        const fd = new FormData()
        fd.append('assignment_id', String(props.exam.id))
        const payload = stations.map((s) => {
            const typed = answers[s.id]!.slideNumber.trim()
            return {
                question_id: s.id,
                response_text: answers[s.id]!.diagnosis.trim(),
                // Normalized before sending so the grade-time lookup matches the stored key
                // whatever the student typed. The server normalizes again; this is belt and
                // braces, not trust.
                slide_number: normalizeSlideNumber(typed),
                // The untouched entry, so a label the pattern does not recognise reaches the
                // instructor as text rather than as a blank. Normalizing is lossy and this is
                // the one field a human has to check against the slide in front of them.
                slide_number_raw: typed || null,
            }
        })
        fd.append('answers', JSON.stringify(payload))
        for (const s of stations) {
            // A previous photo the student did not replace is refetched at full size and sent as
            // their answer: the resubmit replaces the row, so an answer with no file has no photo.
            const file = images[s.id]?.file ?? (await keptPhoto(s.id))
            if (file) fd.append(`image_${s.id}`, file)
        }
        await submissionService.create(fd)
        submitted.value = true
        toast.success('Exam submitted')
        emit('submitted')

        // Submitting is exactly when the AI tool becomes available again (request 5.2), and this
        // is the one moment the client knows that for certain. Forced past the throttle: making a
        // student who has just finished wait it out is the lockout this is meant to prevent.
        // Not awaited - the submission has succeeded either way, and a failure here only means
        // the sidebar catches up on the next navigation.
        void refreshAiAvailability({ force: true })
    } catch (e) {
        // The server 403s a submission outside the window even if the client clock drifted.
        toast.error(apiErrorMessage(e, 'Failed to submit exam'))
    } finally {
        submitting.value = false
    }
}
</script>

<template>
    <!-- already submitted -->
    <McStatePanel v-if="submitted" tone="primary">
        <CheckCircle2 class="tw:size-10 tw:text-primary" />
        <template v-if="isGraded">
            <p class="tw:text-lg tw:font-semibold tw:text-navy-100">Your exam has been graded</p>
            <p class="tw:text-3xl tw:font-bold tw:text-primary tw:tabular-nums">
                {{ mySubmission?.score ?? 0 }} / {{ totalPoints }}
            </p>
        </template>
        <template v-else>
            <p class="tw:text-lg tw:font-semibold tw:text-navy-100">Your exam was submitted</p>
            <p class="tw:text-sm tw:text-navy-60">
                It's final and can't be changed. Your score appears here once it's graded.
            </p>
        </template>
    </McStatePanel>

    <!--
        Before open, or after close.

        A student who submitted never reaches here: the confirmation above claims them, closed or
        not. What lands here is someone with nothing in, or someone whose attempt was handed BACK
        and who ran out of window to redo it - and that second case used to get a bare padlock,
        with no reason, no answers and no way to reach either. Being locked out is not the useful
        half of that sentence; where their work went is.
    -->
    <McStatePanel v-else-if="windowState !== 'open'">
        <Lock class="tw:size-8 tw:text-navy-40" />

        <template v-if="windowState === 'before'">
            <p class="tw:text-lg tw:font-semibold tw:text-navy-100">This exam has not opened yet</p>
            <p v-if="opensAt" class="tw:text-sm tw:text-navy-60">
                Opens {{ opensAt.format('MMM D, YYYY HH:mm') }}
            </p>
        </template>

        <template v-else-if="mySubmission?.status === 'rejected'">
            <p class="tw:text-lg tw:font-semibold tw:text-navy-100">
                Your exam was returned, and the window has closed
            </p>
            <p
                v-if="mySubmission.rejection_reason"
                class="tw:max-w-prose tw:text-sm tw:whitespace-pre-line tw:text-navy-90"
            >
                {{ mySubmission.rejection_reason }}
            </p>
            <p class="tw:text-sm tw:text-navy-60">
                Resubmitting is no longer possible. Ask your instructor if you need another attempt.
            </p>
            <NuxtLink :to="feedbackPath" class="tw:mt-2">
                <McButton variant="outline" size="sm">View what you submitted</McButton>
            </NuxtLink>
        </template>

        <template v-else>
            <p class="tw:text-lg tw:font-semibold tw:text-navy-100">This exam has closed</p>
            <p v-if="closesAt" class="tw:text-sm tw:text-navy-60">
                Closed {{ closesAt.format('MMM D, YYYY HH:mm') }}
            </p>
            <!-- Said plainly rather than left to be inferred from a locked door. -->
            <p class="tw:text-sm tw:text-navy-60">You did not submit this exam.</p>
        </template>
    </McStatePanel>

    <McStatePanel v-else-if="stations.length === 0">
        <p class="tw:text-sm tw:text-navy-50">No slide stations yet.</p>
    </McStatePanel>

    <!-- open: the exam form -->
    <form v-else class="tw:flex tw:flex-col tw:gap-4" @submit.prevent="onSubmit">
        <!-- Reopened because staff returned the previous attempt. Lead with why, so the student
             knows what to fix before re-photographing the stations. -->
        <div
            v-if="mySubmission?.status === 'rejected'"
            class="tw:bg-danger/5 tw:border tw:border-danger/30 tw:rounded-lg tw:px-4 tw:py-3"
        >
            <p class="tw:text-sm tw:font-semibold tw:text-danger">
                Your previous attempt was returned
            </p>
            <p
                v-if="mySubmission.rejection_reason"
                class="tw:text-sm tw:text-navy-90 tw:mt-1 tw:whitespace-pre-line"
            >
                {{ mySubmission.rejection_reason }}
            </p>
        </div>

        <div class="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:px-1">
            <span class="tw:text-sm tw:text-navy-70">
                <span class="tw:font-semibold tw:text-navy-100">{{ answeredCount }}</span>
                of {{ stations.length }} complete
            </span>
            <div
                v-if="countdown"
                class="tw:flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-medium tw:tabular-nums"
                :class="isEndingSoon ? 'tw:text-danger' : 'tw:text-warning'"
            >
                <Clock class="tw:size-4" />
                Closes in {{ countdown }}
            </div>
        </div>

        <div
            v-for="s in stations"
            :id="`station-${s.id}`"
            :key="s.id"
            class="tw:rounded-lg tw:border tw:bg-white tw:p-5 tw:transition-colors"
            :class="
                invalidIds.has(s.id) ? 'tw:border-danger/50 tw:bg-danger/5' : 'tw:border-navy-15'
            "
        >
            <!--
                The number is the anchor: stations are identical-looking cards, and without it a
                student cross-referencing the bench has nothing to count against, so it stays on
                screen whatever the station's state. Completion is carried by the fill alone.
            -->
            <div class="tw:flex tw:items-start tw:gap-3">
                <span
                    class="tw:mt-0.5 tw:flex tw:size-6 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:text-xs tw:font-semibold tw:transition-colors"
                    :class="
                        isAnswered(s.id)
                            ? 'tw:bg-primary tw:text-white'
                            : 'tw:bg-navy-10 tw:text-navy-60'
                    "
                >
                    {{ s.index + 1 }}
                </span>
                <p class="tw:font-medium tw:text-navy-100">
                    {{ s.prompt }}
                    <span class="tw:text-danger" aria-label="required">*</span>
                </p>
            </div>

            <!--
                What the instructor said about THIS station last time.

                Under the prompt and above the answer, because that is the order it is used in: read
                the station, read what was wrong with your last attempt, then answer. Collected at
                the top of the page instead, a note about station 4 is a puzzle to match up; here it
                is an instruction.
            -->
            <div
                v-if="previousComments[s.id]"
                class="tw:mt-3 tw:rounded-md tw:border tw:border-danger/25 tw:bg-danger/5 tw:px-3 tw:py-2 tw:sm:ml-9"
            >
                <p class="tw:text-xs tw:font-medium tw:text-danger">Instructor feedback</p>
                <p class="tw:mt-0.5 tw:text-sm tw:whitespace-pre-line tw:text-navy-90">
                    {{ previousComments[s.id] }}
                </p>
            </div>

            <!--
                Photo left, answers right, both the same height. The photo is the evidence at a
                microscope station and the only thing that tells two otherwise identical stations
                apart, so it gets real size instead of the squat strip it used to sit in. A field
                of view is round, so a square frame crops it far better than a wide one.

                Stacks on mobile with the photo on top, which is where it gets taken.
            -->
            <div class="tw:mt-4 tw:flex tw:flex-col tw:gap-4 tw:sm:flex-row tw:sm:pl-9">
                <!--
                    The remove button is a sibling of the label, not a child: nested inside it,
                    clicking it would also re-open the file picker it just cleared.
                -->
                <!--
                    Square, and 11rem rather than 9: the square is what sets the row height, so it
                    has to be at least as tall as the answers beside it or the tile ends short.
                    Those come to ~9.75rem (label + 2.25rem input + gap + label + 4rem textarea),
                    so 9rem left it short. At 11rem the tile is the taller side, the row stretches
                    the answers column to match, and the textarea's flex-1 absorbs the difference.
                -->
                <!--
                    On mobile the tile grows once a photo is attached: an empty dropzone only has
                    to be tappable, but a preview has to be checkable, and 10rem of full-width strip
                    is not enough to tell a good field of view from a blurred one. Desktop keeps the
                    square in both states, so the row height never jumps as stations get filled.
                -->
                <!-- 3.2 (Slide 18) is handled at the inputs below and in
                     core/helpers/imageUpload.ts: HEIC is rejected at selection with instructions
                     (the worker has no pillow-heif, so it would otherwise fail AFTER a submit that
                     looked fine) and the size is checked against FILE_SIZE.MAX. The drop handler
                     runs the same guard, since a drop bypasses `accept` entirely.

                     Tapping the tile opens a menu - "Take photo" or "Choose from device" - the way
                     a native app asks. It used to be a single input carrying capture="environment",
                     which on a phone meant every tap opened the viewfinder: a student who had
                     already photographed the slide could not reach that photo at all. -->
                <!-- TODO(3.2): two gaps are NOT fixable from here.
                       - NO SERVER-SIDE SIZE LIMIT. Neither FileInterceptor('image') on /detections
                         nor AnyFilesInterceptor() on /submissions sets limits.fileSize. The check
                         below is client-side and therefore advisory: anything posting directly is
                         unbounded, and an exam sends one photo per station in a single request.
                       - EXIF ORIENTATION. PIL does not auto-rotate, so a portrait phone photo can
                         reach the model sideways. It degrades detection silently rather than
                         failing. Needs ImageOps.exif_transpose in the worker
                         (micro-ai-image-processor). -->
                <div
                    class="tw:relative tw:w-full tw:shrink-0 tw:transition-[height] tw:sm:size-44"
                    :class="images[s.id]?.file ? 'tw:h-64' : 'tw:h-32'"
                    @dragover.prevent="dragOverId = s.id"
                    @dragenter.prevent="dragOverId = s.id"
                    @dragleave="onDragLeave"
                    @drop.prevent="onDrop(s.id, $event)"
                >
                    <McDropdownMenu>
                        <McDropdownMenuTrigger
                            class="tw:group/photo tw:block tw:size-full tw:cursor-pointer tw:overflow-hidden tw:rounded-lg tw:text-left"
                            :aria-label="
                                images[s.id]?.file ? 'Change photo' : 'Attach field-of-view photo'
                            "
                        >
                            <template v-if="images[s.id]?.file">
                                <!--
                                object-contain, not cover: cover crops to fill the tile, so a
                                portrait phone photo loses its top and bottom and the student is
                                checking a centre crop rather than the frame they actually
                                submitted. Contain letterboxes it against navy-5 instead, which is
                                what makes this a preview of the real image.
                            -->
                                <img
                                    :src="images[s.id]?.previewUrl ?? undefined"
                                    alt=""
                                    class="tw:size-full tw:rounded-lg tw:border tw:bg-navy-5 tw:object-contain tw:transition-colors"
                                    :class="
                                        dragOverId === s.id
                                            ? 'tw:border-primary'
                                            : 'tw:border-primary/40'
                                    "
                                    @load="decodingIds.delete(s.id)"
                                    @error="decodingIds.delete(s.id)"
                                />
                                <!--
                                Nothing otherwise says a filled tile is still clickable, and the
                                only other control on it is the remove x - easy to read as "delete
                                and start again" being the only way to swap the photo.
                            -->
                                <span
                                    class="tw:pointer-events-none tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-lg tw:bg-navy-100/55 tw:text-xs tw:font-medium tw:text-white tw:opacity-0 tw:transition-opacity tw:group-hover/photo:opacity-100"
                                >
                                    <ImageUp class="tw:size-4" />
                                    Change photo
                                </span>
                                <!--
                                The overlay above is hover-only, so on touch nothing says the
                                preview is still interactive. This says it in place, and is hidden
                                from sm up where the hover state does the job.
                            -->
                                <span
                                    class="tw:pointer-events-none tw:absolute tw:bottom-1.5 tw:left-1.5 tw:rounded tw:bg-navy-100/65 tw:px-1.5 tw:py-0.5 tw:text-[0.6875rem] tw:font-medium tw:text-white tw:sm:hidden"
                                >
                                    Tap to change
                                </span>
                            </template>
                            <!--
                                Redoing a returned exam: the photo they sent last time sits IN the
                                tile it is about to be replaced in, rather than in a note somewhere
                                below. Shown at full strength, because the point is for the student
                                to LOOK at it - it is how they tell one station from another and how
                                they judge what was wrong with it, and a dimmed thumbnail behind a
                                prompt is not something anyone can read a field of view off.

                                No prompt over the top for the same reason: nothing covers the
                                picture. The dashed border and the "Previous photo" tag carry the
                                fact that nothing is attached yet, the notice above the stations
                                asks for a new photo once rather than five times, and submitting
                                without one still fails validation. A file input cannot be refilled
                                from a URL in any case.
                            -->
                            <template v-else-if="previousImageUrls[s.id]">
                                <img
                                    :src="previousImageUrls[s.id]"
                                    alt="The photo you sent last time"
                                    class="tw:size-full tw:rounded-lg tw:border tw:border-dashed tw:bg-navy-5 tw:object-contain tw:transition-colors"
                                    :class="
                                        dragOverId === s.id
                                            ? 'tw:border-primary'
                                            : 'tw:border-navy-20'
                                    "
                                />
                                <!--
                                Same hover affordance the filled tile uses, so a previous photo
                                does not read as a dead picture: nothing else on this state says
                                the tile is still the way to attach one. Hover-only, so it costs
                                the photo nothing until the pointer is actually over it.
                            -->
                                <span
                                    class="tw:pointer-events-none tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-lg tw:bg-navy-100/55 tw:text-xs tw:font-medium tw:text-white tw:opacity-0 tw:transition-opacity tw:group-hover/photo:opacity-100"
                                >
                                    <ImageUp class="tw:size-4" />
                                    Add photo
                                </span>
                                <!-- Fades out under the overlay above rather than stacking on top
                                 of it: on hover the tile is asking for a photo, not labelling the
                                 one already there. -->
                                <span
                                    class="tw:pointer-events-none tw:absolute tw:bottom-1.5 tw:left-1.5 tw:rounded tw:bg-navy-100/65 tw:px-1.5 tw:py-0.5 tw:text-[0.6875rem] tw:font-medium tw:text-white tw:transition-opacity tw:group-hover/photo:opacity-0"
                                >
                                    Previous photo
                                </span>
                            </template>
                            <span
                                v-else
                                class="tw:flex tw:size-full tw:flex-col tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-dashed tw:text-center tw:transition-colors"
                                :class="
                                    dragOverId === s.id
                                        ? 'tw:border-primary tw:bg-primary/10 tw:text-primary'
                                        : 'tw:border-navy-20 tw:text-navy-60 tw:hover:border-primary tw:hover:bg-primary/5'
                                "
                            >
                                <ImageUp class="tw:size-5" />
                                <span class="tw:text-xs tw:font-medium">
                                    {{ dragOverId === s.id ? 'Drop to attach' : 'Add photo' }}
                                </span>
                                <!-- Hidden on touch, where there is nothing to drag from. -->
                                <span
                                    class="tw:hidden tw:text-[0.6875rem] tw:text-navy-50 tw:sm:block"
                                >
                                    or drop it here
                                </span>
                            </span>
                        </McDropdownMenuTrigger>
                        <!--
                            The two routes a phone photo can take, named. align="start" so the menu
                            hangs under the tile rather than off the side of a narrow screen.
                        -->
                        <McDropdownMenuContent align="start" class="tw:w-56">
                            <!-- Shown only where a camera route can really produce a photo: our
                                 own capture screen, or a touch device that honours `capture`. A
                                 laptop with no webcam gets neither, and offering it there would
                                 just be the "Choose from device" item wearing a camera label. -->
                            <McDropdownMenuItem
                                v-if="canTakePhoto"
                                @select="openPhotoSource(s.id, 'camera')"
                            >
                                <Camera class="tw:size-4" />
                                <div class="tw:flex tw:flex-col">
                                    <span class="tw:text-sm">Take photo</span>
                                    <span class="tw:text-xs tw:text-navy-50">
                                        {{ cameraBlocked ? 'Camera blocked' : 'Opens the camera' }}
                                    </span>
                                </div>
                            </McDropdownMenuItem>
                            <McDropdownMenuItem @select="openPhotoSource(s.id, 'gallery')">
                                <Images class="tw:size-4" />
                                <div class="tw:flex tw:flex-col">
                                    <span class="tw:text-sm">Choose from device</span>
                                    <span class="tw:text-xs tw:text-navy-50">
                                        A photo you already have
                                    </span>
                                </div>
                            </McDropdownMenuItem>
                        </McDropdownMenuContent>
                    </McDropdownMenu>
                    <!--
                        Sits over the tile until the preview has actually painted. A phone photo
                        straight off the camera is big enough that the gap between "file attached"
                        and "you can see it" reads as nothing having happened.

                        pointer-events-none so it never eats the tap that opens the menu, and
                        aria-hidden because the status is announced by the tile's own label rather
                        than by a spinner.
                    -->
                    <span
                        v-if="decodingIds.has(s.id)"
                        aria-hidden="true"
                        class="tw:pointer-events-none tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:rounded-lg tw:bg-white/70"
                    >
                        <Loader2 class="tw:size-5 tw:animate-spin tw:text-primary" />
                    </span>
                    <button
                        v-if="images[s.id]?.file"
                        type="button"
                        aria-label="Remove photo"
                        class="tw:absolute tw:top-1.5 tw:right-1.5 tw:cursor-pointer tw:rounded-full tw:bg-white/90 tw:p-1 tw:text-navy-60 tw:shadow-sm tw:transition-colors tw:hover:bg-danger tw:hover:text-white"
                        @click="removeImage(s.id)"
                    >
                        <X class="tw:size-3.5" />
                    </button>
                </div>

                <div class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-3">
                    <div class="tw:flex tw:flex-col tw:gap-1.5">
                        <label class="tw:text-xs tw:font-medium tw:text-navy-60">Slide</label>
                        <!-- Capped: full-width would make a 2-4 character code look like a lost sentence. -->
                        <div class="tw:w-28">
                            <input
                                v-model="answers[s.id]!.slideNumber"
                                type="text"
                                inputmode="text"
                                autocapitalize="characters"
                                placeholder="e.g. V7"
                                :class="SLIDE_INPUT_CLASS"
                                @input="invalidIds.delete(s.id)"
                            />
                        </div>
                    </div>

                    <!-- flex-1 so the diagnosis takes up whatever height the photo leaves. -->
                    <!-- 3.1 (Slide 18) offered the rubric's diagnoses here as quick-pick options.
                         Removed at the client's instruction: an exam must test recall, and a list
                         of the five possible answers hands it over. The vocabulary itself is
                         unchanged and still authoritative - it just is not shown to the student.
                         `core/helpers/classVocabulary.ts` remains in use by the answer-key
                         importer, which is instructor-side and not an exam surface. -->
                    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-1.5">
                        <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                            Your diagnosis
                        </label>

                        <!-- Free text, no quick-pick options: in an exam the student has to recall
                             the diagnosis, not recognise it from a list. Grading is unaffected -
                             canonicalizeClass() server-side resolves whatever is typed, so a code
                             ("BV") and a name ("Bacterial vaginosis") still grade identically
                             (BE-ADR-018), and an answer outside the vocabulary still routes to
                             instructor review rather than being marked wrong. -->
                        <textarea
                            v-model="answers[s.id]!.diagnosis"
                            placeholder="What is this slide?"
                            :class="[TEXTAREA_CLASS, 'tw:sm:flex-1']"
                            @input="invalidIds.delete(s.id)"
                        ></textarea>
                    </div>
                </div>
            </div>

            <p
                v-if="invalidIds.has(s.id)"
                class="tw:mt-2 tw:text-xs tw:font-medium tw:text-danger tw:sm:pl-9"
            >
                Enter a slide number, a diagnosis and a photo.
            </p>
        </div>

        <!--
            The button stays enabled when stations are missing: submit is what runs the validation
            and scrolls to the first gap, so disabling it would strand a student with no way to
            find out which station they missed. The hint says what is outstanding beforehand.
        -->
        <div class="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-3">
            <p v-if="!allAnswered" class="tw:mr-auto tw:text-sm tw:text-navy-60">
                {{ stations.length - answeredCount }} station{{
                    stations.length - answeredCount === 1 ? '' : 's'
                }}
                still need a slide, a diagnosis and a photo.
            </p>
            <McButton type="submit" :loading="submitting">
                <Send class="tw:size-4 tw:mr-1.5" />
                Submit exam
            </McButton>
        </div>

        <!--
            One pair for the whole form, outside the station loop: the menu sets photoTargetId and
            clicks the matching one, so N stations still only ever mount two inputs. Both land in
            onPhotoInput -> onImage, so the HEIC/size guard runs identically whichever route the
            photo came in by, and the drop handler runs the same guard again for the same reason.
        -->
        <input
            ref="cameraInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            class="tw:hidden"
            @change="onPhotoInput"
        />
        <input
            ref="galleryInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="tw:hidden"
            @change="onPhotoInput"
        />

        <!-- The shared capture screen: full-screen preview, zoom, shutter, keep-or-retake. Does
             not close itself on capture, so a rejected photo leaves the student on the review
             step ready to retake. -->
        <McCameraCapture
            v-model:open="cameraOpen"
            title="Take a photo"
            :file-name="`station-${cameraStationId ?? 0}`"
            @capture="onCapture"
            @fail="onCameraFail"
        />
    </form>
</template>
