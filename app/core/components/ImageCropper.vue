<script setup lang="ts">
import { until } from '@vueuse/core'
import { clampOffset, coverScale, cropRect, isUntouched } from '~/core/composables/imageCrop'

/**
 * A fixed 1:1 window over an image: drag to pan, pinch or wheel to zoom, and what is inside the
 * window is what the caller gets.
 *
 * No mode and no confirm step - the preview IS this. Doing nothing to a square photo hands back the
 * original bytes untouched, so the common path costs nothing; the controls are only there for the
 * cases that need them (a phone gallery shot that is 4:3, or a field of view worth zooming into).
 *
 * The arithmetic lives in `~/core/composables/imageCrop` and is unit-tested there. This file owns
 * only the pointer handling and the canvas, because those are the parts a test cannot see.
 */
const props = defineProps<{
    /** Object URL of the staged image. */
    src: string
    /** Disable interaction while a run is in flight. */
    disabled?: boolean
}>()

const emit = defineEmits<{ change: [] }>()

const frame = useTemplateRef<HTMLElement>('frame')
const img = useTemplateRef<HTMLImageElement>('img')

/**
 * The source's decoded size, TOGETHER WITH the src it was measured from.
 *
 * Keyed rather than reset: a new picture invalidates the old measurement by derivation, so there is
 * no instant where `src` has moved on and `natural` still describes the last image. That used to be
 * a watcher whose whole job was to zero this out - state that has to be corrected after the fact is
 * the thing worth removing, not the line that does the correcting.
 */
const measured = ref<{ src: string; w: number; h: number } | null>(null)

const natural = computed(() =>
    measured.value?.src === props.src
        ? { w: measured.value.w, h: measured.value.h }
        : { w: 0, h: 0 },
)
const size = ref(0)
const scale = ref(1)
const offset = ref({ x: 0, y: 0 })

const minScale = computed(() => coverScale(natural.value, size.value))
/** Four times cover is past the point where a phone photo has any detail left to show. */
const maxScale = computed(() => minScale.value * 4)

const zoomFactor = computed(() => (minScale.value ? scale.value / minScale.value : 1))

/** Where the thumb sits along its travel, 0..1. */
const zoomPct = computed(() => {
    const span = maxScale.value - minScale.value
    return span > 0 ? (scale.value - minScale.value) / span : 0
})

/** Odd, so one tick lands dead centre. */
const TICKS = 21

/**
 * Has the picture measured yet?
 *
 * Everything here is derived from the source's natural size, so until the `<img>` has decoded there
 * is no crop to compute - `cropRect` would be asked for a rectangle of a zero-sized image. A gallery
 * pick on a phone is the case that bites: the file is staged, the run button is already live in the
 * app bar, and a fast tap lands in the window before `load` fires.
 */
const ready = computed(() => natural.value.w > 0 && natural.value.h > 0 && size.value > 0)

/** Nothing to pan and nothing worth zooming: an already-square image at rest. */
const untouched = computed(() =>
    isUntouched(natural.value, size.value, {
        scale: scale.value,
        ...offset.value,
    }),
)

const measure = () => {
    size.value = frame.value?.getBoundingClientRect().width ?? 0
}

const reset = () => {
    scale.value = minScale.value
    offset.value = { x: 0, y: 0 }
}

const onLoad = () => {
    const el = img.value
    if (!el) return
    measured.value = { src: props.src, w: el.naturalWidth, h: el.naturalHeight }
    measure()
    reset()
}

// The frame is width-driven, so a rotation or a resized window changes `size` and with it the
// scale floor. Re-clamping rather than resetting keeps whatever the user had chosen.
useEventListener(window, 'resize', () => {
    measure()
    setScale(scale.value)
})

const setScale = (next: number) => {
    scale.value = Math.min(maxScale.value, Math.max(minScale.value, next))
    offset.value = clampOffset(natural.value, size.value, { scale: scale.value, ...offset.value })
    emit('change')
}

const panBy = (dx: number, dy: number) => {
    offset.value = clampOffset(natural.value, size.value, {
        scale: scale.value,
        x: offset.value.x + dx,
        y: offset.value.y + dy,
    })
    emit('change')
}

