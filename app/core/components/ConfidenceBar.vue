<script setup lang="ts">
import { colorForLabel } from '~/core/helpers/colors'

/**
 * One class the model reported, with its confidence.
 *
 * White fill, not the label's tint: `colorForLabel` is a per-class identity shared with the box
 * overlay, so a filled bar sets a different background per row and the panel reads as a stack of
 * unrelated coloured slabs rather than one list. The identity is carried by the border, the dot
 * and the figure, which is enough to match a bar to its box, and every row then sits on the same
 * ground so the percentages compare directly.
 */

const props = defineProps<{
    label: string
    /** 0..1, same convention as DetectionStep/DetectionBox confidence. */
    confidence: number
}>()

const percent = computed(() => Math.round(props.confidence * 100))
const colors = computed(() => colorForLabel(props.label))
</script>

<template>
    <div
        class="tw:group tw:relative tw:flex tw:items-center tw:justify-between tw:overflow-hidden tw:rounded-lg tw:border tw:bg-white tw:p-2 tw:transition-shadow tw:lg:p-3 hover:tw:shadow-sm"
        :class="colors.border"
    >
        <div class="tw:flex tw:items-center tw:gap-1.5">
            <span class="tw:w-2 tw:h-2 tw:rounded-full tw:shrink-0" :class="colors.dot"></span>
            <span class="tw:text-xs tw:font-semibold tw:text-slate-600">{{ label }}</span>
        </div>
        <span
            class="tw:text-sm tw:font-semibold tw:leading-none tw:tabular-nums"
            :class="colors.text"
        >
            {{ percent }}%
        </span>
    </div>
</template>
