<script setup lang="ts">
import { ChevronLeft, ChevronRight, Eye, EyeOff, ImageOff, Loader2, Pencil, X } from '@lucide/vue'
import { imageService, type LibraryImage } from '~/services/imageService'
import { annotationService } from '~/services/annotationService'
import type { AnnotationLabel } from '~/services/annotationLabelService'
import { toShapes, type Shape } from '~/core/helpers/annotationShapes'
import { imageDisplayName } from '~/core/helpers/imageName'
import { useCanvasViewport } from '~/core/composables/useCanvasViewport'
import AnnotationOverlay from '~/features/components/shared/AnnotationOverlay.vue'
import ZoomPill from '~/features/components/shared/ZoomPill.vue'

/**
 * The picture, full screen, at fit.
 *
 * *** IT IS A VIEWER, NOT AN EDITOR. *** Nothing here writes: pan, zoom, walk the batch, hide the
 * shapes, and leave for the annotator when you actually want to change something. That is what lets
 * it reuse the annotator's own machinery without inheriting any of its state.
 *
 * `useCanvasViewport` and `ZoomPill` are the annotator's, unchanged. The fit arithmetic is the part
 * that was worth sharing: fit for a 4000px camera frame in a 1400px window genuinely is 35%, and a
 * second implementation of that is a second chance to letterbox a picture wrongly.
 *
 * Teleported to the body, because a fixed overlay inside the page grid inherits its stacking
 * context and would end up behind the docked panel.
 */
const props = defineProps<{
    image: LibraryImage
    palette: AnnotationLabel[]
    /** 1-based, over the filtered set, for the `17 / 22` readout. */
    position?: { index: number; total: number } | null
}>()

const emit = defineEmits<{
    close: []
    previous: []
    next: []
    annotate: [imageId: number]
}>()

const container = useTemplateRef<HTMLElement>('container')
const src = ref<string | null>(null)
const failed = ref(false)
const shapes = ref<Shape[]>([])
const showShapes = ref(true)

const view = useCanvasViewport(container, { src })

const caption = computed(() => imageDisplayName(props.image.metadata, props.image.id))

const labelIdFor = (label: string): number | null =>
    props.palette.find((row) => row.label === label)?.id ?? null

const revoke = () => {
    if (src.value) URL.revokeObjectURL(src.value)
    src.value = null
}

const load = async (row: LibraryImage) => {
    revoke()
    failed.value = false
    shapes.value = []
    try {
        // Full resolution: this is the one surface where someone is looking for a structure rather
        // than deciding whether to open something.
        src.value = await imageService.blobUrl(row.id, undefined, row.content_hash)
    } catch {
        failed.value = true
    }
    try {
        shapes.value = toShapes(await annotationService.list(row.id), labelIdFor)
    } catch {
        // The overlay describes the picture; without it there is still a picture.
    }
}

// Walking the batch swaps the image under the same viewer, which is an event rather than derived
// state: it revokes one object URL and fetches another.
watch(
    () => props.image.id,
    () => void load(props.image),
    { immediate: true },
)

onScopeDispose(revoke)

const percent = computed(() => Math.round(view.transform.value.scale * 100))

/**
 * The wheel: scroll to pan, Ctrl or Cmd to zoom.
 *
 * The same model the annotator settled on, and the reason is the same: a picture that zooms on a
 * bare trackpad swipe cannot be scrolled past, and a two-finger scroll is how everything else on
 * the machine moves a view.
 */
const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
        view.zoomAtCursor(event, event.deltaY)
        return
    }
    const x = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX
    const y = event.shiftKey ? 0 : event.deltaY
    // Negated: scrolling down moves the viewport down, which moves the picture up.
    view.pan({ x: -x, y: -y })
}

/** Drag to pan. No tools here, so every drag is a pan and there is nothing to disambiguate. */
const panning = ref<{ x: number; y: number } | null>(null)

const onPointerDown = (event: PointerEvent) => {
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
    panning.value = { x: event.clientX, y: event.clientY }
}

const onPointerMove = (event: PointerEvent) => {
    const from = panning.value
    if (!from) return
    view.pan({ x: event.clientX - from.x, y: event.clientY - from.y })
    panning.value = { x: event.clientX, y: event.clientY }
}

const onPointerUp = () => (panning.value = null)
</script>

