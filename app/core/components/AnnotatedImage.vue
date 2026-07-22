<script setup lang="ts">
import type { DetectionBox } from '~/services/detectionService'
import { colorForLabel } from '~/core/helpers/colors'
import { useDetectionFilters } from '~/core/composables/detectionFilters'

/**
 * Draws the detection overlay. The filter state it reads lives in the surrounding
 * McDetectionFilterScope rather than here, so the controls (McDetectionFilters) can be
 * rendered in a different part of the page's layout: both callers put them in a
 * right-hand panel, away from the image.
 */
defineProps<{ src: string }>()

const { visibleBoxes, shownableBoxCount } = useDetectionFilters()

// A detector's box has x/y/w/h only; a segmenter's fills `polygon` too (see DetectionBox
// entity), so render whichever geometry the box actually carries.
const polygonBoxes = computed(() => visibleBoxes.value.filter((b) => b.polygon?.length))
const rectBoxes = computed(() => visibleBoxes.value.filter((b) => !b.polygon?.length))

const distinctLabels = computed(() => [...new Set(visibleBoxes.value.map((b) => b.label))])

const polygonPoints = (box: DetectionBox): string =>
    (box.polygon ?? []).map(([x, y]) => `${(x ?? 0) * 100},${(y ?? 0) * 100}`).join(' ')

const boxStyle = (box: DetectionBox) => ({
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
})
</script>

<template>
    <div class="tw:flex tw:flex-col tw:gap-2">
        <div
            class="tw:relative tw:flex-1 tw:min-h-0 tw:bg-slate-950 tw:rounded-md tw:overflow-hidden tw:flex tw:items-center tw:justify-center"
        >
            <img
                :src="src"
                alt="Submitted image"
                class="tw:w-full tw:h-full tw:object-scale-down tw:items-center tw:justify-center tw:select-none"
            />

            <svg
                class="tw:absolute tw:inset-0 tw:w-full tw:h-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
            >
                <polygon
                    v-for="box in polygonBoxes"
                    :key="`poly-${box.id}`"
                    :points="polygonPoints(box)"
                    :class="colorForLabel(box.label).border"
                    fill="currentColor"
                    fill-opacity="0.15"
                    stroke="currentColor"
                    stroke-width="0.4"
                    vector-effect="non-scaling-stroke"
                />
            </svg>

            <div
                v-for="box in rectBoxes"
                :key="`box-${box.id}`"
                class="tw:absolute tw:border-2 tw:rounded-sm"
                :class="colorForLabel(box.label).border"
                :style="boxStyle(box)"
            >
                <span
                    class="tw:absolute tw:-top-5 tw:left-0 tw:px-1.5 tw:py-0.5 tw:rounded tw:text-[10px] tw:font-semibold tw:whitespace-nowrap tw:text-white"
                    :class="colorForLabel(box.label).dot"
                >
                    {{ box.label }} · {{ Math.round(box.confidence * 100) }}%
                </span>
            </div>
        </div>

        <div class="tw:flex tw:min-h-6 tw:items-center tw:justify-between tw:gap-3">
            <div
                v-if="distinctLabels.length"
                class="tw:flex tw:flex-wrap tw:gap-3 tw:text-[11px] tw:text-navy-60"
            >
                <span
                    v-for="label in distinctLabels"
                    :key="label"
                    class="tw:flex tw:items-center tw:gap-1.5"
                >
                    <span
                        class="tw:inline-block tw:size-2.5 tw:rounded-sm"
                        :class="colorForLabel(label).dot"
                    ></span>
                    {{ label }}
                </span>
            </div>
            <!-- Distinguish "the model found nothing" from "you filtered everything out":
                 both looked like the same generic message, which read as a layout glitch
                 when raising the confidence slider silently swapped one for the other. -->
            <p v-else-if="shownableBoxCount > 0" class="tw:text-[11px] tw:text-navy-40">
                All elements are below the confidence threshold.
            </p>
            <p v-else class="tw:text-[11px] tw:text-navy-40">No elements detected.</p>

            <p
                v-if="shownableBoxCount > 0"
                class="tw:shrink-0 tw:text-[11px] tw:text-navy-40 tw:tabular-nums"
            >
                {{ visibleBoxes.length }} / {{ shownableBoxCount }} shown
            </p>
        </div>
    </div>
</template>
