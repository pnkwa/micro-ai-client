<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { EyeOff, ImageOff } from '@lucide/vue'
import type { LibraryImage } from '~/services/imageService'
import type { ImageLoadError } from '~/core/composables/useImageObjectUrls'
import type { QueueRowView } from '~/core/helpers/annotationQueue'
import { metadataTitle } from '~/core/helpers/imageMetadata'

/**
 * One 56px row of the queue.
 *
 * A component per row rather than one observer over a `v-for` ref array, for the reason
 * `McDetectionHistoryRow` records: Vue mutates a `v-for` ref array in place, so a shared observer
 * keeps watching elements detached on the last reload and every row after it stays blank.
 */
const props = defineProps<{
    image: LibraryImage
    view: QueueRowView
    /** Class colours present on this image, as 6px squares. Empty until it has been opened. */
    dots: string[]
    root?: HTMLElement | null
    thumbnail?: string
    error?: ImageLoadError
    selected?: boolean
}>()

const emit = defineEmits<{ visible: []; select: [] }>()

const el = useTemplateRef<HTMLElement>('row')

useIntersectionObserver(
    el,
    ([entry]) => {
        if (entry?.isIntersecting) emit('visible')
    },
    { root: () => props.root, rootMargin: '200px' },
)

const name = computed(() => metadataTitle(props.image.metadata) ?? `IMG_${props.image.id}`)

// Kept as whole literal strings: Tailwind extracts class names from templates, so a class built by
// concatenation in script is never emitted. StatePanel.vue records the same bug from a real build.
const badgeClass = computed(() => {
    switch (props.view.status) {
        case 'reviewed':
            return 'tw:bg-an-accent-tint tw:text-an-accent-hover'
        case 'seeded':
            return 'tw:bg-an-warn-tint tw:text-an-warn'
        case 'empty':
            // Faint, because there is nothing to read - the dash is a placeholder holding the
            // column, not a value.
            return 'tw:bg-an-n-100 tw:text-an-n-300'
        default:
            return 'tw:bg-an-n-100 tw:text-an-n-600'
    }
})

const metaClass = computed(() =>
    props.view.status === 'empty' ? 'tw:text-an-n-300' : 'tw:text-an-n-500',
)
</script>

<template>
    <li ref="row">
        <button
            type="button"
            class="tw:relative tw:flex tw:h-14 tw:w-full tw:items-center tw:gap-2.5 tw:rounded-lg tw:py-0 tw:pr-2 tw:pl-[7px] tw:text-left tw:transition-colors"
            :class="
                selected
                    ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-an-accent'
                    : 'tw:hover:bg-an-n-50'
            "
            @click="emit('select')"
        >
            <!-- The 2px left bar reads as "you are here" at a glance down a long list, where a
                 tint alone does not. -->
            <span
                v-if="selected"
                class="tw:absolute tw:top-2 tw:bottom-2 tw:left-0 tw:w-0.5 tw:rounded-full tw:bg-an-accent"
            ></span>

            <span
                class="tw:h-[42px] tw:w-[42px] tw:shrink-0 tw:overflow-hidden tw:rounded-md tw:bg-an-canvas"
            >
                <img
                    v-if="thumbnail"
                    :src="thumbnail"
                    :alt="name"
                    class="tw:h-full tw:w-full tw:object-cover"
                />
                <span
                    v-else-if="error"
                    class="tw:flex tw:h-full tw:w-full tw:items-center tw:justify-center tw:text-an-d-disabled"
                >
                    <EyeOff v-if="error === 'forbidden'" class="tw:h-4 tw:w-4" />
                    <ImageOff v-else class="tw:h-4 tw:w-4" />
                </span>
                <McSkeleton v-else class="tw:h-full tw:w-full tw:rounded-none" />
            </span>

            <span class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-[3px]">
                <span
                    class="tw:truncate tw:font-mono tw:text-[11.5px] tw:font-medium tw:text-an-n-700"
                >
                    {{ name }}
                </span>
                <span class="tw:flex tw:items-center tw:gap-1.5">
                    <span
                        v-for="(dot, index) in dots"
                        :key="index"
                        class="tw:h-1.5 tw:w-1.5 tw:shrink-0 tw:rounded-[2px]"
                        :style="{ background: dot }"
                    ></span>
                    <span class="tw:truncate tw:text-[10.5px]" :class="metaClass">
                        {{ view.meta }}
                    </span>
                </span>
            </span>

            <!-- Always a badge, even with nothing to count: an em dash keeps the column aligned
                 down the list, and a missing badge reads as a row that failed to render rather than
                 as an image with no shapes. -->
            <span
                class="tw:flex tw:h-[19px] tw:min-w-[19px] tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[5px] tw:px-1.5 tw:font-mono tw:text-[10.5px] tw:font-semibold tw:tabular-nums"
                :class="badgeClass"
            >
                {{ view.badge ?? '–' }}
            </span>
        </button>
    </li>
</template>
