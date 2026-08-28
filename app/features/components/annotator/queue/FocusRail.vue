<script setup lang="ts">
import { PanelLeft } from '@lucide/vue'
import type { LibraryImage } from '~/services/imageService'
import { useImageObjectUrls } from '~/core/composables/useImageObjectUrls'

/**
 * Focus mode's 52px rail: the batch reduced to thumbnails.
 *
 * Not the queue panel narrowed - a different thing. Focus mode drops search, filters, progress and
 * status because none of them are what you need mid-pass; what you do need is where you are and
 * what is next, so the rail is thumbnails and a position, on the canvas's own dark ground.
 */
const props = defineProps<{
    images: LibraryImage[]
    selectedId: number | null
    position: number
}>()

const emit = defineEmits<{ select: [id: number]; expand: [] }>()

const { urls, load } = useImageObjectUrls()

// A window around the current image rather than all of them: the rail is one column tall and
// scrolling it defeats the point of a rail you glance at.
const window = computed(() => {
    const index = Math.max(0, props.position - 1)
    return props.images.slice(Math.max(0, index - 3), index + 5)
})

watchEffect(() => {
    for (const image of window.value) void load(image.id, 'thumb')
})
</script>

<template>
    <div
        class="tw:flex tw:h-full tw:w-full tw:flex-col tw:items-center tw:gap-1 tw:border-r tw:border-white/5 tw:bg-an-rail tw:py-2.5"
    >
        <button
            type="button"
            class="tw:flex tw:h-8 tw:w-8 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white"
            aria-label="Leave focus mode"
            title="Leave focus mode (F)"
            @click="emit('expand')"
        >
            <PanelLeft class="tw:h-4 tw:w-4" />
        </button>

        <div class="tw:my-1 tw:h-px tw:w-6 tw:bg-white/10"></div>

        <button
            v-for="image in window"
            :key="image.id"
            type="button"
            class="tw:h-9 tw:w-9 tw:shrink-0 tw:overflow-hidden tw:rounded-lg tw:transition-opacity"
            :class="
                image.id === selectedId
                    ? 'tw:opacity-100 tw:ring-2 tw:ring-an-accent'
                    : 'tw:opacity-45 tw:hover:opacity-80'
            "
            :aria-current="image.id === selectedId"
            @click="emit('select', image.id)"
        >
            <img
                v-if="urls[image.id]"
                :src="urls[image.id]"
                alt=""
                class="tw:h-full tw:w-full tw:object-cover"
            />
            <span v-else class="tw:block tw:h-full tw:w-full tw:bg-white/5"></span>
        </button>

        <div class="tw:flex-1"></div>
        <span class="tw:font-mono tw:text-[10px] tw:text-an-d-disabled">{{ position }}</span>
        <span class="tw:font-mono tw:text-[10px] tw:text-white/25">/{{ images.length }}</span>
    </div>
</template>
