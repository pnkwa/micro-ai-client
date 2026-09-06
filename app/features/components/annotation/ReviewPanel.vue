<script setup lang="ts">
/**
 * The review screen's detail panel: the student's boxes and answers, the per-image remark and
 * approve/flag/incorrect verdict (staff) or the read-only verdict (student), and the overall
 * feedback. A view component (props in, events out) so it renders both docked and inside a drawer
 * on a tablet; the textareas emit their changes rather than mutating a prop.
 */
import { Check, Flag, X } from '@lucide/vue'
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
        ? 'tw:text-success'
        : status === 'flagged'
          ? 'tw:text-warning'
          : 'tw:text-danger'
const verdictIcon = (status: string) =>
    status === 'approved' ? Check : status === 'flagged' ? Flag : X
</script>

<template>
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-3 tw:overflow-y-auto tw:p-3">
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
            <p v-if="!(current?.annotations.length ?? 0)" class="tw:text-[11.5px] tw:text-an-faint">
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
            <div class="tw:text-[12.5px] tw:font-semibold tw:text-an-text">Student's answers</div>
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
                                emit('set-mark', p.key, ($event.target as HTMLInputElement).checked)
                            "
                        />
                        Correct ({{ p.points ?? 1 }} pt)
                    </label>
                    <span
                        v-else-if="!isStaff && (isGraded || isRejected)"
                        class="tw:ml-auto tw:shrink-0 tw:text-[11px] tw:font-medium"
                        :class="current.field_marks?.[p.key] ? 'tw:text-success' : 'tw:text-danger'"
                    >
                        {{
                            current.field_marks?.[p.key] ? `Correct +${p.points ?? 1}` : 'Incorrect'
                        }}
                    </span>
                </template>
            </div>
        </div>

        <!-- staff: remark + approve/flag/incorrect (only for an image the student worked) -->
        <div
            v-if="isStaff && current"
            class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-an-border tw:bg-white tw:p-3"
        >
            <div class="tw:text-[12.5px] tw:font-medium tw:text-an-text">Remark on this field</div>
            <textarea
                rows="4"
                :value="remark"
                :disabled="isGraded || isRejected"
                placeholder="What the student should notice on this image…"
                class="tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:py-2 tw:text-sm tw:outline-none tw:focus:border-an-accent tw:disabled:opacity-60"
                @input="emit('update-remark', ($event.target as HTMLTextAreaElement).value)"
            />
            <div class="tw:flex tw:items-center tw:gap-2">
                <McButton
                    variant="outline"
                    size="sm"
                    class="tw:border-success tw:text-success"
                    :disabled="savingField || isGraded || isRejected"
                    @click="emit('review', 'approved')"
                >
                    <Check class="tw:mr-1 tw:size-4" />
                    Approve
                </McButton>
                <McButton
                    variant="outline"
                    size="sm"
                    class="tw:border-warning tw:text-warning"
                    :disabled="savingField || isGraded || isRejected"
                    @click="emit('review', 'flagged')"
                >
                    <Flag class="tw:mr-1 tw:size-4" />
                    Flag
                </McButton>
                <McButton
                    variant="outline"
                    size="sm"
                    class="tw:border-danger tw:text-danger"
                    :disabled="savingField || isGraded || isRejected"
                    @click="emit('review', 'incorrect')"
                >
                    <X class="tw:mr-1 tw:size-4" />
                    Incorrect
                </McButton>
                <span
                    v-if="current.review_status !== 'unreviewed'"
                    class="tw:ml-auto tw:text-[11px] tw:capitalize"
                    :class="verdictColor(current.review_status)"
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

        <!-- overall feedback -->
        <div
            class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-an-border tw:bg-white tw:p-3"
        >
            <div class="tw:text-[12.5px] tw:font-medium tw:text-an-text">Overall feedback</div>
            <textarea
                v-if="isStaff"
                rows="3"
                :value="feedback"
                :disabled="isGraded || isRejected"
                placeholder="Summary the student sees on their feedback page…"
                class="tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:py-2 tw:text-sm tw:outline-none tw:focus:border-an-accent tw:disabled:opacity-60"
                @input="emit('update-feedback', ($event.target as HTMLTextAreaElement).value)"
            />
            <p v-else class="tw:text-[12px] tw:text-an-n-700">
                {{ submissionFeedback || 'No overall feedback yet.' }}
            </p>
            <p
                v-if="!isStaff && isRejected && rejectionReason"
                class="tw:text-[12px] tw:text-danger"
            >
                Returned: {{ rejectionReason }}
            </p>
        </div>
    </div>
</template>
