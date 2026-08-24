<script setup lang="ts">
import { TriangleAlert, ImageOff } from '@lucide/vue'
import type { GradingAnswer } from '~/services/submissionService'

/**
 * One answer on a submission: the question, what the student put, and how it was marked.
 * Shared by the instructor's grading page and the student's feedback page.
 *
 * DEFAULTS TO THE STUDENT'S VIEW ON PURPOSE. Everything an instructor gets and a student
 * must not (the mark buttons, the editable score, the answer key, the feedback editor)
 * is opt-in, either a slot the grading page fills or a prop it sets. A forgotten slot
 * therefore renders less, not more; the earlier single-page version defaulted the other
 * way and leaked grader-only text to students twice before it was caught.
 */
const props = defineProps<{
    answer: GradingAnswer
    /** "1.4": exercise.question, matching the authoring view. */
    label: string
    /** Object URL for an image_detection answer's submitted photo. */
    imageUrl?: string
    /**
     * Why the photo is missing, when it is. An answer that HAS an image_id but no URL is a load
     * that failed, which is different from an answer that never carried a picture, and since v0.7
     * a refusal is as likely as a missing file (BE-ADR-031). Without this the card renders a gap
     * and a grader cannot tell "no photo submitted" from "I am not allowed to see it".
     */
    imageError?: string
    /** Tint for the response box (correct/incorrect/neutral). */
    tintClass?: string
    /** Emphasises the card border, e.g. an answer the grader still has to mark. */
    highlight?: boolean
    /** Reveals `accepted_answers`. Never set this on a student-facing page. */
    showAnswerKey?: boolean
    /**
     * Flags an answer the system could not decide (`needs_review`), so the grader can see WHICH
     * card is holding up Finalize rather than only being told that one is. Opt-in and
     * grader-only, like `showAnswerKey`: to a student "needs review" is an unexplained warning
     * on work they have already handed in and cannot act on.
     */
    showReviewFlag?: boolean
}>()

const slots = defineSlots<{
    /** Replaces the read-only points readout (the grading page puts its input here). */
    points?: () => unknown
    /** Correct/Incorrect controls, pinned in the response box's corner. */
    marks?: () => unknown
    /** Grader-only notes rendered under the response box. */
    notes?: () => unknown
    /** Replaces the read-only instructor comment (the grading page puts its editor here). */
    footer?: () => unknown
}>()

const answerLabel = (options: string[]): string => (options.length ? options.join(', ') : '-')

// Both types carry a submitted photo and a detection run; the exam slide question adds a
// self-reported slide number and a written diagnosis on top. (For exam students the server
// strips the detection, but this card is staff-grading only for slide answers - BE-ADR-012.)
const isSlide = computed(() => props.answer.question.type === 'slide_identification')
const isImage = computed(() => props.answer.question.type === 'image_detection' || isSlide.value)

/**
 * The slide label to put in front of the grader, and whether it is one the system could resolve.
 *
 * `slide_number` is the canonical form and is null whenever the student's entry fell outside the
 * (provisional) pattern. That answer is precisely the one routed to a human (BE-ADR-017), so
 * falling back to `slide_number_raw` is what lets the grader read what the student wrote and check
 * it against the slide in front of them, instead of grading a blank.
 */
const slideLabel = computed(() => props.answer.slide_number ?? props.answer.slide_number_raw ?? '-')
const slideUnresolved = computed(
    () => props.answer.slide_number == null && !!props.answer.slide_number_raw,
)

const detection = computed(() => props.answer.detection ?? null)
const steps = computed(() => detection.value?.steps ?? [])

/**
 * A slide answer puts the mark buttons ON the slide row instead of in the corner.
 *
 * That row is one short tag ("Slide V7") with the whole width to its right, so pinning the
 * buttons above it bought nothing and cost a band of empty box: the clearance below reserves
 * 3.5rem of top padding for them, which on a slide card is a gap between the buttons and the
 * only line of text they belong to. Inline, they read as the verdict on that answer and the row
 * carries itself.
 */
const marksInline = computed(() => isSlide.value && !!slots.marks)

