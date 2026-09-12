<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { useAnnotatorLayout } from '~/core/composables/useAnnotatorLayout'

/** One cell of the touch filmstrip. */
export interface PagerStripItem {
    id: number
    thumb: string | null
    active: boolean
    /** The thumbnail fetch failed. Distinguishes a permanent broken tile from one still loading. */
    failed?: boolean
}

/**
 * Where you are in the batch, with the two keys that move through it.
 *
 * Duplicates J/K on purpose: the keyboard path is the fast one, and this is how someone finds out
 * it exists.
 *
 * On a touch layout it is a FULL-WIDTH FILMSTRIP of the whole loaded batch, scrolled like an iPhone
 * picker wheel - square thumbnails (the frames are square) under a FIXED green frame at the centre
 * of the bar: the strip slides beneath it and whatever settles under it is the active image, so the
 * marker holds still while the pictures move. A tap on any cell jumps to it. Thumbnails load lazily
 * as their cell scrolls in (`reveal`), so a batch of hundreds does not fetch every thumb up front.
 * The desktop keeps the top-right text pill, which is exact and costs no image fetches.
 *
 * DARK, like every other overlay. They sit over a microscopy field that is mostly bright, so a light
 * pill disappears into it; the dark ground is what separates chrome from picture at a glance.
 */
const props = defineProps<{
    name: string
    index: number
    total: number
    /** The whole loaded batch, in order, for the filmstrip on a touch layout. */
    strip?: PagerStripItem[]
    /**
     * Sit in the layout as a full-width strip rather than FLOAT over the picture. Used on a stacked
     * phone, where the shell gives the pager its own row so the image is never hidden under it -
     * the same rule the bottom tool/class bars follow.
     */
    docked?: boolean
}>()

const emit = defineEmits<{
    previous: []
    next: []
    select: [id: number]
    /** A cell scrolled into view and wants its thumbnail fetched. */
    reveal: [id: number]
}>()

const { isTouchLayout } = useAnnotatorLayout()

// Middle-ellipsis for a long filename: the head truncates with an ellipsis while a fixed tail stays
// readable, so `B27 (A4 HL)_A` keeps its distinguishing suffix. `· i/total` is kept OUTSIDE this span
// so the counter is never clipped, and the full name is in the tooltip.
const NAME_TAIL = 8
const nameHead = computed(() =>
    props.name.length > NAME_TAIL ? props.name.slice(0, -NAME_TAIL) : props.name,
)
const nameTail = computed(() => (props.name.length > NAME_TAIL ? props.name.slice(-NAME_TAIL) : ''))

// A short viewport - a phone in landscape, mostly - has little height to spare, and a filmstrip is
// pure height. So the whole bar shrinks: smaller cells and frame, tighter padding, smaller arrows.
// The end padding has to track the cell size (it is half a cell, so any cell can reach the centre
// frame), which is why these are paired computeds rather than loose classes.
const isShort = useMediaQuery('(max-height: 640px)')
const cellSize = computed(() => (isShort.value ? 'tw:size-5' : 'tw:size-12'))
const cellPx = computed(() => (isShort.value ? 20 : 48))
const navBtn = computed(() => (isShort.value ? 'tw:h-5 tw:w-5' : 'tw:h-8 tw:w-8'))
const chevron = computed(() => (isShort.value ? 'tw:h-3.5 tw:w-3.5' : 'tw:h-4 tw:w-4'))

