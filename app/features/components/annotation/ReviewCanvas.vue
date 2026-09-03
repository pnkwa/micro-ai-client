<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { reviewBoxColor } from '~/core/helpers/annotationClasses'
import type { StudentBox } from '~/services/annotationAssignmentService'

/**
 * Read-only compare canvas for instructor review (BE-ADR-039, screen 7). Not the editable
 * AnnotationCanvas — nothing here is draggable. Boxes are normalized [0,1] against the image, so
 * they position as plain CSS percentages over the image once it is laid out.
 *
 * The image is fit into the pane with an explicitly computed size (from the container size and the
 * image's natural size) rather than by CSS `max-*`: a `max-height:100%` on an image inside a
 * shrink-wrapped box resolves against the box's auto height and is dropped, which let a tall image
 * overflow and get clipped — the picture then looked wrong and the box overlay no longer lined up.
 * Sizing the wrapper ourselves keeps the overlay exactly over the image at any aspect ratio.
 *
 * Two layers: the student's boxes (solid, in their class colour) and, optionally, the instructor's
 * expert key (dashed teal). The student never mounts this with expert boxes — the server omits them.
 */
export interface ExpertBox {
    id: number
    label: string | null
    color: string | null
    x: number
    y: number
    w: number
    h: number
    polygon: number[][] | null
}

const props = defineProps<{
    src: string | null
    studentBoxes: StudentBox[]
    expertBoxes: ExpertBox[]
    /** label -> 6-hex colour (no #), from the assignment's label_set. */
    labelColors: Record<string, string>
    showExpert: boolean
}>()

const EXPERT = '0e9384' // an-accent teal

const container = useTemplateRef<HTMLElement>('container')
const { width: cw, height: ch } = useElementSize(container)
const natural = ref<{ w: number; h: number } | null>(null)

// Reset on source change so the previous image's dimensions never size the next one.
watch(() => props.src, () => (natural.value = null))
function onLoad(event: Event) {
    const img = event.target as HTMLImageElement
    natural.value = { w: img.naturalWidth, h: img.naturalHeight }
}

// Contain the image in the pane (scale up or down to fit, preserving aspect).
const fit = computed(() => {
    if (!natural.value || !cw.value || !ch.value) return null
    const scale = Math.min(cw.value / natural.value.w, ch.value / natural.value.h)
    return { w: natural.value.w * scale, h: natural.value.h * scale }
})

const hex = (h: string) => (h.startsWith('#') ? h : `#${h}`)
// Instructor's swatch when the label matches label_set (case-insensitive), else the student's own.
const studentColor = (label: string | null) => reviewBoxColor(label, props.labelColors)

const points = (polygon: number[][]) =>
    polygon.map(([x, y]) => `${(x ?? 0) * 100},${(y ?? 0) * 100}`).join(' ')

const boxStyle = (b: { x: number; y: number; w: number; h: number }) => ({
    left: `${b.x * 100}%`,
    top: `${b.y * 100}%`,
    width: `${b.w * 100}%`,
    height: `${b.h * 100}%`,
})
</script>

<template>
    <div
        ref="container"
        class="tw:relative tw:flex tw:h-full tw:w-full tw:items-center tw:justify-center tw:overflow-hidden tw:bg-an-canvas"
    >
        <div
            v-if="src"
            class="tw:relative tw:leading-none"
            :style="
                fit
                    ? { width: `${fit.w}px`, height: `${fit.h}px` }
                    : { visibility: 'hidden' }
            "
        >
            <img :src="src" alt="" class="tw:block tw:h-full tw:w-full" @load="onLoad" />

            <!-- polygons, drawn in a stretched viewBox so normalized points map straight across -->
            <svg
                class="tw:pointer-events-none tw:absolute tw:inset-0 tw:h-full tw:w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
            >
                <template v-if="showExpert">
                    <polygon
                        v-for="e in expertBoxes.filter((b) => b.polygon)"
                        :key="`ep-${e.id}`"
                        :points="points(e.polygon!)"
                        :stroke="hex(e.color || EXPERT)"
                        stroke-width="0.5"
                        stroke-dasharray="1.5 1"
                        fill="none"
                        vector-effect="non-scaling-stroke"
                    />
                </template>
                <polygon
                    v-for="s in studentBoxes.filter((b) => b.polygon)"
                    :key="`sp-${s.id}`"
                    :points="points(s.polygon!)"
                    :stroke="studentColor(s.label)"
                    stroke-width="0.5"
                    :fill="studentColor(s.label)"
                    fill-opacity="0.12"
                    vector-effect="non-scaling-stroke"
                />
            </svg>

            <!-- expert boxes: dashed border for rectangles (the SVG outlines polygons); the label
                 chip sits at the bounding box for both, as in the annotator. -->
            <template v-if="showExpert">
                <div
                    v-for="e in expertBoxes"
                    :key="`eb-${e.id}`"
                    class="tw:absolute tw:rounded-sm"
                    :class="e.polygon ? '' : 'tw:border-2 tw:border-dashed'"
                    :style="{
                        ...boxStyle(e),
                        ...(e.polygon ? {} : { borderColor: hex(e.color || EXPERT) }),
                    }"
                >
                    <span
                        v-if="e.label"
                        class="tw:absolute tw:-top-5 tw:left-0 tw:rounded tw:px-1.5 tw:py-0.5 tw:text-[11px] tw:font-semibold tw:whitespace-nowrap tw:text-white"
                        :style="{ background: hex(e.color || EXPERT) }"
                    >
                        {{ e.label }}
                    </span>
                </div>
            </template>

            <!-- student boxes: solid border + fill for rectangles (the SVG outlines polygons); the
                 label chip sits at the bounding box for both. -->
            <div
                v-for="s in studentBoxes"
                :key="`sb-${s.id}`"
                class="tw:absolute tw:rounded-sm"
                :class="s.polygon ? '' : 'tw:border-2'"
                :style="{
                    ...boxStyle(s),
                    ...(s.polygon
                        ? {}
                        : {
                              borderColor: studentColor(s.label),
                              background: `${studentColor(s.label)}1f`,
                          }),
                }"
            >
                <span
                    class="tw:absolute tw:-bottom-5 tw:left-0 tw:rounded tw:px-1.5 tw:py-0.5 tw:text-[11px] tw:font-semibold tw:whitespace-nowrap tw:text-white"
                    :style="{ background: studentColor(s.label) }"
                >
                    {{ s.label || 'Unlabelled' }}
                </span>
            </div>
        </div>

        <div v-else class="tw:text-sm tw:text-an-faint">No image</div>
    </div>
</template>
