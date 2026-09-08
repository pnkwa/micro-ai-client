<script setup lang="ts">
/**
 * The instructor's compact verdict bar (phone). Three equal 44px targets — Approve, Flag, Incorrect —
 * with the chosen one filled in its own colour, so a reviewed image is legible at a glance. A grabber
 * above them opens the review sheet (student's boxes, remark, overall feedback). This bar commits;
 * the filmstrip browses — the same status-vs-position split as the desktop.
 */
import { Check, ChevronUp, Flag, X } from '@lucide/vue'

defineProps<{
    /** The image's current verdict, or 'unreviewed'. */
    verdict: 'unreviewed' | 'approved' | 'flagged' | 'incorrect'
    saving: boolean
    /** Locked once graded/returned, or when there is no field to judge. */
    disabled: boolean
}>()

const emit = defineEmits<{
    review: [status: 'approved' | 'flagged' | 'incorrect']
    'open-sheet': []
}>()

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
</script>

<template>
    <div
        class="tw:flex tw:h-[68px] tw:shrink-0 tw:flex-col tw:justify-center tw:border-t tw:border-an-border tw:bg-an-panel tw:px-3 tw:pb-[env(safe-area-inset-bottom)] tw:[touch-action:pan-x_pan-y]"
    >
        <button
            type="button"
            class="tw:mx-auto tw:mb-1 tw:flex tw:items-center tw:gap-1 tw:text-[10.5px] tw:text-an-faint"
            aria-label="Open review details"
            @click="emit('open-sheet')"
        >
            <ChevronUp class="tw:size-3.5" />
            Details
        </button>
        <div class="tw:flex tw:gap-1.5">
            <button
                v-for="v in verdicts"
                :key="v.key"
                type="button"
                class="tw:flex tw:h-11 tw:flex-1 tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-lg tw:text-[13px] tw:font-medium tw:transition-colors tw:disabled:opacity-50"
                :class="verdict === v.key ? v.on : 'tw:border tw:border-an-n-200 tw:text-an-n-600'"
                :disabled="saving || disabled"
                @click="emit('review', v.key)"
            >
                <component :is="v.icon" class="tw:size-4" />
                {{ v.label }}
            </button>
        </div>
    </div>
</template>