// The whole root: docked is a full-width strip in the layout (a divider under it, no float, no
// rounding); otherwise it FLOATS - the top-right text pill on desktop, the centred filmstrip over
// the canvas on a touch layout, shrunk on a short (landscape) viewport.
const rootClass = computed(() => {
    const base = 'tw:flex tw:items-center tw:bg-an-overlay'
    if (props.docked)
        return `${base} tw:relative tw:w-full tw:justify-between tw:border-b tw:border-white/[0.09] tw:gap-2 tw:px-3 tw:py-1.5`
    const float = `${base}/95 tw:absolute tw:z-10 tw:rounded-[10px] tw:border tw:border-white/[0.09] tw:backdrop-blur`
    if (!isTouchLayout.value) return `${float} tw:right-3 tw:top-3 tw:gap-1 tw:p-1`
    return isShort.value
        ? `${float} tw:inset-x-3 tw:top-2 tw:justify-between tw:gap-1 tw:p-0.5`
        : `${float} tw:inset-x-3 tw:top-3 tw:justify-between tw:gap-2 tw:p-1.5`
})

const scroller = useTemplateRef<HTMLElement>('scroller')

/**
 * Half a strip minus half a cell: the room at each end that lets ANY cell - including the first and
 * last - be scrolled to sit exactly under the fixed centre frame. On a SHORT batch this room is the
 * entire scroll range, because three thumbnails already fit in the bar with nothing left to scroll.
 *
 * It is rendered as real SPACER ELEMENTS (see the template), not as padding on the scroller, and
 * that distinction is the bug this cost a long hunt: a scroll container's END padding is not part of
 * its scrollable overflow region in every engine. With `padding: calc(50% - 1.5rem)` a three-image
 * strip measured scrollWidth === clientWidth === 716 - literally no scroll range - because only the
 * leading 334px counted and 334 + 156 of cells is less than the 716px viewport. Flex items always
 * count, so spacers give the honest 824px and the ~108px of travel the centre frame needs.
 *
 * A long batch never exposed this: 30 cells overflow on their own and never needed the end room,
 * which is why the instructor's annotator scrolled while a three-image assignment did not.
 *
 * Measured in pixels (`border-box`, so the reading is the laid-out width and does not chase the
 * value derived from it) rather than a percentage, so the two spacers and the centring arithmetic
 * agree on one number.
 */
const { width: scrollerWidth } = useElementSize(scroller, undefined, { box: 'border-box' })
const padPx = computed(() => Math.max(0, Math.round(scrollerWidth.value / 2 - cellPx.value / 2)))

// Lazy-load each thumbnail as its cell nears the strip. A generous horizontal rootMargin fetches a
// little ahead of the scroll so a thumbnail is usually there by the time it is on screen.
let observer: IntersectionObserver | undefined
const observed = new Set<number>()
const syncObserver = () => {
    if (!observer || !scroller.value) return
    for (const el of scroller.value.querySelectorAll<HTMLElement>('[data-pager-id]')) {
        const id = Number(el.dataset.pagerId)
        if (observed.has(id)) continue
        observed.add(id)
        observer.observe(el)
    }
}

// Keep the active thumbnail centred as you step, the way a photo strip tracks the open shot. Guarded
// by `centering`: the scroll this CAUSES must not read back as a user scroll and re-select, which was
// looping the strip back to the first image. Instant, not smooth, so the guard window stays short.
let centering = false
let centeringTimer: ReturnType<typeof setTimeout> | undefined
const centerActive = () =>
    nextTick(() => {
        const el = scroller.value?.querySelector<HTMLElement>('[data-active]')
        if (!el) return
        centering = true
        el.scrollIntoView({ inline: 'center', block: 'nearest' })
        clearTimeout(centeringTimer)
        centeringTimer = setTimeout(() => (centering = false), 250)
    })

onMounted(() => {
    if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue
                    const id = Number((entry.target as HTMLElement).dataset.pagerId)
                    if (id) emit('reveal', id)
                    observer?.unobserve(entry.target)
                }
            },
            { root: scroller.value, rootMargin: '0px 400px' },
        )
        syncObserver()
    }
    void centerActive()
})
onBeforeUnmount(() => observer?.disconnect())

