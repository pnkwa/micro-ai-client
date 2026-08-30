<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import type { LibraryImage } from '~/services/imageService'
import type { QueueRowView } from '~/core/helpers/annotationQueue'

/**
 * One square of the queue in grid mode.
 *
 * *** IT ASKS FOR ITS OWN THUMBNAIL WHEN IT SCROLLS INTO VIEW. *** The grid used to load on
 * `pointerenter`, which looked fine on a desktop and was wrong twice: a finger never hovers, so on
 * a tablet nothing loaded at all, and switching from list to grid showed three times as many tiles
 * as the list had ever fetched - so most of them sat as skeletons until the pointer wandered over
 * each one in turn.
 *
 * A component per tile rather than one observer over a `v-for` ref array, for the reason `QueueRow`
 * records: Vue mutates a `v-for` ref array in place, so a shallow ref holding it never triggers and
 * the observer keeps watching elements detached on the last reload.
 */
const props = defineProps<{
    image: LibraryImage
    view: QueueRowView
    /** The scrolling container, as the observer's root. */
    root?: HTMLElement | null
    thumbnail?: string
    selected?: boolean
}>()

const emit = defineEmits<{ visible: []; select: [] }>()

const el = useTemplateRef<HTMLElement>('tile')

useIntersectionObserver(
    el,
    ([entry]) => {
        if (entry?.isIntersecting) emit('visible')
    },
    // A screen's worth of lead, the same as the list, so switching mode does not restart the
    // fetching from whatever happens to be exactly on screen.
    { root: () => props.root, rootMargin: '200px' },
)

/** Follows the selection, so the arrow keys walk the grid rather than losing it off an edge. */
watch(
    () => props.selected,
    (selected) => {
        if (selected) el.value?.scrollIntoView({ block: 'nearest' })
    },
    { immediate: true },
)
</script>

<template>
    <li ref="tile">
        <button
            type="button"
            class="tw:relative tw:block tw:aspect-square tw:w-full tw:overflow-hidden tw:rounded-[7px] tw:bg-an-canvas"
            :class="selected ? 'tw:ring-2 tw:ring-an-accent' : ''"
            @click="emit('select')"
        >
            <img
                v-if="thumbnail"
                :src="thumbnail"
                alt=""
                loading="lazy"
                decoding="async"
                class="tw:h-full tw:w-full tw:object-cover"
            />
            <McSkeleton v-else class="tw:h-full tw:w-full tw:rounded-none" />
            <span
                v-if="view.badge !== null"
                class="tw:absolute tw:right-1 tw:bottom-1 tw:flex tw:h-[17px] tw:min-w-[17px] tw:items-center tw:justify-center tw:rounded tw:bg-black/70 tw:px-1 tw:font-mono tw:text-[10px] tw:font-semibold tw:text-white"
            >
                {{ view.badge }}
            </span>
        </button>
    </li>
</template>
