<script setup lang="ts">
import { useDetectionFilters } from '~/core/composables/detectionFilters'

/**
 * The "which boxes do I see?" controls: confidence threshold plus one toggle per
 * inference step. Rendered wherever the page wants them (both callers put them in a
 * right-hand panel); the overlay they drive is McAnnotatedImage, which reads the same
 * injected state. Renders nothing when there is nothing to filter.
 */
const { steps, minConfidence, hiddenSteps, toggleStep, totalBoxCount } = useDetectionFilters()
</script>

<template>
    <div v-if="totalBoxCount > 0" class="tw:flex tw:flex-col tw:gap-3">
        <McConfidenceThreshold v-model="minConfidence" />

        <div
            v-if="steps.length > 1"
            class="tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:text-xs tw:text-navy-60"
        >
            <label
                v-for="step in steps"
                :key="step.id"
                class="tw:flex tw:items-center tw:gap-1.5 tw:cursor-pointer tw:select-none"
            >
                <input
                    type="checkbox"
                    :checked="!hiddenSteps.has(step.id)"
                    class="tw:accent-primary"
                    @change="toggleStep(step.id)"
                />
                <span class="tw:capitalize">{{ step.step }}</span>
                <span class="tw:text-navy-40">({{ step.boxes.length }})</span>
            </label>
        </div>
    </div>
</template>
