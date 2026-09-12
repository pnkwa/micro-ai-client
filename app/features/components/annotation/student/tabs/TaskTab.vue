<script setup lang="ts">
/**
 * The Task tab body: read it, then answer it.
 *
 * The brief leads; the assignment's `field_prompts` sit directly BELOW it, so the question and its
 * answer are one column rather than a separate tab. A `select` prompt with `options` renders as 44px
 * option chips (tap to answer, no one-handed typing with a specimen on screen); anything else is a
 * 46px input.
 *
 * At half/full (`expanded`) the brief shows in full and a primary "Start annotating" drops the
 * sheet to peek on Label, so the brief leads on first entry but never blocks. At peek the body is
 * just the brief and the answer inputs.
 */
import type { FieldPrompt } from '~/services/annotationAssignmentService'

const props = defineProps<{
    instructions: string | null | undefined
    fieldPrompts: FieldPrompt[]
    responses: Record<string, string> | null
    shapesCount: number
    /** Every required field on this image is answered. */
    hasDiagnosis: boolean
    /** The image is marked done. */
    done: boolean
    /** The sheet is above peek, so there is room for the full brief and the Start button. */
    expanded?: boolean
}>()

const emit = defineEmits<{
    'update-response': [key: string, value: string]
    start: []
    focus: []
}>()

const valueOf = (key: string) => props.responses?.[key] ?? ''
const isChips = (p: FieldPrompt) => p.type === 'select' && (p.options?.length ?? 0) > 0
</script>

<template>
    <div
        class="tw:flex tw:h-full tw:flex-col tw:gap-2.5 tw:overflow-y-auto tw:[touch-action:pan-y]"
    >
        <!-- The instruction detail sits ABOVE the answer inputs, in full (the body scrolls at peek)
             rather than clamped, so the student reads the whole task before answering it. -->
        <div class="tw:flex tw:flex-col tw:gap-1.5">
            <p class="tw:text-sm tw:font-semibold tw:text-an-n-700">Instructions</p>
            <p class="tw:whitespace-pre-line tw:text-[13.5px] tw:leading-normal tw:text-an-n-700">
                {{
                    instructions ||
                    'Box every finding you can identify, label it, and give the slide a diagnosis.'
                }}
            </p>
        </div>

        <!-- The questions, with each answer directly below its question. -->
        <div
            v-for="prompt in fieldPrompts"
            :key="prompt.key"
            class="tw:flex tw:shrink-0 tw:flex-col tw:gap-1.5"
        >
            <span
                class="tw:flex tw:items-center tw:gap-1 tw:text-[12.5px] tw:font-semibold tw:text-an-n-700"
            >
                {{ prompt.label }}
                <span v-if="prompt.required" class="tw:text-an-rose">*</span>
                <span v-else class="tw:text-[11px] tw:font-normal tw:text-an-faint">optional</span>
                <span
                    v-if="prompt.type === 'number'"
                    class="tw:ml-auto tw:rounded tw:bg-an-n-100 tw:px-1.5 tw:py-px tw:text-[10px] tw:font-normal tw:text-an-muted"
                >
                    number
                </span>
            </span>

            <div v-if="isChips(prompt)" class="tw:flex tw:flex-wrap tw:gap-2">
                <button
                    v-for="opt in prompt.options ?? []"
                    :key="opt"
                    type="button"
                    class="tw:flex tw:h-11 tw:items-center tw:rounded-[10px] tw:border tw:px-3.5 tw:text-[13.5px] tw:font-medium tw:transition-colors"
                    :class="
                        valueOf(prompt.key) === opt
                            ? 'tw:border-[1.5px] tw:border-an-accent tw:bg-an-accent-tint tw:text-an-accent-hover'
                            : 'tw:border-an-n-200 tw:bg-an-panel tw:text-an-n-700'
                    "
                    :aria-pressed="valueOf(prompt.key) === opt"
                    @click="emit('update-response', prompt.key, opt)"
                >
                    {{ opt }}
                </button>
            </div>

            <textarea
                v-else-if="prompt.type === 'textarea'"
                rows="2"
                :value="valueOf(prompt.key)"
                placeholder="Type your answer"
                class="tw:rounded-[10px] tw:border tw:border-an-n-200 tw:bg-an-n-50 tw:px-3 tw:py-2 tw:text-sm tw:outline-none tw:placeholder:text-an-faint tw:focus:border-an-accent"
                @focus="emit('focus')"
                @input="
                    emit(
                        'update-response',
                        prompt.key,
                        ($event.target as HTMLTextAreaElement).value,
                    )
                "
            />
            <input
                v-else
                :type="prompt.type === 'number' ? 'number' : 'text'"
                :inputmode="prompt.type === 'number' ? 'decimal' : undefined"
                :placeholder="prompt.type === 'number' ? 'Enter a number' : 'Type your answer'"
                :value="valueOf(prompt.key)"
                class="tw:h-11.5 tw:rounded-[10px] tw:border tw:border-an-n-200 tw:bg-an-n-50 tw:px-3 tw:text-sm tw:outline-none tw:placeholder:text-an-faint tw:focus:border-an-accent"
                @focus="emit('focus')"
                @input="
                    emit('update-response', prompt.key, ($event.target as HTMLInputElement).value)
                "
            />
        </div>

        <!-- Expanded only: the primary that ends the brief and drops the sheet to peek on Label. It
             follows the last field rather than pinning to the bottom, so the form reads as one block
             instead of leaving a dead gap between the answers and the button. -->
        <div v-if="expanded" class="tw:shrink-0 tw:pt-1">
            <McButton class="tw:w-full" @click="emit('start')">Start annotating</McButton>
        </div>
    </div>
</template>
