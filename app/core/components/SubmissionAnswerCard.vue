<script setup lang="ts">
import { Check, Contrast, ImageOff, TriangleAlert, X } from '@lucide/vue'
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
     * The SLIDE's accepted answers, for slide_identification only.
     *
     * That type's key lives per-slide in the collection (BE-ADR-011), never on the question, so
     * `accepted_answers` below is empty for it by construction and the grader was left comparing a
     * diagnosis against nothing. The page looks the slide up by the label the student reported and
     * passes what it found; undefined means "not looked up", empty means "that slide has no key".
     *
     * Staff-only, like `showAnswerKey`, and gated on it for the same reason.
     */
    slideAnswerKey?: string[]
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
/**
 * Correct, partly correct, or wrong - THREE outcomes, because the grader has three.
 *
 * `multiple_select` is graded on capped-proportional credit: points x (right picks / key size), and
 * `is_correct` is true only for an exact match. So one right out of two scores half a mark and is
 * "incorrect", which put "Incorrect" beside "0.5 / 1 pt" on the same row - two statements that
 * contradict each other, and the one in words is the one people believe.
 *
 * Read off the POINTS rather than off the type: a fill_in an instructor gave half marks to is the
 * same situation, and keying on the question type would have said the right thing for one of them
 * and the wrong thing for the other.
 */
const verdict = computed<'correct' | 'partial' | 'incorrect' | null>(() => {
    const answer = props.answer
    if (answer.is_correct === null || answer.is_correct === undefined) return null
    if (answer.is_correct) return 'correct'
    const awarded = answer.points_awarded ?? 0
    return awarded > 0 && awarded < answer.question.points ? 'partial' : 'incorrect'
})

const verdictLabel = computed(() =>
    verdict.value === 'correct'
        ? 'Correct'
        : verdict.value === 'partial'
          ? 'Partly correct'
          : 'Incorrect',
)

const verdictClass = computed(() =>
    verdict.value === 'correct'
        ? 'tw:text-success'
        : verdict.value === 'partial'
          ? 'tw:text-warning'
          : 'tw:text-danger',
)

/**
 * What happened to ONE option, FOR A READER WHO HAS BEEN TOLD.
 *
 * Three states, and the third is the one a bare tick list loses: an option that WAS the answer and
 * was not picked. Someone reading "you got half" needs to know which half they missed, not only
 * which pick was wrong.
 *
 * *** NOTHING HERE IS DERIVED FROM THE SCORE. *** An earlier version marked a student's own picks
 * from the verdict alone, which works at the two extremes and fails in the middle: capped
 * proportional credit gives `right picks / key size`, one equation in two unknowns, so a half mark
 * cannot say WHICH pick counted or even how many. That left a third glyph meaning "one of these
 * was right and I cannot tell you which", beside options the reader was already looking at. It said
 * less than the verdict in the corner and cost more attention to read, so it is gone: a mark here
 * now means the page was HANDED the fact, by the key (staff) or by `correct_selected_options`, and
 * an unmarked option means nothing is claimed about it.
 */
const optionState = (option: string): 'right' | 'wrong' | 'missed' | null => {
    const answer = props.answer
    const picked = answer.selected_options.includes(option)

    // With the key in hand - staff, or a student on a released assignment - every option can be
    // named, including the one that WAS an answer and was not picked.
    if (props.showAnswerKey) {
        const key = answer.question.accepted_answers ?? []
        const inKey = key.includes(option)
        if (picked && inKey) return 'right'
        if (picked) return 'wrong'
        return inKey ? 'missed' : null
    }

    /*
     * Without the key, the server can still mark the student's OWN picks: `correct_selected_options`
     * is the subset of them that counted. Where it is present every pick is ticked or crossed, the
     * partial case included, and an option they did not pick still says nothing, because that half
     * IS the key. Absent today (requested in `.claude/backend-request-2026-08-31-grading-feedback.md`),
     * so a student's page currently marks no options at all and lets the verdict speak.
     */
    if (answer.correct_selected_options) {
        if (!picked) return null
        return answer.correct_selected_options.includes(option) ? 'right' : 'wrong'
    }

    return null
}