// New images appended to the batch → start observing them too.
watch(
    () => props.strip?.length,
    () => nextTick(syncObserver),
)
// The active image changed (a step, or a jump) → re-centre it.
//
// `padPx` is watched alongside it because the FIRST render has no room to centre into: the end
// spacers are sized from a measured width, and until the ResizeObserver reports one `padPx` is 0, so
// the mount-time centre is a no-op and the page opened with image 1 sitting left of the green frame.
// When the real width lands the spacers grow and the strip has to be put back under the frame. This
// covers rotation and resize for free, since those move `padPx` too.
watch(
    [() => props.strip?.find((cell) => cell.active)?.id, padPx],
    () => void centerActive(),
)
// The strip only exists on a touch layout; when a resize brings it in, observe its cells and centre.
watch(isTouchLayout, (on) => {
    if (on) nextTick(() => (syncObserver(), void centerActive()))
})

/**
 * Scrolling the strip SELECTS the image under the centre, the way a picker wheel does. Fired on
 * settle (a short debounce after the last scroll event, so a flick through fifty frames is one
 * select, not fifty), and only when the centred cell is not already the active one - which also
 * stops the programmatic re-centre from looping back into a select.
 */
let settleTimer: ReturnType<typeof setTimeout> | undefined
const selectCentred = () => {
    const el = scroller.value
    if (!el) return
    const centre = el.scrollLeft + el.clientWidth / 2
    let nearest: { id: number; dist: number } | undefined
    for (const cell of el.querySelectorAll<HTMLElement>('[data-pager-id]')) {
        const dist = Math.abs(cell.offsetLeft + cell.offsetWidth / 2 - centre)
        if (!nearest || dist < nearest.dist) nearest = { id: Number(cell.dataset.pagerId), dist }
    }
    const active = props.strip?.find((cell) => cell.active)?.id
    if (nearest && nearest.id !== active) emit('select', nearest.id)
}
const onScroll = () => {
    if (centering) return // our own re-centre, not the user
    clearTimeout(settleTimer)
    settleTimer = setTimeout(selectCentred, 140)
}
onBeforeUnmount(() => {
    clearTimeout(settleTimer)
    clearTimeout(centeringTimer)
})
</script>

