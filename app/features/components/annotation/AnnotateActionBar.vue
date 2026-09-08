<script setup lang="ts">
/**
 * The student's compact action bar (phone). It carries what the annotator's sheet handle carries: a
 * `Your labels N` summary with the current image's class dots on the left, then Mark done and Skip as
 * 44px targets on the right. Tapping the summary (or the grabber) opens the labels sheet — this is
 * the only forward-committing bar on the phone, so status lives here and position lives on the
 * filmstrip, the same split the desktop keeps.
 */
import { Check, ChevronUp, SkipForward } from '@lucide/vue'

defineProps<{
    labelCount: number
    /** Distinct class colours on the current image, as dots (max four). */
    dots: string[]
    status: 'pending' | 'completed' | 'skipped' | null
    allowSkip: boolean
}>()

const emit = defineEmits<{ 'open-labels': []; 'mark-done': []; skip: [] }>()
</script>

<template>
    <div
        class="tw:flex tw:h-[68px] tw:shrink-0 tw:items-center tw:gap-2 tw:border-t tw:border-an-border tw:bg-an-panel tw:px-3 tw:pb-[env(safe-area-inset-bottom)] tw:[touch-action:pan-x_pan-y]"
    >
        <!-- Your labels: taps open the labels sheet (the grabber says it lifts). -->
        <button
            type="button"
            class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:items-start tw:gap-1 tw:text-left"
            aria-label="Open labels"
            @click="emit('open-labels')"
        >
            <ChevronUp class="tw:size-3.5 tw:text-an-faint" />
            <span class="tw:flex tw:items-center tw:gap-1.5">
                <span class="tw:text-[12.5px] tw:font-semibold tw:text-an-text">Your labels</span>
                <span class="tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-faint">
                    {{ labelCount }}
                </span>
                <span
                    v-for="(dot, i) in dots"
                    :key="i"
                    class="tw:h-1.5 tw:w-1.5 tw:shrink-0 tw:rounded-[2px]"
                    :style="{ background: dot }"
                />
            </span>
        </button>

        <button
            type="button"
            class="tw:flex tw:h-11 tw:items-center tw:gap-1.5 tw:rounded-lg tw:px-4 tw:text-[13px] tw:font-medium tw:transition-colors"
            :class="
                status === 'completed'
                    ? 'tw:border tw:border-an-accent tw:text-an-accent'
                    : 'tw:bg-an-accent tw:text-white'
            "
            @click="emit('mark-done')"
        >
            <Check class="tw:size-4" />
            {{ status === 'completed' ? 'Done' : 'Mark done' }}
        </button>
        <button
            v-if="status !== 'completed'"
            type="button"
            class="tw:flex tw:size-11 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg tw:border tw:border-an-n-200 tw:text-an-n-600 tw:disabled:opacity-40"
            :disabled="!allowSkip"
            aria-label="Skip image"
            @click="emit('skip')"
        >
            <SkipForward class="tw:size-4" />
        </button>
    </div>
</template>