<template>
    <Teleport to="body">
        <div class="tw:fixed tw:inset-0 tw:z-50 tw:flex tw:flex-col tw:bg-an-canvas">
            <!--
                The bar floats OVER the picture on a gradient rather than taking a row of its own.
                A full-screen viewer that gives 52px back to chrome is a smaller picture for no
                reason; the gradient is what keeps the mono filename readable over a bright field.
            -->
            <div
                class="tw:pointer-events-none tw:absolute tw:inset-x-0 tw:top-0 tw:z-10 tw:flex tw:h-[52px] tw:items-center tw:gap-2.5 tw:bg-gradient-to-b tw:from-black/85 tw:to-transparent tw:px-3.5"
            >
                <span class="tw:truncate tw:font-mono tw:text-[13px] tw:text-an-d-strong">
                    {{ caption }}
                </span>
                <span
                    v-if="position"
                    class="tw:shrink-0 tw:font-mono tw:text-[11.5px] tw:text-an-d-rail-icon tw:tabular-nums"
                >
                    {{ position.index }} / {{ position.total }}
                </span>

                <div class="tw:flex-1"></div>

                <button
                    v-if="shapes.length"
                    type="button"
                    class="tw:pointer-events-auto tw:flex tw:h-[30px] tw:items-center tw:gap-1.5 tw:rounded-[7px] tw:border tw:border-white/15 tw:bg-white/10 tw:px-2.5 tw:text-[12.5px] tw:font-medium tw:text-an-d-strong tw:hover:bg-white/15"
                    :aria-pressed="showShapes"
                    @click="showShapes = !showShapes"
                >
                    <Eye v-if="showShapes" class="tw:h-3.5 tw:w-3.5" />
                    <EyeOff v-else class="tw:h-3.5 tw:w-3.5" />
                    Shapes
                </button>
                <button
                    type="button"
                    class="tw:pointer-events-auto tw:flex tw:h-[30px] tw:items-center tw:gap-1.5 tw:rounded-[7px] tw:border tw:border-an-accent tw:bg-an-accent tw:px-2.5 tw:text-[12.5px] tw:font-medium tw:text-white tw:hover:bg-an-accent-hover"
                    @click="emit('annotate', image.id)"
                >
                    <Pencil class="tw:h-3.5 tw:w-3.5" />
                    Annotate
                </button>
                <button
                    type="button"
                    class="tw:pointer-events-auto tw:flex tw:h-[30px] tw:w-8 tw:items-center tw:justify-center tw:rounded-[7px] tw:border tw:border-white/15 tw:bg-white/10 tw:text-an-d-strong tw:hover:bg-white/15"
                    aria-label="Close"
                    @click="emit('close')"
                >
                    <X class="tw:h-3.5 tw:w-3.5" />
                </button>
            </div>

            <!--
                The viewport. `overflow: hidden` and a measured element, because every piece of the
                fit and pan arithmetic is expressed against this rectangle.
            -->
            <div
                ref="container"
                class="tw:relative tw:min-h-0 tw:flex-1 tw:overflow-hidden"
                :class="panning ? 'tw:cursor-grabbing' : 'tw:cursor-grab'"
                @wheel.prevent="onWheel"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointercancel="onPointerUp"
            >
                <div
                    v-if="src"
                    class="tw:absolute tw:top-1/2 tw:origin-center"
                    :style="{
                        width: `${(view.natural.value?.w ?? 0) * view.transform.value.scale}px`,
                        height: `${(view.natural.value?.h ?? 0) * view.transform.value.scale}px`,
                        left: `${view.viewport.value.w / 2}px`,
                        transform: `translate(calc(-50% + ${view.transform.value.x}px), calc(-50% + ${view.transform.value.y}px))`,
                    }"
                >
                    <img
                        :src="src"
                        :alt="caption"
                        draggable="false"
                        class="tw:block tw:h-full tw:w-full tw:select-none"
                        @load="view.measure($event.target as HTMLImageElement)"
                    />

                    <!-- INSIDE the transformed wrapper, so the shapes inherit the picture's own
                         pan and zoom and cannot drift from it at any scale. -->
                    <svg
                        v-if="showShapes && view.natural.value"
                        class="tw:pointer-events-none tw:absolute tw:inset-0 tw:h-full tw:w-full"
                        :viewBox="`0 0 ${view.natural.value.w} ${view.natural.value.h}`"
                        preserveAspectRatio="none"
                    >
                        <AnnotationOverlay
                            :shapes="shapes"
                            :natural="view.natural.value"
                            :palette="palette"
                            :width-for="() => 2 / view.transform.value.scale"
                        />
                    </svg>
                </div>

                <div
                    v-else-if="failed"
                    class="tw:flex tw:h-full tw:w-full tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:text-an-d-disabled"
                >
                    <ImageOff class="tw:h-6 tw:w-6" />
                    <span class="tw:text-[12px]">Image unavailable</span>
                </div>

                <!--
                    Until now this showed NOTHING while it fetched: a full-screen black rectangle,
                    which on a phone is indistinguishable from a viewer that opened onto an image
                    that does not exist. The wait is real - this is the original file, not a
                    thumbnail - so it has to be visible.
                -->
                <div v-else class="tw:flex tw:h-full tw:w-full tw:items-center tw:justify-center">
                    <Loader2 class="tw:h-7 tw:w-7 tw:animate-spin tw:text-an-d-disabled" />
                </div>

                <button
                    type="button"
                    class="tw:absolute tw:top-1/2 tw:left-5 tw:flex tw:h-11 tw:w-[34px] tw:-translate-y-1/2 tw:items-center tw:justify-center tw:rounded-[7px] tw:border tw:border-white/15 tw:bg-black/60 tw:text-an-d-strong tw:hover:bg-black/80"
                    aria-label="Previous image"
                    @click.stop="emit('previous')"
                >
                    <ChevronLeft class="tw:h-4.5 tw:w-4.5" />
                </button>
                <button
                    type="button"
                    class="tw:absolute tw:top-1/2 tw:right-5 tw:flex tw:h-11 tw:w-[34px] tw:-translate-y-1/2 tw:items-center tw:justify-center tw:rounded-[7px] tw:border tw:border-white/15 tw:bg-black/60 tw:text-an-d-strong tw:hover:bg-black/80"
                    aria-label="Next image"
                    @click.stop="emit('next')"
                >
                    <ChevronRight class="tw:h-4.5 tw:w-4.5" />
                </button>

                <!-- The annotator's pill, unchanged. `allHidden` is the shapes toggle here, which is
                     the same idea wearing a different name. -->
                <ZoomPill
                    :percent="percent"
                    :at-fit="view.atFit.value"
                    :enabled="Boolean(src)"
                    :all-hidden="!showShapes"
                    @zoom-in="view.zoomStep(1.25)"
                    @zoom-out="view.zoomStep(1 / 1.25)"
                    @fit="view.fit()"
                    @toggle-visibility="showShapes = !showShapes"
                />
            </div>
        </div>
    </Teleport>
</template>