/**
 * Pointer Events rather than touch/mouse pairs: one code path for a finger, a stylus and a mouse,
 * and pinch comes out of tracking two active pointers instead of a separate gesture API.
 */
const active = new Map<number, { x: number; y: number }>()
let pinchStart: { dist: number; scale: number } | null = null

const distance = () => {
    const [a, b] = [...active.values()]
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
}

const onPointerDown = (e: PointerEvent) => {
    if (props.disabled) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    active.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (active.size === 2) pinchStart = { dist: distance(), scale: scale.value }
}

const onPointerMove = (e: PointerEvent) => {
    if (props.disabled) return
    const prev = active.get(e.pointerId)
    if (!prev) return
    active.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (active.size >= 2) {
        // Zoom only while two fingers are down. Panning as well would make the image lurch on the
        // frame a pinch usually ends with, when one finger lifts a moment before the other.
        if (pinchStart && pinchStart.dist > 0)
            setScale((distance() / pinchStart.dist) * pinchStart.scale)
        return
    }
    panBy(e.clientX - prev.x, e.clientY - prev.y)
}

const onPointerUp = (e: PointerEvent) => {
    active.delete(e.pointerId)
    if (active.size < 2) pinchStart = null
}

// Ctrl+wheel is the trackpad pinch; a plain wheel is a scroll and belongs to the page.
const onWheel = (e: WheelEvent) => {
    if (props.disabled || !e.ctrlKey) return
    e.preventDefault()
    setScale(scale.value * (1 - e.deltaY / 200))
}

/**
 * The bytes for the region on screen.
 *
 * Hands back the original File when nothing has been changed: re-encoding an untouched JPEG spends
 * quality to produce the same picture, and the detector reads whatever we send.
 */
const toBlob = async (source: File | Blob, fileName: string): Promise<File | Blob> => {
    // WAIT for the picture to measure rather than reading `natural` and giving up on zero. Returning
    // the source there looks like the harmless "nothing was changed" path and is not: for a
    // non-square image it silently sends bytes that are not what the frame showed, so the boxes come
    // back measured against a picture the user never saw. Bounded, because a decode that never
    // finishes must not hang the run - and past the timeout the original is genuinely all we have.
    await until(ready).toBe(true, { timeout: 5000, throwOnTimeout: false })

    const el = img.value
    if (!el || !ready.value || untouched.value) return source

    const { sx, sy, side } = cropRect(natural.value, size.value, {
        scale: scale.value,
        ...offset.value,
    })
    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    canvas.getContext('2d')?.drawImage(el, sx, sy, side, side, 0, 0, side, side)

    return new Promise((resolve) => {
        canvas.toBlob(
            (blob) => resolve(blob ? new File([blob], fileName, { type: 'image/jpeg' }) : source),
            'image/jpeg',
            0.92,
        )
    })
}

defineExpose({ toBlob, reset, untouched, ready })
</script>

