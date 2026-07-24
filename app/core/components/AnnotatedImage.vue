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
const props = defineProps<{ src: string }>()

const { steps, visibleBoxes, shownableBoxCount } = useDetectionFilters()

// Box coordinates are normalized to the ORIGINAL image, but the image is letterboxed inside
// this fixed-height box by object-scale-down, so drawing over the whole container throws the
// boxes into the margins. The overlay is instead sized and positioned to the image's actual
// rendered rectangle, computed the same way the browser lays the image out.
const container = useTemplateRef<HTMLElement>('container')
const { width: containerW, height: containerH } = useElementSize(container)
const naturalW = ref(0)
const naturalH = ref(0)

const onImgLoad = (event: Event) => {
    const img = event.target as HTMLImageElement
    naturalW.value = img.naturalWidth
    naturalH.value = img.naturalHeight
}

// A new source hasn't been measured yet; drop the old dimensions so the overlay hides rather
// than briefly drawing the previous image's boxes at the wrong scale.
//todo: this is a bit of a hack, but it works for now. We should probably refactor the submissionScore and scoreFraction functions to return an object with both the score and the total points, so we don't have to compute the total points twice.
watch(
    () => props.src,
    () => {
        naturalW.value = 0
        naturalH.value = 0
    },
)

// The rendered image rect within the container. object-scale-down is object-contain that
// never upscales past natural size, so the scale is min(fit-both-axes, 1); the image is then
// centred, which is where the letterbox offsets come from. Null until both the container and
// the image have real dimensions.
const imageRect = computed(() => {
    if (!containerW.value || !containerH.value || !naturalW.value || !naturalH.value) return null
    const scale = Math.min(containerW.value / naturalW.value, containerH.value / naturalH.value, 1)
    const width = naturalW.value * scale
    const height = naturalH.value * scale
    return {
        left: (containerW.value - width) / 2,
        top: (containerH.value - height) / 2,
        width,
        height,
    }
})

const overlayStyle = computed(() => {
    const r = imageRect.value
    if (!r) return { display: 'none' }
    return {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
    }
})

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
            ref="container"
            class="tw:relative tw:flex-1 tw:min-h-0 tw:bg-slate-950 tw:rounded-md tw:overflow-hidden tw:flex tw:items-center tw:justify-center"
        >
            <img
                :src="src"
                alt="Submitted image"
                class="tw:w-full tw:h-full tw:object-scale-down tw:items-center tw:justify-center tw:select-none"
                @load="onImgLoad"
            />

            <!-- Sized to the rendered image, not the container, so normalized coordinates land
                 on the picture and not in the letterbox margins. -->
            <div class="tw:absolute" :style="overlayStyle">
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
        </div>

        <!-- FIXED height, not min-height: the image above is flex-1, so any change in this
             row's height resizes it and the layout jumps. A fixed box stays put no matter what
             text lands here (legend, the wrapped "below threshold" message, the count) — content
             is vertically centred and anything taller is clipped rather than pushing the box.
             Two lines' worth on narrow widths where the message wraps; one line at lg. -->
        <div
            class="tw:flex tw:h-12 tw:lg:h-9 tw:items-center tw:justify-between tw:gap-3 tw:overflow-hidden tw:px-3"
        >
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
            <!-- "detected nothing" and "nothing has run" are not the same claim, and saying
                 the first when no model ever ran sends a grader looking for a fault in the
                 image. Steps, not boxes: a model that ran and found nothing still has one. -->
            <p v-else-if="steps.length" class="tw:text-[11px] tw:text-navy-40">
                No elements detected.
            </p>
            <p v-else class="tw:text-[11px] tw:text-navy-40">Not analyzed.</p>

            <p
                v-if="shownableBoxCount > 0"
                class="tw:shrink-0 tw:text-[11px] tw:text-navy-40 tw:tabular-nums"
            >
                {{ visibleBoxes.length }} / {{ shownableBoxCount }} shown
            </p>
        </div>
    </div>
</template>
