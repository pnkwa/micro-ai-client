<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { useAnnotatorLayout } from '~/core/composables/useAnnotatorLayout'

/** One cell of the touch filmstrip. */
export interface PagerStripItem {
    id: number
    thumb: string | null
    active: boolean
}

/**
 * Where you are in the batch, with the two keys that move through it.
 *
 * Duplicates J/K on purpose: the keyboard path is the fast one, and this is how someone finds out
 * it exists.
 *
 * On a touch layout it is a FULL-WIDTH FILMSTRIP of the whole loaded batch, scrolled like an iPhone
 * photo strip - square thumbnails (the frames are square), the active one ringed and kept centred,
 * a tap on any other jumps to it. Thumbnails load lazily as their cell scrolls in (`reveal`), so a
 * batch of hundreds does not fetch every thumb up front. The desktop keeps the top-right text pill,
 * which is exact and costs no image fetches.
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
}>()

const emit = defineEmits<{
    previous: []
    next: []
    select: [id: number]
    /** A cell scrolled into view and wants its thumbnail fetched. */
    reveal: [id: number]
}>()

const { isTouchLayout } = useAnnotatorLayout()

const scroller = useTemplateRef<HTMLElement>('scroller')

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
watch(
    () => props.strip?.find((cell) => cell.active)?.id,
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
    <div
        class="tw:absolute tw:top-3 tw:z-10 tw:flex tw:items-center tw:rounded-[10px] tw:border tw:border-white/[0.09] tw:bg-an-overlay/95 tw:backdrop-blur"
        :class="
            isTouchLayout
                ? 'tw:inset-x-3 tw:justify-between tw:gap-2 tw:p-1.5'
                : 'tw:right-3 tw:gap-1 tw:p-1'
        "
    >
        <button
            type="button"
            class="tw:flex tw:h-8 tw:w-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-30"
            :class="isTouchLayout ? '' : 'tw:h-6 tw:w-6'"
            :disabled="index <= 1"
            title="Previous image (K)"
            aria-label="Previous image"
            @click="emit('previous')"
        >
            <ChevronLeft class="tw:h-4 tw:w-4" />
        </button>

        <!-- Touch: the scrollable filmstrip of the whole loaded batch. SQUARE cells (the frames are
             square, so a wide cell would crop them to an unreadable strip); the active one is ringed
             and stays centred, a tap on any other jumps to it. -->
        <!-- `px-[calc(50%-1.5rem)]`: half-strip padding at each end so ANY cell - including the first
             and last - can be scrolled to the exact centre. That is what locks the active thumbnail
             in the middle slot rather than letting it sit off-centre near the ends of the batch. -->
        <div
            v-if="isTouchLayout"
            ref="scroller"
            class="tw:flex tw:min-w-0 tw:flex-1 tw:snap-x tw:snap-mandatory tw:items-center tw:gap-1.5 tw:overflow-x-auto tw:px-[calc(50%-1.5rem)]"
            @scroll="onScroll"
        >
            <template v-for="cell in strip ?? []" :key="cell.id">
                <div
                    v-if="cell.active"
                    :data-pager-id="cell.id"
                    data-active
                    class="tw:relative tw:size-12 tw:shrink-0 tw:snap-center tw:overflow-hidden tw:rounded-md tw:ring-2 tw:ring-an-accent"
                >
                    <img
                        v-if="cell.thumb"
                        :src="cell.thumb"
                        :alt="name"
                        class="tw:h-full tw:w-full tw:object-cover"
                    />
                    <div v-else class="tw:h-full tw:w-full tw:bg-white/10"></div>
                    <span
                        class="tw:absolute tw:inset-x-0 tw:bottom-0 tw:bg-black/55 tw:text-center tw:font-mono tw:text-[9px] tw:leading-[13px] tw:tabular-nums tw:text-white"
                    >
                        {{ index }}/{{ total }}
                    </span>
                </div>
                <button
                    v-else
                    :data-pager-id="cell.id"
                    type="button"
                    class="tw:size-11 tw:shrink-0 tw:snap-center tw:overflow-hidden tw:rounded-md tw:opacity-70 tw:ring-1 tw:ring-white/15 tw:hover:opacity-100"
                    aria-label="Go to this image"
                    @click="emit('select', cell.id)"
                >
                    <img
                        v-if="cell.thumb"
                        :src="cell.thumb"
                        alt=""
                        class="tw:h-full tw:w-full tw:object-cover"
                    />
                    <div v-else class="tw:h-full tw:w-full tw:bg-white/10"></div>
                </button>
            </template>
        </div>

        <!-- Desktop: the exact text pill, no image fetches. -->
        <span v-else class="tw:px-1 tw:text-[12px] tw:text-an-d-text">
            <span class="tw:font-mono">{{ name }}</span>
            <span class="tw:mx-1 tw:text-an-d-disabled">·</span>
            <span class="tw:font-mono tw:tabular-nums">{{ index }}/{{ total }}</span>
        </span>

        <button
            type="button"
            class="tw:flex tw:h-8 tw:w-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-30"
            :class="isTouchLayout ? '' : 'tw:h-6 tw:w-6'"
            :disabled="index >= total"
            title="Next image (J)"
            aria-label="Next image"
            @click="emit('next')"
        >
            <ChevronRight class="tw:h-4 tw:w-4" />
        </button>
    </div>
</template>
