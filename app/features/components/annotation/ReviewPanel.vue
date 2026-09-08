<script setup lang="ts">
/**
 * The review screen's detail panel: the student's boxes and answers, the per-image remark and
 * approve/flag/incorrect verdict (staff) or the read-only verdict (student). Overall feedback is
 * pinned at the foot as its own card, labelled assignment-scoped so it never reads as a second remark
 * on the current image. A view component (props in, events out) so it renders both docked and inside
 * a drawer on a tablet; the textareas emit their changes rather than mutating a prop.
 */
import { Check, ChevronDown, Flag, X } from '@lucide/vue'
import { reviewBoxColor } from '~/core/helpers/annotationClasses'
import type { FieldPrompt, SubmissionField } from '~/services/annotationAssignmentService'

const props = defineProps<{
    current: SubmissionField | null
    prompts: FieldPrompt[]
    labelColors: Record<string, string>
    isStaff: boolean
    isGraded: boolean
    isRejected: boolean
    savingField: boolean
    remark: string
    feedback: string
    submissionFeedback: string | null
    rejectionReason: string | null
    fieldMarks: Record<string, boolean>
}>()

const emit = defineEmits<{
    'update-remark': [value: string]
    'update-feedback': [value: string]
    'set-mark': [key: string, correct: boolean]
    review: [status: 'approved' | 'flagged' | 'incorrect']
}>()

const responseText = (key: string) => {
    const v = props.current?.responses[key]
    return v === undefined || v === null || v === '' ? '-' : String(v)
}

const verdictColor = (status: string) =>
    status === 'approved'
        ? 'tw:text-an-accent-hover'
        : status === 'flagged'
          ? 'tw:text-an-warn'
          : 'tw:text-an-rose'
const verdictIcon = (status: string) =>
    status === 'approved' ? Check : status === 'flagged' ? Flag : X

// The verdict dot beside the "Student's boxes" heading, once the image has one.
const verdictDot = (status: string) =>
    status === 'approved'
        ? 'tw:bg-an-accent-hover'
        : status === 'flagged'
          ? 'tw:bg-an-warn'
          : status === 'incorrect'
            ? 'tw:bg-an-rose'
            : 'tw:bg-an-n-300'

// The segmented control's three options. `on` styling fills the option in its own colour at ~12%
// with a 1px ring, so a reviewed image no longer looks identical to an unreviewed one.
const verdicts = [
    {
        key: 'approved',
        label: 'Approve',
        icon: Check,
        on: 'tw:bg-an-accent-tint tw:text-an-accent-hover tw:ring-1 tw:ring-an-accent/50',
    },
    {
        key: 'flagged',
        label: 'Flag',
        icon: Flag,
        on: 'tw:bg-an-warn-tint tw:text-an-warn tw:ring-1 tw:ring-an-warn/45',
    },
    {
        key: 'incorrect',
        label: 'Incorrect',
        icon: X,
        on: 'tw:bg-an-rose-tint tw:text-an-rose tw:ring-1 tw:ring-an-rose/45',
    },
] as const

// Overall feedback is collapsible but always present in the footer.
const feedbackOpen = ref(true)
</script>

