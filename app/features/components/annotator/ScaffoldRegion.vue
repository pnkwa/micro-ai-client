<script setup lang="ts">
import { Construction } from '@lucide/vue'

/**
 * A placeholder for a region of the annotator that is laid out but not built.
 *
 * The scaffold exists so the LAYOUT can be reviewed before the drawing surface is written, which is
 * the expensive part. Every region says "Not implemented" in the same way on purpose: a scaffold
 * that looks half-finished in places and merely empty in others gets mistaken for a bug.
 *
 * DELETE THIS COMPONENT when the last region is real. It is not a general-purpose empty state -
 * McStatePanel is that - and it should not outlive phase 2.
 */
withDefaults(
    defineProps<{
        title: string
        /** What this region will do, in one line. */
        note?: string
        /** Dark regions sit over the canvas; light ones sit in panels. */
        tone?: 'dark' | 'light'
    }>(),
    { note: '', tone: 'light' },
)
</script>

<template>
    <div
        class="tw:flex tw:h-full tw:w-full tw:flex-col tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-md tw:border-2 tw:border-dashed tw:p-4 tw:text-center"
        :class="
            tone === 'dark'
                ? 'tw:border-white/20 tw:bg-white/5 tw:text-white/60'
                : 'tw:border-navy-20 tw:bg-navy-5 tw:text-navy-60'
        "
    >
        <Construction class="tw:h-5 tw:w-5 tw:opacity-70" />
        <p class="tw:text-sm tw:font-medium">{{ title }}</p>
        <p v-if="note" class="tw:max-w-xs tw:text-xs tw:opacity-80">{{ note }}</p>
        <span
            class="tw:mt-1 tw:rounded tw:px-1.5 tw:py-0.5 tw:text-[10px] tw:font-semibold tw:tracking-wide tw:uppercase"
            :class="tone === 'dark' ? 'tw:bg-white/10' : 'tw:bg-navy-15 tw:text-navy-80'"
        >
            Not implemented
        </span>
    </div>
</template>
