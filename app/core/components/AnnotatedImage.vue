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

const { visibleBoxes } = useDetectionFilters()

// Box coordinates are normalized to the ORIGINAL image, but the image is letterboxed inside
// this fixed-height box by object-scale-down, so drawing over the whole container throws the
// boxes into the margins. The overlay is instead sized and positioned to the image's actual
// rendered rectangle, computed the same way the browser lays the image out.
const container = useTemplateRef<HTMLElement>('container')
const { width: containerW, height: containerH } = useElementSize(container)
// The natural size, tagged with the src it was measured from. A new source hasn't been
// measured yet, so the tag won't match and this reads as unmeasured, so the overlay hides
// rather than briefly drawing the previous image's boxes at the wrong scale.
const measured = ref<{ src: string; w: number; h: number } | null>(null)

const onImgLoad = (event: Event) => {
    const img = event.target as HTMLImageElement
    measured.value = { src: props.src, w: img.naturalWidth, h: img.naturalHeight }
}

const natural = computed(() => (measured.value?.src === props.src ? measured.value : null))

// The rendered image rect within the container. object-scale-down is object-contain that
// never upscales past natural size, so the scale is min(fit-both-axes, 1); the image is then
// centred, which is where the letterbox offsets come from. Null until both the container and
// the image have real dimensions.
const imageRect = computed(() => {
    const nat = natural.value
    if (!containerW.value || !containerH.value || !nat?.w || !nat?.h) return null
    const scale = Math.min(containerW.value / nat.w, containerH.value / nat.h, 1)
    const width = nat.w * scale
    const height = nat.h * scale
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
    <div class="tw:flex tw:flex-col">
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
                    <g
                        v-for="box in polygonBoxes"
                        :key="`poly-${box.id}`"
                        class="tw:text-green-400"
                    >
                        <polygon
                            :points="polygonPoints(box)"
                            fill="none"
                            stroke="#0f172a"
                            stroke-opacity="0.5"
                            stroke-width="3.5"
                            stroke-linejoin="round"
                            vector-effect="non-scaling-stroke"
                        />
                        <polygon
                            :points="polygonPoints(box)"
                            fill="currentColor"
                            fill-opacity="0.14"
                            stroke="currentColor"
                            stroke-width="1.75"
                            stroke-linejoin="round"
                            vector-effect="non-scaling-stroke"
                        />
                    </g>
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
    </div>
</template>
