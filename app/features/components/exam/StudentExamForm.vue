<script setup lang="ts">
import { Send, CheckCircle2, ImageUp, X, Clock, Lock } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import { assignmentTotalPoints } from '~/services/assignmentService'
import type { Exam } from '~/services/examService'
import { isValidSlideNumber, normalizeSlideNumber } from '~/core/helpers/slideNumber'
import { useDetectionAvailability } from '~/core/composables/detectionAvailability'
import { rejectUnusableImage } from '~/core/helpers/imageUpload'
import { fetchDiagnosisOptions, type DiagnosisOption } from '~/core/helpers/classVocabulary'

const props = defineProps<{
    exam: Exam
    mySubmission: SubmissionView | null
}>()
const emit = defineEmits<{ submitted: [] }>()

// Shared with the sidebar and the detection page, so submitting releases the tool everywhere at
// once rather than waiting for a reload (request 5.2).
const { refresh: refreshAiAvailability } = useDetectionAvailability()

/**
 * The rubric's diagnoses, offered as quick-pick options (client request 3.1).
 *
 * Offered, not enforced: the field stays free text underneath. BE-ADR-018 routes an answer outside
 * the vocabulary to instructor review rather than marking it wrong, and that branch only exists
 * while something outside the list can be submitted. A closed list would delete it silently.
 *
 * An empty list (manifest unreachable) just leaves the plain text field, which is what this form
 * was before.
 */
const diagnosisOptions = ref<DiagnosisOption[]>([])

onMounted(async () => {
    try {
        diagnosisOptions.value = await fetchDiagnosisOptions()
    } catch {
        diagnosisOptions.value = []
    }
})

const { $dayjs } = useNuxtApp()

// Flatten the slide_identification questions; each is one slide "station".
let flatIndex = 0
const stations = props.exam.exercises.flatMap((ex, exIndex) =>
    ex.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        points: q.points,
        exIndex,
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
const submitted = ref(props.mySubmission !== null)
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
})