// The mark buttons are absolutely positioned in the box's corner, so the content has to
// keep clear of them: a one-line text answer reserves a gutter beside them, an image
// answer is far too wide for that and starts below instead. Keyed off the slot actually
// being filled rather than a separate prop, so the two can never disagree.
const clearanceClass = computed(() => {
    if (!slots.marks || marksInline.value) return ''
    return isImage.value ? 'tw:pt-14' : 'tw:pr-20'
})
</script>

<template>
    <div
        class="tw:bg-white tw:border tw:rounded-xl tw:p-6 tw:flex tw:flex-col tw:gap-4 tw:transition-colors"
        :class="highlight ? 'tw:border-warning/40' : 'tw:border-navy-10'"
    >
        <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
            <!--
                items-baseline, not items-start: the label is text-sm and the prompt text-base, so
                aligning their boxes leaves the number floating above the sentence it numbers. The
                baseline is the line a reader actually sees them sitting on. With a prompt that
                wraps it is the FIRST line's baseline, which is the one the number belongs to.
            -->
            <div class="tw:min-w-0 tw:flex tw:items-baseline tw:gap-2.5">
                <span
                    class="tw:shrink-0 tw:text-sm tw:font-semibold tw:text-navy-60 tw:tabular-nums"
                >
                    {{ label }}
                </span>
                <p class="tw:text-base tw:font-medium tw:text-navy-100">
                    {{ answer.question.prompt }}
                </p>
                <!--
                    A sibling of the prompt, not a span inside it: inline, a prompt long enough to
                    fill the line pushed this onto a line of its own, which is where a station
                    prompt ends up every time. As a flex child it stays on the row and the prompt
                    wraps around it instead. shrink-0 so it is the text that gives way, never the
                    warning. The row aligns on the baseline, so it needs no vertical nudge.
                -->
                <span
                    v-if="showReviewFlag && answer.needs_review"
                    class="tw:inline-flex tw:shrink-0 tw:items-center tw:gap-1 tw:rounded tw:bg-warning/10 tw:px-1.5 tw:py-0.5 tw:text-xs tw:font-medium tw:text-warning"
                >
                    <TriangleAlert class="tw:size-3.5" />
                    Needs your review
                </span>
            </div>
            <slot name="points">
                <span
                    class="tw:shrink-0 tw:text-sm tw:font-semibold tw:text-navy-70 tw:tabular-nums"
                >
                    {{ answer.points_awarded ?? '-' }} / {{ answer.question.points }} pt
                </span>
            </slot>
        </div>

        <!-- Response box: the answer, with the Correct/Incorrect pair pinned in its
             corner, the Google Forms "quiz" review pattern. -->
        <div
            class="tw:relative tw:rounded-lg tw:border tw:p-4 tw:transition-colors"
            :class="[tintClass, clearanceClass]"
        >
            <div
                v-if="slots.marks && !marksInline"
                class="tw:absolute tw:top-3 tw:right-3 tw:flex tw:items-center tw:gap-1.5"
            >
                <slot name="marks" />
            </div>

            <!-- Exam slide answer: what the student reported (the number and the written
                 diagnosis) sits above the photo + AI panel below. -->
            <div v-if="isSlide" class="tw:mb-3 tw:flex tw:flex-col tw:gap-1.5">
                <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                    <span
                        class="tw:inline-flex tw:items-center tw:rounded tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium"
                        :class="
                            slideUnresolved
                                ? 'tw:bg-warning/10 tw:text-warning'
                                : 'tw:bg-navy-10 tw:text-navy-70'
                        "
                    >
                        Slide {{ slideLabel }}
                    </span>
                    <!-- Says why the label is tinted, and reads the same way to both audiences
                         this card serves: the grader learns why the answer is waiting on them,
                         the student learns why their entry did not land. -->
                    <span v-if="slideUnresolved" class="tw:text-xs tw:text-navy-50">
                        no slide matched this label
                    </span>
                    <!-- ml-auto, so they sit at the far end of the row however short the label
                         is, which is where the corner-pinned pair used to be. -->
                    <div
                        v-if="marksInline"
                        class="tw:ml-auto tw:flex tw:shrink-0 tw:items-center tw:gap-1.5"
                    >
                        <slot name="marks" />
                    </div>
                </div>
                <p class="tw:text-sm tw:text-navy-90">
                    <span class="tw:text-navy-40">Diagnosis:</span>
                    {{ answer.response_text || '-' }}
                </p>
            </div>

            <McDetectionFilterScope
                v-if="isImage"
                :steps="steps"
                class="tw:flex tw:flex-col tw:gap-4 tw:lg:flex-row tw:lg:items-start"
            >
                <!--
                    `fill`, so the frame is the picture's own shape. Without it the image is fitted
                    into a fixed band against slate-950, which on a portrait phone photo means two
                    black pillars either side of the only thing on the card worth looking at.

                    Bounded by WIDTH, not height: with `fill` the height follows the aspect ratio,
                    so a cap on it would crop rather than scale. max-w-md keeps a portrait frame
                    from running past the answer beneath it while leaving a landscape field of view
                    big enough to grade from. Core utilities, not arbitrary values - a class that
                    only ever appears in a script constant is never emitted, which is how a height
                    silently did nothing earlier in this work.
                -->
                <div
                    v-if="!imageUrl && imageError"
                    class="tw:flex tw:w-full tw:max-w-md tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-dashed tw:border-navy-20 tw:bg-navy-5 tw:p-4 tw:lg:min-w-0 tw:lg:flex-1"
                >
                    <ImageOff class="tw:size-4 tw:shrink-0 tw:text-navy-50" />
                    <span class="tw:text-sm tw:text-navy-60">{{ imageError }}</span>
                </div>
                <McAnnotatedImage
                    v-else-if="imageUrl"
                    :src="imageUrl"
                    fill
                    class="tw:w-full tw:max-w-md tw:lg:min-w-0 tw:lg:flex-1"
                />
                <div
                    v-if="detection"
                    class="tw:w-full tw:lg:w-64 tw:lg:shrink-0 tw:flex tw:flex-col tw:gap-2"
                >
                    <!-- Keyed off steps, not the row: a detection can exist with none (a model
                         that ran and found nothing), and "Model: x" over an empty panel reads
                         as though x produced something. -->
                    <template v-if="steps.length">
                        <span class="tw:text-xs tw:text-navy-50">
                            Model:
                            <span class="tw:text-sm tw:text-navy-70">{{ detection.model }}</span>
                        </span>
                        <McConfidenceBar
                            v-for="step in steps"
                            :key="step.id"
                            :label="step.predicted_class"
                            :confidence="step.confidence"
                        />
                        <p v-if="steps[0]" class="tw:text-[11px] tw:text-navy-40">
                            Scored from the
                            <span class="tw:text-sm tw:text-primary">{{ steps[0].step }}</span>
                            step. The other step, if any, doesn't affect the grade.
                        </p>
                        <McDetectionFilters class="tw:mt-1 tw:border-t tw:border-navy-15 tw:pt-3" />
                    </template>

                    <div v-else class="tw:flex tw:flex-col tw:gap-1">
                        <span class="tw:text-xs tw:font-medium tw:text-navy-70">No AI result</span>
                        <p class="tw:text-[11px] tw:leading-relaxed tw:text-navy-40">
                            The model found nothing in this image. Grade from the image directly.
                        </p>
                    </div>
                </div>
            </McDetectionFilterScope>

            <div v-else class="tw:pr-8 tw:text-sm tw:text-navy-80">
                <span class="tw:text-navy-40">Answer:</span>
                {{
                    answer.question.type === 'fill_in'
                        ? (answer.response_text ?? '-')
                        : answerLabel(answer.selected_options)
                }}
            </div>
        </div>

        <slot name="notes" />

        <p
            v-if="showAnswerKey && answer.question.accepted_answers?.length"
            class="tw:text-xs tw:text-navy-50"
        >
            {{ isImage ? 'Expected' : 'Accepted' }}:
            {{ answerLabel(answer.question.accepted_answers) }}
        </p>

        <slot name="footer">
            <div
                v-if="answer.comment"
                class="tw:flex tw:flex-col tw:gap-1 tw:border-t tw:border-navy-10 tw:pt-3"
            >
                <span class="tw:text-xs tw:font-medium tw:text-navy-60">Instructor feedback</span>
                <p class="tw:text-sm tw:text-navy-80 tw:whitespace-pre-line">
                    {{ answer.comment }}
                </p>
            </div>
        </slot>
    </div>
</template>
