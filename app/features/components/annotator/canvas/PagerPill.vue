<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'

/**
 * Where you are in the batch, top-right, with the two keys that move through it.
 *
 * Duplicates J/K on purpose: the keyboard path is the fast one, and this is how someone finds out
 * it exists.
 *
 * DARK, like every other overlay. They sit over a microscopy field that is mostly bright, so a light
 * pill disappears into it; the dark ground is what separates chrome from picture at a glance.
 */
defineProps<{ name: string; index: number; total: number }>()

const emit = defineEmits<{ previous: []; next: [] }>()
</script>

<template>
    <div
        class="tw:absolute tw:top-3 tw:right-3 tw:z-10 tw:flex tw:items-center tw:gap-1 tw:rounded-[10px] tw:border tw:border-white/[0.09] tw:bg-an-overlay/95 tw:backdrop-blur tw:p-1"
    >
        <button
            type="button"
            class="tw:flex tw:h-6 tw:w-6 tw:items-center tw:justify-center tw:rounded-md tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-30"
            :disabled="index <= 1"
            title="Previous image (K)"
            aria-label="Previous image"
            @click="emit('previous')"
        >
            <ChevronLeft class="tw:h-3.5 tw:w-3.5" />
        </button>

        <span class="tw:px-1 tw:text-[12px] tw:text-an-d-text">
            <span class="tw:font-mono">{{ name }}</span>
            <span class="tw:mx-1 tw:text-an-d-disabled">·</span>
            <span class="tw:font-mono tw:tabular-nums">{{ index }}/{{ total }}</span>
        </span>

        <button
            type="button"
            class="tw:flex tw:h-6 tw:w-6 tw:items-center tw:justify-center tw:rounded-md tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-30"
            :disabled="index >= total"
            title="Next image (J)"
            aria-label="Next image"
            @click="emit('next')"
        >
            <ChevronRight class="tw:h-3.5 tw:w-3.5" />
        </button>
    </div>
</template>
