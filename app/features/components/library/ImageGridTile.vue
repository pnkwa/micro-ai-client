<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { EyeOff, ImageOff, Shapes, Star } from '@lucide/vue'
import type { LibraryImage } from '~/services/imageService'
import type { ImageLoadError } from '~/core/composables/useImageObjectUrls'
import { metadataTitle } from '~/core/helpers/imageMetadata'
import { IMAGE_DRAG_TYPE } from '~/core/constant/drag'

/**
 * One tile, which asks for its own thumbnail when it scrolls into view.
 *
 * A component per tile rather than one observer over a `v-for` ref array, for the reason
 * `McDetectionHistoryRow` records: Vue MUTATES a `v-for` ref array in place rather than assigning a
 * new one, so a shallow ref holding it never triggers and `useIntersectionObserver` keeps observing
 * `<li>`s that were detached on the last reload. Every row after a refresh stayed blank. A tile that
 * owns its observer has nothing to go stale.
 *
 * The grid keeps the cache and does the fetching; this only says "I am visible".
 */
const props = defineProps<{
    image: LibraryImage
    /** The scrolling container, as the observer's root. */
    root?: HTMLElement | null
    /** Object URL of the already-loaded thumbnail, if there is one. */
    thumbnail?: string
    error?: ImageLoadError
    selected?: boolean
}>()

const emit = defineEmits<{ visible: []; select: [] }>()

const el = useTemplateRef<HTMLElement>('tile')

useIntersectionObserver(
    el,
    ([entry]) => {
        if (entry?.isIntersecting) emit('visible')
    },
    // A screen's worth of lead, so a tile is fetched shortly before it is looked at. At ~20 KB a
    // thumbnail the cost of being early is negligible.
    { root: () => props.root, rootMargin: '200px' },
)

// Falls back to the id because an untitled image still has to be identifiable, and nothing else on
// the row is human-readable - `content_hash` is 64 hex characters.
const caption = computed(() => metadataTitle(props.image.metadata) ?? `Image ${props.image.id}`)

const onDragStart = (event: DragEvent) => {
    if (!event.dataTransfer) return
    event.dataTransfer.setData(IMAGE_DRAG_TYPE, String(props.image.id))
    event.dataTransfer.setData('text/plain', String(props.image.id))
    event.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
    <li ref="tile" draggable="true" @dragstart="onDragStart">
        <button
            type="button"
            class="tw:group tw:w-full tw:cursor-grab tw:overflow-hidden tw:rounded-lg tw:border tw:bg-white tw:text-left tw:transition-colors tw:active:cursor-grabbing"
            :class="
                selected
                    ? 'tw:border-primary tw:ring-2 tw:ring-primary/30'
                    : 'tw:border-navy-15 tw:hover:border-primary/50'
            "
            @click="emit('select')"
        >
            <div class="tw:relative tw:aspect-square tw:bg-slate-950">
                <img
                    v-if="thumbnail"
                    :src="thumbnail"
                    :alt="caption"
                    class="tw:h-full tw:w-full tw:object-cover"
                />
                <!--
                    A 403 is a realistic answer on image bytes now that the id is an integer and
                    BE-ADR-031's permission union is still deferred, so it gets its own icon and
                    wording. Previously the only realistic failure was a 404, and rendering both as
                    a broken-image icon would leave someone retrying something they are not allowed
                    to see.
                -->
                <div
                    v-else-if="error"
                    class="tw:flex tw:h-full tw:w-full tw:flex-col tw:items-center tw:justify-center tw:gap-1 tw:px-2 tw:text-center tw:text-navy-40"
                >
                    <EyeOff v-if="error === 'forbidden'" class="tw:h-5 tw:w-5" />
                    <ImageOff v-else class="tw:h-5 tw:w-5" />
                    <span class="tw:text-[10px]">
                        {{ error === 'forbidden' ? 'Not available to you' : 'Image unavailable' }}
                    </span>
                </div>
                <McSkeleton v-else class="tw:h-full tw:w-full tw:rounded-none" />

                <div class="tw:absolute tw:top-1.5 tw:right-1.5 tw:flex tw:gap-1">
                    <!-- Vetted, which is now only about question authoring: annotation stopped
                         being gated on it when BE-ADR-030 was amended on 2026-08-26. -->
                    <span
                        v-if="image.in_curated_album"
                        class="tw:flex tw:items-center tw:gap-1 tw:rounded tw:bg-black/60 tw:px-1.5 tw:py-0.5 tw:text-[10px] tw:font-medium tw:text-white"
                        title="In a curated album, so it can be used to author a question"
                    >
                        <Star class="tw:h-3 tw:w-3" />
                    </span>
                    <span
                        v-if="image.annotation_count > 0"
                        class="tw:flex tw:items-center tw:gap-1 tw:rounded tw:bg-primary tw:px-1.5 tw:py-0.5 tw:text-[10px] tw:font-medium tw:text-white"
                        :title="`${image.annotation_count} annotation(s)`"
                    >
                        <Shapes class="tw:h-3 tw:w-3" />
                        {{ image.annotation_count }}
                    </span>
                </div>
            </div>

            <p class="tw:truncate tw:px-2 tw:py-1.5 tw:text-xs tw:text-navy-80" :title="caption">
                {{ caption }}
            </p>
        </button>
    </li>
</template>
