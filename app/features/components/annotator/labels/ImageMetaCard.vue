<script setup lang="ts">
import { ChevronDown, ChevronUp } from '@lucide/vue'
import type { LibraryImage } from '~/services/imageService'
import { metadataEntries, metadataTitle } from '~/core/helpers/imageMetadata'

/**
 * The pinned footer: what this image is, and the one control that says it is done.
 *
 * Metadata is READ-ONLY here. The library's detail panel is where the bag is edited, and two forms
 * writing one shallow-merged object is how a key gets clobbered.
 */
const props = defineProps<{
    image: LibraryImage | null
    reviewed: boolean
    saving: boolean
    /** 1-based place in the queue, for the card's title. */
    position?: number
    /** Natural pixel size, once the canvas has measured it. */
    dimensions?: { w: number; h: number } | null
    /** The model this image's shapes were seeded from, this session. */
    seededBy?: string | null
}>()

const emit = defineEmits<{ 'update:reviewed': [value: boolean] }>()

// Open by default: it is three lines, and the answer to "which file am I looking at" should not
// need a click.
const open = ref(true)

const name = computed(() =>
    props.image ? (metadataTitle(props.image.metadata) ?? `IMG_${props.image.id}`) : '',
)

/**
 * The named rows first, then whatever else the metadata bag happens to hold.
 *
 * File and dimensions are the two anyone actually reads, and `metadataEntries` would bury them
 * among arbitrary keys in alphabetical order. The rest still shows, underneath.
 */
const extras = computed(() =>
    metadataEntries(props.image?.metadata).filter((entry) => entry.key !== 'title'),
)
</script>

<template>
    <div v-if="image" class="tw:shrink-0 tw:border-t tw:border-an-divider tw:bg-an-panel">
        <button
            type="button"
            class="tw:flex tw:w-full tw:items-center tw:gap-1.5 tw:px-3.5 tw:py-2 tw:text-left"
            @click="open = !open"
        >
            <span
                class="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[12.5px] tw:font-semibold tw:text-an-text"
            >
                {{ position ? `Image ${position}` : name }}
            </span>
            <ChevronDown v-if="open" class="tw:h-3.5 tw:w-3.5 tw:text-an-n-400" />
            <ChevronUp v-else class="tw:h-3.5 tw:w-3.5 tw:text-an-n-400" />
        </button>

        <dl v-if="open" class="tw:flex tw:flex-col tw:gap-1 tw:px-3.5 tw:pb-2.5">
            <div class="tw:flex tw:gap-2 tw:text-[11.5px]">
                <dt class="tw:w-24 tw:shrink-0 tw:text-an-n-400">File</dt>
                <dd class="tw:min-w-0 tw:truncate tw:font-mono tw:text-an-n-700">{{ name }}</dd>
            </div>
            <div v-if="dimensions" class="tw:flex tw:gap-2 tw:text-[11.5px]">
                <dt class="tw:w-24 tw:shrink-0 tw:text-an-n-400">Dimensions</dt>
                <dd class="tw:min-w-0 tw:truncate tw:font-mono tw:tabular-nums tw:text-an-n-700">
                    {{ dimensions.w }} × {{ dimensions.h }}
                </dd>
            </div>
            <div v-if="seededBy" class="tw:flex tw:gap-2 tw:text-[11.5px]">
                <dt class="tw:w-24 tw:shrink-0 tw:text-an-n-400">Seeded by</dt>
                <dd class="tw:min-w-0 tw:truncate tw:font-mono tw:text-an-n-700">{{ seededBy }}</dd>
            </div>
            <div v-for="entry in extras" :key="entry.key" class="tw:flex tw:gap-2 tw:text-[11.5px]">
                <dt class="tw:w-24 tw:shrink-0 tw:truncate tw:text-an-n-400">{{ entry.label }}</dt>
                <dd class="tw:min-w-0 tw:truncate tw:text-an-n-700">{{ entry.value }}</dd>
            </div>
        </dl>

        <!--
            `M`, not `R`: R is the rectangle tool. Persisted into `images.metadata.reviewed`, which
            is an open bag with a PATCH - so it survives a reload today, and it is the placeholder
            for the first-class field this wants.
        -->
        <label
            class="tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:border-t tw:border-an-divider tw:px-3.5 tw:py-2.5 tw:text-[12px] tw:text-an-n-700"
        >
            <input
                type="checkbox"
                :checked="reviewed"
                :disabled="saving"
                @change="emit('update:reviewed', ($event.target as HTMLInputElement).checked)"
            />
            Mark reviewed
            <div class="tw:flex-1"></div>
            <kbd
                class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none tw:text-an-muted"
            >
                M
            </kbd>
        </label>
    </div>
</template>