<template>
    <!--
        Padded, not flush. The frame used to run edge to edge, which put its corner brackets under
        the page's own back and history buttons and left nothing between the picture and the screen
        edge to rest a thumb on. A little margin is what makes the crop legible as a crop.

        One inset on all sides (p-6), not the old pt-14: that 56px band existed to keep the frame clear
        of the page's own back and history buttons, and both now live in the app bar. Nothing floats
        over the picture, so the top needs no more room than the sides - and matching them is what
        makes the frame read as inset rather than as pushed down.
    -->
    <div class="tw:flex tw:w-full tw:flex-col tw:gap-3 tw:p-6 tw:pb-1">
        <!--
            touch-none because the browser's own pan/zoom would otherwise claim the gesture before
            a pointermove ever fires - on a touch screen this is the difference between dragging the
            picture and scrolling the page.
        -->
        <div
            ref="frame"
            class="tw:relative tw:aspect-square tw:w-full tw:touch-none tw:overflow-hidden tw:rounded-lg tw:bg-black tw:select-none"
            :class="disabled ? '' : 'tw:cursor-grab active:tw:cursor-grabbing'"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @wheel="onWheel"
        >
            <!-- Centred first, then transformed: the offsets in imageCrop are measured from the
                 centred position, so the two have to agree about where zero is. -->
            <!-- Keyed on the src: a different picture gets a NEW element, so its `load` is always
                 dispatched to a handler that is already attached. Patching the src of a reused
                 element is what leaves room for a decode to land before anyone is listening - and a
                 missed `load` here is not a cosmetic miss, it is `natural` stuck at zero with a
                 perfectly good picture on screen and no crop to compute from it. -->
            <img
                ref="img"
                :key="src"
                :src="src"
                alt="Microscope Image"
                class="tw:absolute tw:top-1/2 tw:left-1/2 tw:max-w-none tw:origin-center"
                :style="{
                    width: `${natural.w}px`,
                    height: `${natural.h}px`,
                    transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                }"
                draggable="false"
                @load="onLoad"
            />

            <!-- The gradient keeps only the hint. The slider moved out from under the picture:
                 the corner brackets end where the frame does, and a control lying across them made
                 both harder to read. -->
            <div
                v-if="!untouched && !disabled"
                class="tw:pointer-events-none tw:absolute tw:inset-x-0 tw:bottom-0 tw:bg-linear-to-t tw:from-black/75 tw:via-black/40 tw:to-transparent tw:pt-10 tw:pb-2.5"
            >
                <!-- Said once, and only while it is true: a square photo at rest is already the
                     whole frame, so telling someone to drag it would be advice to make it worse. -->
                <p class="tw:text-center tw:text-[11px] tw:text-white/75">
                    Drag to move · pinch to zoom
                </p>
            </div>
        </div>

        <!--
            A tick scrubber rather than a track-and-knob, the way iOS shows an adjustment: the value
            reads above it, the ticks give the travel a scale, and the ones behind the thumb fill in
            so the amount is legible without reading the number.

            A real <input type="range"> is still underneath, invisible and full-bleed. It carries the
            dragging, the keyboard (arrows, Home/End), the focus ring and the accessible name - all
            of which a div-and-pointermove reimplementation loses, and none of which the ticks can
            provide. The ticks are decoration over a working control, not a replacement for one.
        -->
        <div v-if="minScale" class="tw:flex tw:flex-col tw:items-center tw:gap-1">
            <span class="tw:text-xs tw:font-semibold tw:text-white tw:tabular-nums">
                {{ zoomFactor.toFixed(1) }}×
            </span>

            <div class="tw:relative tw:h-6 tw:w-full">
                <!-- Ticks: taller every fifth, so the eye has something to count by. Filled up to
                     the thumb, dim beyond it. -->
                <div
                    aria-hidden="true"
                    class="tw:pointer-events-none tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-between"
                >
                    <span
                        v-for="(t, i) in TICKS"
                        :key="i"
                        class="tw:w-px tw:rounded-full tw:transition-colors"
                        :class="[
                            i % 5 === 0 ? 'tw:h-4' : 'tw:h-2.5',
                            i / (TICKS - 1) <= zoomPct ? 'tw:bg-primary' : 'tw:bg-white/30',
                        ]"
                    ></span>
                </div>

                <!-- The thumb: a bar, not a circle. It has to read against a row of bars. -->
                <span
                    aria-hidden="true"
                    class="tw:pointer-events-none tw:absolute tw:top-1/2 tw:h-6 tw:w-1 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:rounded-full tw:bg-white tw:shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
                    :style="{ left: `${zoomPct * 100}%` }"
                ></span>

                <!--
                    min/max/step BEFORE value, and that order is load-bearing. Vue patches attributes
                    in the order they appear, and a range input clamps and step-snaps whatever value
                    it is given against the range it has AT THAT MOMENT. With value first, setting
                    0.099 while min was still the placeholder 1 clamped it to 1, the new max then
                    pulled it down to the top of the range, and step snapped it - leaving the control
                    reading 3.7x while the picture sat at 1x. Nothing looked wrong until the next drag
                    jumped the zoom, because the ticks read `scale` and not the input.
                -->
                <input
                    type="range"
                    :min="minScale"
                    :max="maxScale"
                    :step="(maxScale - minScale) / 100"
                    :value="scale"
                    :disabled="disabled"
                    class="tw:absolute tw:inset-0 tw:h-full tw:w-full tw:cursor-pointer tw:appearance-none tw:bg-transparent tw:opacity-0"
                    aria-label="Zoom"
                    @input="setScale(Number(($event.target as HTMLInputElement).value))"
                />
            </div>
        </div>
    </div>
</template>
