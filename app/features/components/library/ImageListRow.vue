<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { EyeOff, ImageOff, Loader2, Star } from '@lucide/vue'
import type { LibraryImage } from '~/services/imageService'
import type { ImageLoadError } from '~/core/composables/useImageObjectUrls'
import type { QueueRowView } from '~/core/helpers/annotationQueue'
import { imageDisplayName } from '~/core/helpers/imageName'
import { formatDay } from '~/core/helpers/dateFormat'

/**
 * One row of the library in list mode.
 *
 * *** IT ASKS FOR ITS OWN THUMBNAIL. *** The rows were written inline in the grid, where only the
 * CARDS carried a visibility observer, so in list mode nothing ever called `load()` and every row
 * showed an empty black square. A component per row is what fixes that, and it is the same shape
 * `ImageGridTile` and the annotator's `QueueRow` already take, for the reason those record: Vue
 * mutates a `v-for` ref array in place, so one observer over an array of refs goes stale.
 */
const props = defineProps<{
    image: LibraryImage
    /** From `queueRowView`, so the row and the card cannot disagree about status. */
    view: QueueRowView
    /** The scrolling container, as the observer's root. */
    root?: HTMLElement | null
    thumbnail?: string
    error?: ImageLoadError
    selected?: boolean
}>()

const emit = defineEmits<{
    visible: []
    select: [modifiers: { shift: boolean; meta: boolean }]
}>()

const el = useTemplateRef<HTMLElement>('row')

useIntersectionObserver(
    el,
    ([entry]) => {
        if (entry?.isIntersecting) emit('visible')
    },
    { root: () => props.root, rootMargin: '200px' },
)

const caption = computed(() => imageDisplayName(props.image.metadata, props.image.id))
</script>

<template>
    <li ref="row" class="tw:border-b tw:border-an-divider tw:last:border-b-0">
        <button
            type="button"
            class="tw:flex tw:h-11 tw:w-full tw:items-center tw:gap-3 tw:rounded-md tw:px-2 tw:text-left tw:transition-colors"
            :class="selected ? 'tw:bg-an-accent-tint' : 'tw:hover:bg-an-n-50'"
            @click="
                emit('select', { shift: $event.shiftKey, meta: $event.metaKey || $event.ctrlKey })
            "
        >
            <!--
                A SPINNER, not a skeleton. At 40x32 a shimmer is indistinguishable from an empty
                box, which is exactly what the row looked like while it was fetching nothing at all,
                so the state that says "working" has to be unmistakably a moving thing.
            -->
            <span
                class="tw:flex tw:h-8 tw:w-10 tw:shrink-0 tw:items-center tw:justify-center tw:overflow-hidden tw:rounded tw:bg-an-canvas"
            >
                <img
                    v-if="thumbnail"
                    :src="thumbnail"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    class="tw:h-full tw:w-full tw:object-cover"
                />
                <EyeOff
                    v-else-if="error === 'forbidden'"
                    class="tw:h-3.5 tw:w-3.5 tw:text-an-d-disabled"
                />
                <ImageOff v-else-if="error" class="tw:h-3.5 tw:w-3.5 tw:text-an-d-disabled" />
                <Loader2 v-else class="tw:h-3.5 tw:w-3.5 tw:animate-spin tw:text-an-d-disabled" />
            </span>
            <span
                class="tw:min-w-0 tw:flex-1 tw:truncate tw:font-mono tw:text-[12px] tw:text-an-n-700"
            >
                {{ caption }}
            </span>
            <Star
                v-if="image.in_curated_album"
                class="tw:h-3.5 tw:w-3.5 tw:shrink-0 tw:text-an-n-400"
                title="In a curated album"
            />
            <!--
                The status line says the count in words - "2 shapes", "no shapes yet" - so the
                icon-and-number column beside it was the same fact twice, one of them abbreviated.
                Gone; `view.meta` is the one that also covers "reviewed" and "seeded".
            -->
            <span class="tw:w-28 tw:shrink-0 tw:truncate tw:text-[11.5px] tw:text-an-n-500">
                {{ view.meta }}
            </span>
            <span
                class="tw:w-24 tw:shrink-0 tw:text-right tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-faint"
            >
                {{ formatDay(image.created_at) }}
            </span>
        </button>
    </li>
</template>