<template>
    <div :class="rootClass">
        <button
            type="button"
            class="tw:flex tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white tw:disabled:text-an-d-disabled tw:disabled:opacity-100"
            :class="isTouchLayout ? navBtn : 'tw:h-6 tw:w-6'"
            :disabled="index <= 1"
            title="Previous image (K)"
            aria-label="Previous image"
            @click="emit('previous')"
        >
            <ChevronLeft :class="isTouchLayout ? chevron : 'tw:h-4 tw:w-4'" />
        </button>

        <!-- Touch: the scrollable filmstrip of the whole loaded batch, an iOS picker wheel laid flat.
             SQUARE cells (the frames are square, so a wide cell would crop them to an unreadable
             strip), all the same size and slightly dimmed except the one under the centre frame.
             A tap on any cell jumps to it. -->
        <!-- The green frame is FIXED at the centre of the bar, not drawn on a thumbnail: the strip
             scrolls under it and whatever settles beneath it is the active image, so the marker
             holds still while the pictures move (the picker-wheel read). -->
        <!-- The end padding (see `padPx`) is half a strip minus half a cell, so ANY cell - including
             the first and last - can be scrolled to sit exactly under the centre frame. It is applied
             as measured pixels, not a percentage: see the note on `padPx`. -->
        <div v-if="isTouchLayout" class="tw:relative tw:flex tw:min-w-0 tw:flex-1">
            <!-- `snap-proximity` rather than `snap-mandatory`, and an explicit `touch-action: pan-x`:
                 a short batch has only a cell or two of travel, and mandatory snap re-pinning that
                 little range leaves nothing for a finger to move. Proximity still settles a cell
                 under the centre frame while leaving the drag room to register. -->
            <div
                ref="scroller"
                class="mc-no-scrollbar tw:flex tw:min-w-0 tw:flex-1 tw:snap-x tw:snap-proximity tw:items-center tw:gap-1.5 tw:overflow-x-scroll tw:[touch-action:pan-x]"
                @scroll="onScroll"
            >
                <!-- Half-a-strip of room at each end, as real SPACER ELEMENTS rather than padding on
                     the scroller. A scroll container's END padding is not counted in the scrollable
                     overflow region by every engine (iOS Safari drops it), so on a short batch the
                     strip ended up with scrollWidth === clientWidth - no scroll range at all, and the
                     last cell could never reach the centre frame. Flex items always count. -->
                <div class="tw:shrink-0" :style="{ width: `${padPx}px` }" aria-hidden="true"></div>
                <button
                    v-for="(cell, i) in strip ?? []"
                    :key="cell.id"
                    :data-pager-id="cell.id"
                    :data-active="cell.active ? '' : undefined"
                    type="button"
                    class="tw:shrink-0 tw:snap-center tw:overflow-hidden tw:rounded-md tw:transition-opacity"
                    :class="[cellSize, cell.active ? '' : 'tw:opacity-50 tw:hover:opacity-90']"
                    :aria-label="cell.active ? name : 'Go to this image'"
                    @click="emit('select', cell.id)"
                >
                    <img
                        v-if="cell.thumb"
                        :src="cell.thumb"
                        :alt="cell.active ? name : ''"
                        class="tw:h-full tw:w-full tw:object-cover"
                    />
                    <!-- Failed fetch: a neutral tile showing its position, never a blank box that
                         reads as a bug. Otherwise a pulsing skeleton until the thumb lands. -->
                    <span
                        v-else-if="cell.failed"
                        class="tw:flex tw:h-full tw:w-full tw:items-center tw:justify-center tw:bg-white/5 tw:font-mono tw:text-[10px] tw:text-an-d-disabled"
                    >
                        {{ String(i + 1).padStart(2, '0') }}
                    </span>
                    <span
                        v-else
                        class="tw:block tw:h-full tw:w-full tw:animate-pulse tw:bg-white/10"
                    ></span>
                </button>
                <div class="tw:shrink-0" :style="{ width: `${padPx}px` }" aria-hidden="true"></div>
            </div>

            <!-- The fixed centre frame the strip scrolls under. `pointer-events-none` so taps pass
                 through to the cell beneath it. Just the frame - no count, so the picture under it is
                 unobstructed. -->
            <div
                class="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-1/2 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:rounded-md tw:ring-2 tw:ring-an-accent"
                :class="cellSize"
            ></div>
        </div>

        <!-- Desktop: the exact text pill, no image fetches. The name middle-truncates at 240px; the
             counter is kept outside the truncated span so it is never cut. -->
        <span
            v-else
            class="tw:flex tw:min-w-0 tw:items-center tw:px-1 tw:text-[12px] tw:text-an-d-text"
        >
            <span class="tw:flex tw:max-w-[240px] tw:min-w-0 tw:font-mono" :title="name">
                <span class="tw:truncate">{{ nameHead }}</span>
                <span v-if="nameTail" class="tw:shrink-0 tw:whitespace-pre">{{ nameTail }}</span>
            </span>
            <span class="tw:mx-1 tw:shrink-0 tw:text-an-d-disabled">·</span>
            <span class="tw:shrink-0 tw:font-mono tw:tabular-nums">{{ index }}/{{ total }}</span>
        </span>

        <button
            type="button"
            class="tw:flex tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white tw:disabled:text-an-d-disabled tw:disabled:opacity-100"
            :class="isTouchLayout ? navBtn : 'tw:h-6 tw:w-6'"
            :disabled="index >= total"
            title="Next image (J)"
            aria-label="Next image"
            @click="emit('next')"
        >
            <ChevronRight :class="isTouchLayout ? chevron : 'tw:h-4 tw:w-4'" />
        </button>
    </div>
</template>
