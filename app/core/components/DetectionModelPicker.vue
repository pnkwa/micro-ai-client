<script setup lang="ts">
import type { ModelSpec } from '~/services/detectionService'

/**
 * The two model dropdowns and their descriptions.
 *
 * Extracted because the detection page shows them in two places that must never disagree: the
 * desktop controls column, and the settings sheet a phone opens from the image view. Rendered as
 * McDetectionModelPicker (core components are globally registered with the Mc prefix).
 *
 * Presentational - the page owns the model list, the selection, and what chaining means
 * (FE-ADR-007: a model name is never hardcoded, here least of all).
 */
defineProps<{
    primaryOptions: { value: string; label: string }[]
    segmentOptions: { value: string; label: string }[]
    primarySpec?: ModelSpec
    segmentSpec?: ModelSpec
    /** Only a detector chains a segmenter; anything else runs alone. */
    canChain: boolean
    disabled?: boolean
}>()

const primary = defineModel<string>('primary', { required: true })
const segment = defineModel<string>('segment', { required: true })
</script>

<template>
    <div class="tw:flex tw:flex-col tw:gap-3">
        <div>
            <label class="tw:mb-1 tw:block tw:text-[10px] tw:font-semibold tw:text-slate-500">
                Classification / Detection
            </label>
            <McSelect
                v-model="primary"
                :options="primaryOptions"
                option-value="value"
                option-label="label"
                placeholder="Select a model"
                :disabled="disabled"
                class="tw:bg-white"
            />
            <!-- Reserve space for the (variable-length) description so switching models doesn't
                 shift whatever sits below it. -->
            <div class="tw:mt-1 tw:min-h-12">
                <p v-if="primarySpec" class="tw:text-[10px] tw:leading-relaxed tw:text-slate-400">
                    {{ primarySpec.description }}
                </p>
            </div>
        </div>

        <div>
            <label class="tw:mb-1 tw:block tw:text-[10px] tw:font-semibold tw:text-slate-500">
                Segmentation
            </label>
            <McSelect
                v-model="segment"
                :options="segmentOptions"
                option-value="value"
                option-label="label"
                placeholder="Select a segmenter"
                :disabled="disabled || !canChain"
                class="tw:bg-white"
            />
            <!-- Same reserved slot, so toggling the segmenter (including to "None", which has no
                 description) keeps everything below it anchored. -->
            <div class="tw:mt-1 tw:min-h-12">
                <p v-if="!canChain" class="tw:text-[10px] tw:leading-relaxed tw:text-slate-400">
                    Only a detector chains a segmenter; the selected model runs alone.
                </p>
                <p
                    v-else-if="segmentSpec"
                    class="tw:text-[10px] tw:leading-relaxed tw:text-slate-400"
                >
                    {{ segmentSpec.description }}
                </p>
            </div>
        </div>
    </div>
</template>
