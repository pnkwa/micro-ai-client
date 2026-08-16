<script setup lang="ts">
import { Minus, Plus } from '@lucide/vue'

/**
 * The zoom row for a live camera: minus, slider, plus, readout.
 *
 * Buttons flank the slider because a slider alone is fiddly with a thumb on a phone, and the
 * readout is what tells a student they are at 1x rather than slightly off it.
 *
 * Presentational only - the state lives in `useCameraZoom`, which both the exam capture screen
 * and the detection viewfinder own separately. Rendered as McCameraZoomControl (core components
 * are globally registered with the Mc prefix).
 */
withDefaults(
    defineProps<{
        zoom: number
        min: number
        max: number
        step: number
        /** 'light' for a dark viewfinder, 'dark' for a control sitting on a pale panel. */
        tone?: 'light' | 'dark'
    }>(),
    { tone: 'light' },
)

const emit = defineEmits<{ 'update:zoom': [number]; step: [1 | -1] }>()
</script>

<template>
    <div
        class="tw:flex tw:items-center tw:justify-center tw:gap-3"
        :class="tone === 'light' ? 'tw:text-white' : 'tw:text-navy-70'"
    >
        <button
            type="button"
            aria-label="Zoom out"
            class="tw:cursor-pointer tw:rounded-full tw:p-1.5 tw:transition-colors tw:disabled:opacity-40"
            :class="tone === 'light' ? 'tw:hover:bg-white/15' : 'tw:hover:bg-navy-10'"
            :disabled="zoom <= min"
            @click="emit('step', -1)"
        >
            <Minus class="tw:size-5" />
        </button>
        <input
            :value="zoom"
            type="range"
            :min="min"
            :max="max"
            :step="step"
            aria-label="Zoom"
            class="tw:h-1 tw:w-40 tw:cursor-pointer"
            :class="tone === 'light' ? 'tw:accent-white' : 'tw:accent-primary'"
            @input="emit('update:zoom', Number(($event.target as HTMLInputElement).value))"
        />
        <button
            type="button"
            aria-label="Zoom in"
            class="tw:cursor-pointer tw:rounded-full tw:p-1.5 tw:transition-colors tw:disabled:opacity-40"
            :class="tone === 'light' ? 'tw:hover:bg-white/15' : 'tw:hover:bg-navy-10'"
            :disabled="zoom >= max"
            @click="emit('step', 1)"
        >
            <Plus class="tw:size-5" />
        </button>
        <span class="tw:w-12 tw:text-right tw:text-sm tw:tabular-nums">{{ zoom.toFixed(1) }}×</span>
    </div>
</template>