const isChoice = computed(
    () =>
        props.answer.question.type === 'multiple_choice' ||
        props.answer.question.type === 'multiple_select',
)
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

/**
 * ...and so does the verdict, on the page where nothing fills that slot.
 *
 * Same row, same reason: the corner chip forced `pt-14` on an image card, which on a slide answer
 * put a band of empty box between "Incorrect" and the one line of text it is about. Inline it sits
 * at the end of the row it judges, where the grader's tick/cross pair sits on the other page.
 */
const verdictInline = computed(() => isSlide.value && !slots.marks)

// The mark buttons are absolutely positioned in the box's corner, so the content has to
// keep clear of them: a one-line text answer reserves a gutter beside them, an image
// answer is far too wide for that and starts below instead. Keyed off the slot actually
// being filled rather than a separate prop, so the two can never disagree.
const clearanceClass = computed(() => {
    // The verdict chip needs the same corner clearance the marks controls do: it is the same
    // corner, and text running under it reads as a rendering fault rather than as a tight fit. It
    // only appears where there are NO controls, so its gutter is reserved only there, and sized
    // for "Partly correct" - the widest of the three - rather than for whichever is on screen.
    if (!slots.marks) {
        if (props.answer.is_correct == null || verdictInline.value) return ''
        return isImage.value ? 'tw:pt-14' : 'tw:pr-28'
    }
    if (marksInline.value) return ''
    return isImage.value ? 'tw:pt-14' : 'tw:pr-28'
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

            <!--
                THE VERDICT, SAID IN WORDS, WHERE NOTHING ELSE MARKS THE ANSWER.

                The grading page fills the `marks` slot with its own controls; a student's page
                fills nothing, and a tinted border was the only thing telling them how they did.

                *** NEVER ALONGSIDE THE CONTROLS, including the slide answer's inline pair. *** A
                grader looking at a tick/cross pair does not need a label repeating what it is
                currently set to, and on a slide answer the two sat in the same corner saying the
                same thing twice.
                Colour alone is a poor way to say "wrong": it is the first thing lost to a
                colour-blind reader, to a printout, and to anyone who has not learnt that this
                particular green means what it means here.

                Only once there IS a verdict. `is_correct` is null until the work is graded - the
                server nulls it on anything unpublished - so an ungraded answer says nothing rather
                than implying a mark nobody has given.
            -->
            <div
                v-else-if="verdict && !slots.marks && !verdictInline"
                class="tw:absolute tw:top-3 tw:right-3 tw:flex tw:items-center tw:gap-1"
                :class="verdictClass"
            >
                <component
                    :is="verdict === 'correct' ? Check : verdict === 'partial' ? Contrast : X"
                    class="tw:size-4"
                />
                <span class="tw:text-xs tw:font-semibold">{{ verdictLabel }}</span>
            </div>

            <!--
                Exam slide answer: what the student reported (the number and the written diagnosis)
                on ONE line above the photo + AI panel below.

                Both halves are the same short fact about the same answer - "Slide V7", "TV" - and
                stacking them spent a second line on a few characters while pushing the photo down.
                flex-wrap, so the pair still breaks onto two lines when a long diagnosis or a narrow
                phone leaves no room, rather than squeezing the tag.
            -->
            <div
                v-if="isSlide"
                class="tw:mb-3 tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-1.5"
            >
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
                <p class="tw:text-sm tw:text-navy-90">
                    <span class="tw:text-navy-40">Diagnosis:</span>
                    {{ answer.response_text || '-' }}
                </p>
                <!-- ml-auto, so they sit at the far end of the row however short the label
                     and diagnosis are, which is where the corner-pinned pair used to be. -->
                <div
                    v-if="marksInline"
                    class="tw:ml-auto tw:flex tw:shrink-0 tw:items-center tw:gap-1.5"
                >
                    <slot name="marks" />
                </div>
                <!-- The student's page fills no slot, so the same far end of the row carries the
                     verdict in words instead. Only one of the two ever renders. -->
                <div
                    v-else-if="verdict"
                    class="tw:ml-auto tw:flex tw:shrink-0 tw:items-center tw:gap-1"
                    :class="verdictClass"
                >
                    <component
                        :is="verdict === 'correct' ? Check : verdict === 'partial' ? Contrast : X"
                        class="tw:size-4"
                    />
                    <span class="tw:text-xs tw:font-semibold">{{ verdictLabel }}</span>
                </div>
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

            <!--
                EVERY OPTION, with the student's pick marked - not just a list of what they chose.

                "Answer: Trichomoniasis" tells someone reviewing their work what they said and
                nothing about what they were asked. The options are the question on a choice type,
                and reading a mark without them means holding the paper in one hand and the form in
                the other. The controls are the same native radio and checkbox the form used, so
                the review reads as the thing that was answered.

                The KEY is not shown here. `accepted_answers` is stripped from every student read
                server-side, so the correct option is marked only where the page already reveals it
                (`showAnswerKey`, staff), and a student sees their own answer and its verdict.
            -->
            <div v-else-if="isChoice" class="tw:flex tw:flex-col tw:gap-1 tw:pr-8">
                <div
                    v-for="opt in answer.question.options"
                    :key="opt"
                    class="tw:flex tw:items-center tw:gap-2.5"
                >
                    <input
                        :type="answer.question.type === 'multiple_choice' ? 'radio' : 'checkbox'"
                        :checked="answer.selected_options.includes(opt)"
                        class="tw:pointer-events-none tw:size-4 tw:shrink-0 tw:accent-primary"
                        tabindex="-1"
                        aria-hidden="true"
                    />
                    <span
                        class="tw:text-sm"
                        :class="
                            answer.selected_options.includes(opt)
                                ? 'tw:font-medium tw:text-navy-100'
                                : 'tw:text-navy-60'
                        "
                    >
                        {{ opt }}
                    </span>
                    <!--
                        The mark sits BESIDE THE CHOICE, which is where someone reads it: an answer
                        row that says nothing next to a box you ticked leaves the eye to travel to
                        a chip in the corner and back for every option. It draws ONLY where
                        `optionState` was told the truth, so on a student's page today every row is
                        bare and the verdict in the corner carries the whole message.

                        `missed` carries a word as well as a colour, because it is the one state
                        that is not self-evident from the control: the box is empty and the mark is
                        saying it should not have been.
                    -->
                    <Check
                        v-if="optionState(opt) === 'right'"
                        class="tw:size-4 tw:shrink-0 tw:text-success"
                        aria-label="correct"
                    />
                    <X
                        v-else-if="optionState(opt) === 'wrong'"
                        class="tw:size-4 tw:shrink-0 tw:text-danger"
                        aria-label="wrong"
                    />
                    <span
                        v-else-if="optionState(opt) === 'missed'"
                        class="tw:inline-flex tw:shrink-0 tw:items-center tw:gap-1 tw:rounded tw:bg-warning/10 tw:px-1.5 tw:py-0.5 tw:text-[10px] tw:font-medium tw:text-warning"
                    >
                        <Check class="tw:size-3" />
                        missed
                    </span>
                </div>
                <p
                    v-if="!answer.selected_options.length"
                    class="tw:text-sm tw:text-navy-40 tw:italic"
                >
                    Nothing selected.
                </p>
            </div>

            <div v-else class="tw:pr-8 tw:text-sm tw:text-navy-80">
                <span class="tw:text-navy-40">Answer:</span>
                {{ answer.response_text ?? '-' }}
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

        <!--
            The slide's own key, which is the only key a slide question has. Named after the slide
            it came from, because the grader has to know WHICH slide it is the key for: the student
            chose that label themselves, and a wrong label with a right-looking diagnosis is exactly
            the case this line exists to make visible.
        -->
        <p v-else-if="showAnswerKey && isSlide" class="tw:text-xs tw:text-navy-50">
            <template v-if="slideAnswerKey?.length">
                Accepted for slide {{ slideLabel }}: {{ answerLabel(slideAnswerKey) }}
            </template>
            <template v-else-if="slideUnresolved">
                No key: "{{ answer.slide_number_raw }}" is not a label in the collection.
            </template>
            <template v-else-if="slideAnswerKey">
                Slide {{ slideLabel }} has no accepted answers recorded.
            </template>
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
