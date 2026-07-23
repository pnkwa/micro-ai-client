<script setup lang="ts">
import { colorForLabel } from '~/core/helpers/colors'

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
        class="tw:group tw:relative tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:p-3 tw:border tw:overflow-hidden tw:transition-shadow hover:tw:shadow-sm"
        :class="[colors.bg, colors.border]"
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