<template>
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <!-- scrollable: per-image detail -->
        <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-3 tw:overflow-y-auto tw:p-3">
            <!-- student's boxes -->
            <div
                class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-an-border tw:bg-white tw:p-3"
            >
                <div
                    class="tw:flex tw:items-center tw:gap-2 tw:text-[12.5px] tw:font-semibold tw:text-an-text"
                >
                    Student's boxes ({{ current?.annotations.length ?? 0 }})
                    <span
                        v-if="current && current.review_status !== 'unreviewed'"
                        class="tw:size-2 tw:rounded-full"
                        :class="verdictDot(current.review_status)"
                        :title="current.review_status"
                    />
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
                        {{ current ? responseText(p.key) : '-' }}
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
                                :checked="!!fieldMarks[p.key]"
                                @change="
                                    emit(
                                        'set-mark',
                                        p.key,
                                        ($event.target as HTMLInputElement).checked,
                                    )
                                "
                            />
                            Correct ({{ p.points ?? 1 }} pt)
                        </label>
                        <span
                            v-else-if="!isStaff && (isGraded || isRejected)"
                            class="tw:ml-auto tw:shrink-0 tw:text-[11px] tw:font-medium"
                            :class="
                                current.field_marks?.[p.key]
                                    ? 'tw:text-an-accent-hover'
                                    : 'tw:text-an-rose'
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

            <!-- staff: remark + verdict segmented control (only for an image the student worked) -->
            <div
                v-if="isStaff && current"
                class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-an-border tw:bg-white tw:p-3"
            >
                <div class="tw:text-[12.5px] tw:font-medium tw:text-an-text">
                    Remark on this image
                </div>
                <textarea
                    rows="3"
                    :value="remark"
                    :disabled="isGraded || isRejected"
                    placeholder="What the student should notice on this image…"
                    class="tw:max-h-[132px] tw:min-h-[68px] tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:py-2 tw:text-sm tw:outline-none tw:focus:border-an-accent tw:disabled:opacity-60"
                    style="field-sizing: content"
                    @input="emit('update-remark', ($event.target as HTMLTextAreaElement).value)"
                />
                <div class="tw:flex tw:gap-1.5">
                    <button
                        v-for="v in verdicts"
                        :key="v.key"
                        type="button"
                        class="tw:flex tw:h-8 tw:flex-1 tw:items-center tw:justify-center tw:gap-1 tw:rounded-[7px] tw:text-[12px] tw:font-medium tw:transition-colors tw:disabled:opacity-50"
                        :class="
                            current.review_status === v.key
                                ? v.on
                                : 'tw:border tw:border-an-n-200 tw:text-an-n-600 tw:hover:bg-an-n-50'
                        "
                        :disabled="savingField || isGraded || isRejected"
                        @click="emit('review', v.key)"
                    >
                        <component :is="v.icon" class="tw:size-4" />
                        {{ v.label }}
                    </button>
                </div>
            </div>

            <!-- student: read-only verdict + remark for this field -->
            <div
                v-else-if="current && current.review_status !== 'unreviewed'"
                class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-an-border tw:bg-white tw:p-3"
            >
                <div class="tw:flex tw:items-center tw:gap-2 tw:text-[12.5px] tw:font-medium">
                    <span :class="verdictColor(current.review_status)">
                        <component
                            :is="verdictIcon(current.review_status)"
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
        </div>

        <!-- pinned footer: overall feedback, collapsible and assignment-scoped -->
        <div class="tw:shrink-0 tw:border-t tw:border-an-divider tw:bg-an-chrome tw:p-3">
            <button
                type="button"
                class="tw:flex tw:w-full tw:items-center tw:gap-2 tw:text-left"
                :aria-expanded="feedbackOpen"
                @click="feedbackOpen = !feedbackOpen"
            >
                <span class="tw:text-[12.5px] tw:font-medium tw:text-an-text">
                    Overall feedback
                </span>
                <span class="tw:font-mono tw:text-[10.5px] tw:text-an-faint">· assignment</span>
                <div class="tw:flex-1"></div>
                <ChevronDown
                    class="tw:size-4 tw:text-an-faint tw:transition-transform"
                    :class="feedbackOpen ? '' : 'tw:-rotate-90'"
                />
            </button>
            <div v-if="feedbackOpen" class="tw:mt-2">
                <textarea
                    v-if="isStaff"
                    rows="3"
                    :value="feedback"
                    :disabled="isGraded || isRejected"
                    placeholder="Summary the student sees on their feedback page…"
                    class="tw:w-full tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:py-2 tw:text-sm tw:outline-none tw:focus:border-an-accent tw:disabled:opacity-60"
                    @input="emit('update-feedback', ($event.target as HTMLTextAreaElement).value)"
                />
                <p v-else class="tw:text-[12px] tw:text-an-n-700">
                    {{ submissionFeedback || 'No overall feedback yet.' }}
                </p>
                <p
                    v-if="!isStaff && isRejected && rejectionReason"
                    class="tw:mt-1 tw:text-[12px] tw:text-an-rose"
                >
                    Returned: {{ rejectionReason }}
                </p>
            </div>
        </div>
    </div>
</template>
