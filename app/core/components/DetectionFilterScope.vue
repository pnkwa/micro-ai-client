<script setup lang="ts">
import {
    createDetectionFilters,
    detectionFiltersKey,
    type DetectionStepLike,
} from '~/core/composables/detectionFilters'

/**
 * Owns the overlay's filter state and hands it to any McAnnotatedImage /
 * McDetectionFilters below it. Wrap whatever region contains both: the whole two-column
 * row on the playground, a single answer's row on the grading page.
 *
 * Renders a plain <div> rather than being renderless so it can BE that row's layout
 * element; a fragment root would drop the caller's classes as extraneous attrs.
 */
const props = defineProps<{ steps: DetectionStepLike[] }>()

provide(
    detectionFiltersKey,
    createDetectionFilters(() => props.steps),
)
</script>

<template>
    <div>
        <slot />
    </div>
</template>
