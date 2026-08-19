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
    /**
     * Drop the description paragraphs and tighten the labels.
     *
     * They are reference material for the desktop workbench, where the column has room and the
     * point is comparing models. Inline on a phone, under the run button, they would put ~100px of
     * prose between the action and the thing it runs.
     */
    compact?: boolean
}>()

const primary = defineModel<string>('primary', { required: true })
const segment = defineModel<string>('segment', { required: true })
</script>

<template>
    <!--
        Two shapes for the same two choices.

        `compact` is the phone's: an inset grouped list, iOS settings style - a label on the left,
        the current value and a chevron on the right, hairline between the rows, no boxes. On a black
        screen under a photograph, two bordered white dropdowns read as a form dropped onto a camera;
        a grouped list reads as settings, which is what they are.

        The chevron is forced white with the value: McSelectTrigger paints its icons
        `text-muted-foreground`, a grey chosen for a white field, which disappears on black.

        The value truncates with an ellipsis, as a value does on iOS. The trigger's own
        `line-clamp-1` clips a nowrap label without one, so "YOLO11s-seg (fungal segmenter)" - which
        is ~40px wider than the row can give it at 393px - was cut mid-word with its bracket left
        open, which reads as broken rather than as shortened. `block` because line-clamp sets
        `display: -webkit-box`, where text-overflow does nothing.

        The default is the desktop workbench's: stacked fields with their descriptions, where the
        point is comparing models and the column has room to explain them.
    -->
    <div v-if="compact">
        <!--
            A section header, the way a grouped list names itself on iOS: small, uppercase, muted,
            sitting outside the group rather than inside it.

            Without it the two rows are unlabelled - "Detection" and "Segmentation" say which model
            each row picks, but nothing said the group was about models at all, and on a screen whose
            other controls are zoom and a shutter that is a fair thing to wonder. Same type treatment
            as the results sheet's "Display" heading, so the two read as the same kind of section.
        -->
        <p
            class="tw:mb-1.5 tw:px-1 tw:text-[10px] tw:font-bold tw:tracking-[0.12em] tw:text-white/55 tw:uppercase"
        >
            Models
        </p>

        <div class="tw:divide-y tw:divide-white/10 tw:overflow-hidden tw:rounded-xl tw:bg-white/8">
            <div class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:pl-3.5">
                <span class="tw:shrink-0 tw:text-[13px] tw:text-white/55">Detection</span>
                <McSelect
                    v-model="primary"
                    :options="primaryOptions"
                    option-value="value"
                    option-label="label"
                    placeholder="Select a model"
                    :disabled="disabled"
                    class="tw:h-11 tw:min-w-0 tw:flex-1 tw:justify-end tw:gap-1 tw:rounded-none tw:border-0 tw:bg-transparent tw:pr-3 tw:pl-0 tw:text-[13px] tw:text-white tw:shadow-none tw:[&_svg]:text-white! tw:[&_[data-slot=select-value]]:block tw:[&_[data-slot=select-value]]:truncate"
                />
            </div>

            <div class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:pl-3.5">
                <span class="tw:shrink-0 tw:text-[13px] tw:text-white/55">Segmentation</span>
                <McSelect
                    v-model="segment"
                    :options="segmentOptions"
                    option-value="value"
                    option-label="label"
                    placeholder="Select a segmenter"
                    :disabled="disabled || !canChain"
                    class="tw:h-11 tw:min-w-0 tw:flex-1 tw:justify-end tw:gap-1 tw:rounded-none tw:border-0 tw:bg-transparent tw:pr-3 tw:pl-0 tw:text-[13px] tw:text-white tw:shadow-none tw:[&_svg]:text-white! tw:[&_[data-slot=select-value]]:block tw:[&_[data-slot=select-value]]:truncate"
                />
            </div>
        </div>
    </div>

    <div v-else class="tw:flex tw:flex-col tw:gap-3">
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