const opensAt = computed(() => (props.exam.exam_opens_at ? $dayjs(props.exam.exam_opens_at) : null))
const closesAt = computed(() =>
    props.exam.exam_closes_at ? $dayjs(props.exam.exam_closes_at) : null,
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

// A station counts as answered once the slide label is one we can resolve, checked against the
// canonical pattern, not Number(), which would reject every letter code.
const isAnswered = (id: number): boolean =>
    isValidSlideNumber(answers[id]!.slideNumber) &&
    answers[id]!.diagnosis.trim() !== '' &&
    images[id]?.file != null

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
// be here: isValidSlideNumber and normalizeSlideNumber both uppercase before matching, so "v7"
// validates and is stored as "V7" either way - the transform was only ever cosmetic. Dropping it
// also lets the placeholder go back to "e.g. V7", which uppercase rendered as "E.G. V7".
const SLIDE_INPUT_CLASS = `tw:h-9 ${SHARED_FIELD_TOKENS}`

// min-h rather than h, plus resize-y: 4rem is a floor here, not a cap.
const TEXTAREA_CLASS = `tw:min-h-16 tw:py-2 tw:resize-y ${SHARED_FIELD_TOKENS}`

// Fills the field rather than holding a separate selection, so there is one answer per station and
// the submit path stays exactly as it was: a string, graded by canonicalizeClass server-side.
// Tapping the chosen option again clears it, which is how a student changes their mind to free text.
const pickDiagnosis = (id: number, option: DiagnosisOption) => {
    const current = answers[id]!.diagnosis.trim().toLowerCase()
    answers[id]!.diagnosis = current === option.label.toLowerCase() ? '' : option.label
    invalidIds.delete(id)
}

const setImage = (id: number, file: File | null) => {
    const prev = images[id]
    if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
    images[id] = {
        file,
        name: file?.name ?? '',
        previewUrl: file ? URL.createObjectURL(file) : null,
    }
    if (file) invalidIds.delete(id)
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
        const payload = stations.map((s) => ({
            question_id: s.id,
            response_text: answers[s.id]!.diagnosis.trim(),
            // Normalized before sending so the grade-time lookup matches the stored key whatever
            // the student typed. The server normalizes again; this is belt and braces, not trust.
            slide_number: normalizeSlideNumber(answers[s.id]!.slideNumber),
        }))
        fd.append('answers', JSON.stringify(payload))
        for (const s of stations) {
            const image = images[s.id]?.file
            if (image) fd.append(`image_${s.id}`, image)
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
    <div
        v-if="submitted"
        class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:bg-white tw:border tw:border-primary/20 tw:rounded-lg tw:py-16 tw:text-center"
    >
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
    </div>

    <!-- before open / after close -->
    <div
        v-else-if="windowState !== 'open'"
        class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:bg-white tw:border tw:border-navy-15 tw:rounded-lg tw:py-16 tw:text-center"
    >
        <Lock class="tw:size-8 tw:text-navy-40" />
        <p class="tw:text-lg tw:font-semibold tw:text-navy-100">
            {{ windowState === 'before' ? 'This exam has not opened yet' : 'This exam has closed' }}
        </p>
        <p v-if="windowState === 'before' && opensAt" class="tw:text-sm tw:text-navy-60">
            Opens {{ opensAt.format('MMM D, YYYY HH:mm') }}
        </p>
        <p v-else-if="windowState === 'closed' && closesAt" class="tw:text-sm tw:text-navy-60">
            Closed {{ closesAt.format('MMM D, YYYY HH:mm') }}
        </p>
    </div>

    <div
        v-else-if="stations.length === 0"
        class="tw:text-sm tw:text-navy-50 tw:py-8 tw:text-center"
    >
        No slide stations yet.
    </div>

    <!-- open: the exam form -->
    <form v-else class="tw:flex tw:flex-col tw:gap-4" @submit.prevent="onSubmit">
        <!--
            A plain line rather than a card: it reads as a caption for the stations below it.

            Not sticky, which it cannot be without a background - the station cards would scroll
            through the text. If it should follow the scroll again it needs bg-white back, plus
            top-12 to clear SidebarMain's own sticky header (min-h-12, z-30), since the page
            scrolls at body level and top-0 would park it underneath.
        -->
        <div class="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:px-1">
            <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
                <CheckCircle2
                    class="tw:size-4 tw:transition-colors"
                    :class="allAnswered ? 'tw:text-primary' : 'tw:text-navy-30'"
                />
                <span class="tw:text-navy-70">
                    <span class="tw:font-semibold tw:text-navy-100">{{ answeredCount }}</span>
                    of {{ stations.length }} complete
                </span>
            </div>
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
                student cross-referencing the bench has nothing to count against. It flips to a
                check once the station is complete, so scanning the column shows what is left.
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
                    <CheckCircle2 v-if="isAnswered(s.id)" class="tw:size-4" />
                    <template v-else>{{ s.index + 1 }}</template>
                </span>
                <p class="tw:font-medium tw:text-navy-100">
                    {{ s.prompt }}
                    <span class="tw:text-danger" aria-label="required">*</span>
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
                <!-- 3.2 (Slide 18) is handled at the input below and in
                     core/helpers/imageUpload.ts: HEIC is rejected at selection with instructions
                     (the worker has no pillow-heif, so it would otherwise fail AFTER a submit that
                     looked fine), the size is checked against FILE_SIZE.MAX, and capture="environment"
                     opens the rear camera on a phone rather than a file browser. The drop handler
                     runs the same guard, since a drop bypasses `accept` entirely.

                     TODO(3.2): two gaps are NOT fixable from here.
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
                    <label
                        class="tw:group/photo tw:block tw:size-full tw:cursor-pointer tw:overflow-hidden tw:rounded-lg"
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
                            <span class="tw:hidden tw:text-[0.6875rem] tw:text-navy-50 tw:sm:block">
                                or drop it here
                            </span>
                        </span>
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            capture="environment"
                            class="tw:hidden"
                            @change="onImage(s.id, $event)"
                        />
                    </label>
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
                    <!-- 3.1 (Slide 18) is the options below: the rubric's diagnoses, from
                         `displayText` on GET /models via core/helpers/classVocabulary.ts. Same
                         source as the answer-key importer, so what a student may pick and what an
                         instructor may author are the same set by construction.

                         TODO(3.1): one thing is still unsettled, and it is not a UI detail.
                         BE-ADR-018 is titled "Per-class display_text" but the implementation is
                         per-MODEL, in the manifest. "Matched to the instructor's rubric" reads
                         per-class. If the client means a vocabulary an instructor edits per class,
                         that is a schema change and an ADR amendment, and this list would read from
                         it instead. Confirm before anyone builds that. -->
                    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-1.5">
                        <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                            Your diagnosis
                        </label>

                        <!-- Buttons rather than a dropdown: five options on a phone are quicker to
                             tap than to open, and every option stays visible while the student
                             decides. shrink-0 so they keep their height when the row stretches -
                             the textarea below is the flexible one. -->
                        <div
                            v-if="diagnosisOptions.length > 0"
                            class="tw:flex tw:shrink-0 tw:flex-wrap tw:gap-1.5"
                            role="group"
                            aria-label="Diagnoses from the rubric"
                        >
                            <button
                                v-for="option in diagnosisOptions"
                                :key="option.code"
                                type="button"
                                class="tw:cursor-pointer tw:rounded-full tw:border tw:px-3 tw:py-1.5 tw:text-xs tw:transition-colors"
                                :class="
                                    answers[s.id]!.diagnosis.trim().toLowerCase() ===
                                    option.label.toLowerCase()
                                        ? 'tw:border-primary tw:bg-primary/10 tw:font-medium tw:text-primary'
                                        : 'tw:border-navy-20 tw:text-navy-70 tw:hover:border-primary tw:hover:text-primary'
                                "
                                @click="pickDiagnosis(s.id, option)"
                            >
                                {{ option.label }}
                            </button>
                        </div>

                        <!-- Still editable after a pick. This is the free-text escape that keeps
                             the instructor-review branch reachable, so it must not become
                             readonly. -->
                        <textarea
                            v-model="answers[s.id]!.diagnosis"
                            :placeholder="
                                diagnosisOptions.length > 0
                                    ? 'Pick one above, or type a different answer'
                                    : 'What is this slide?'
                            "
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
    </form>
</template>
