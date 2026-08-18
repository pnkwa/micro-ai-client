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
const props = withDefaults(
    defineProps<{
        src: string
        /**
         * Enlarge a small image to fill the box, rather than leaving it at natural size.
         *
         * Off by default, which is `object-scale-down`: a submission shown at 1:1 is sharp, and the
         * grading page has room for it. The detection page turns it on for the phone, where the
         * viewer is a fixed band across the screen and a capture can be only a couple of hundred
         * pixels wide - the camera crops the visible square back to source pixels, and a video
         * scaled up to cover a tall screen has few of them to give. Left at natural size that lands
         * as a stamp floating in black.
         */
        fill?: boolean
        /**
         * Fill a FIXED box, enlarging when the source is smaller than it.
         *
         * The sibling of `fill`, not a variant of it: `fill` lets the box take the image's height,
         * this keeps the box's own size and scales the picture into it.
         *
         * The detection page's desktop viewer turns it on so the picture holds ONE footprint from
         * viewfinder to capture to result. Without it a 480px capture paints at 480 inside the 583px
         * square the viewfinder had, so the composition jumps at exactly the moment the answer
         * arrives. The grading page leaves it off: a submission shown at 1:1 is sharp, and it has the
         * room.
         *
         * The overlay follows for free - `scale` below is the single source for both the CSS and the
         * box geometry, so the two cannot disagree about where the picture is.
         */
        upscale?: boolean
    }>(),
    { fill: false, upscale: false },
)

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

// The rendered image rect within the container, computed the same way the browser lays the image
// out - the overlay is positioned against this, so the two MUST agree or every box lands off the
// picture. `contain` fits both axes; `scale-down` is contain that additionally never enlarges, hence
// the extra 1 - which `fill` and `upscale` both drop, because both of them mean "fill the box". The
// image is then centred, which is where the letterbox offsets come from. Null until both the
// container and the image have real dimensions.
const imageRect = computed(() => {
    const nat = natural.value
    if (!containerW.value || !containerH.value || !nat?.w || !nat?.h) return null
    const fit = Math.min(containerW.value / nat.w, containerH.value / nat.h)
    const scale = props.fill || props.upscale ? fit : Math.min(fit, 1)
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
        <!--
            `fill` also changes who decides the height. Without it the box is a fixed band the image
            is fitted into, which is what the grading page and the desktop viewer want. With it the
            box takes the image's own height, so there is no letterbox to fit inside at all - the
            picture ends where the picture ends.

            That also makes the overlay arithmetic exact rather than merely correct: container and
            image are the same rectangle, so the scale is 1 and the offsets are 0.

            No max-height. A cap was tried, to guarantee the results card sits above the fold on a
            short viewport, and it made the picture smaller everywhere to serve the smallest screen -
            the sheet scrolls and says so, which is the cheaper answer.
        -->
        <div
            ref="container"
            class="tw:relative tw:bg-slate-950 tw:overflow-hidden"
            :class="
                fill
                    ? 'tw:w-full'
                    : 'tw:flex tw:min-h-0 tw:flex-1 tw:items-center tw:justify-center tw:rounded-md'
            "
        >
            <img
                :src="src"
                alt="Submitted image"
                class="tw:w-full tw:select-none"
                :class="
                    fill
                        ? 'tw:block tw:h-auto'
                        : upscale
                          ? 'tw:h-full tw:object-contain'
                          : 'tw:h-full tw:items-center tw:justify-center tw:object-scale-down'
                "
                @load="onImgLoad"
            />

            <!--
                Softens the cut where the picture meets the result sheet. The sheet sits flush
                against the image, and a photograph sliced off by a straight white edge reads as
                cropped by accident; fading the last strip lets it settle into the panel instead.

                All the way to opaque black at the bottom edge, over 128px. At 80px and 55% the fade
                was there in the markup and not on screen: the last row of pixels was still more than
                half picture, so the white sheet met a photograph mid-tone and the join stayed as hard
                as it had been. Reaching black means the sheet's rounded corners sit on the page's own
                black rather than on a slice of somebody's slide, which is what makes it read as a
                panel lifted over the image instead of a lid dropped on it.

                Only in `fill` mode - that is the phone's results viewer, the one place a sheet butts
                straight onto the image. Above the overlay in the stacking order would hide boxes, so
                it sits under it: a box near the bottom edge stays legible over the fade.
            -->
            <div
                v-if="fill"
                aria-hidden="true"
                class="tw:pointer-events-none tw:absolute tw:inset-x-0 tw:bottom-0 tw:h-32 tw:bg-linear-to-t tw:from-black tw:via-black/45 tw:to-transparent"
            ></div>

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
