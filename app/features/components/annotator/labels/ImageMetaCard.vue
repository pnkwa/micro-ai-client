<script setup lang="ts">
import { ChevronDown, ChevronUp } from '@lucide/vue'
import type { LibraryImage } from '~/services/imageService'
import { imageDisplayName } from '~/core/helpers/imageName'
import MetadataEditor from '~/features/components/library/inspector/MetadataEditor.vue'

/**
 * The pinned footer: what this image is, its metadata, and the one control that says it is done.
 *
 * Metadata is EDITABLE here now, the same MetadataEditor the library's detail panel uses. The old
 * worry was two forms clobbering one shallow-merged bag, but the patch each sends is changed-keys-
 * only (metadataPatch), so a write here leaves the keys the library owns untouched and vice versa.
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

const emit = defineEmits<{
    'update:reviewed': [value: boolean]
    /** A metadata PATCH body (changed keys only); the page writes it and swaps the row back in. */
    save: [patch: Record<string, unknown>]
}>()

// Open by default: it is three lines, and the answer to "which file am I looking at" should not
// need a click.
const open = ref(true)

const name = computed(() =>
    props.image ? imageDisplayName(props.image.metadata, props.image.id) : '',
)
</script>

<template>
    <!-- `touch-action` on the card, not only the aside or sheet hosting it: iOS honours it on the
         touched element, so a pinch or double-tap on the metadata cannot zoom the page. -->
    <div
        v-if="image"
        class="tw:shrink-0 tw:border-t tw:border-an-divider tw:bg-an-chrome tw:px-3.5 tw:pt-[11px] tw:pb-3 tw:[touch-action:pan-x_pan-y]"
    >
        <button
            type="button"
            class="tw:mb-2 tw:flex tw:w-full tw:items-center tw:gap-1.5 tw:text-left"
            @click="open = !open"
        >
            <span
                class="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[11px] tw:font-semibold tw:text-an-text"
            >
                {{ position ? `Image ${position}` : name }}
            </span>
            <ChevronUp v-if="open" class="tw:h-3.5 tw:w-3.5 tw:text-an-faint" />
            <ChevronDown v-else class="tw:h-3.5 tw:w-3.5 tw:text-an-faint" />
        </button>

        <dl v-if="open" class="tw:mb-[11px] tw:flex tw:flex-col tw:gap-1">
            <div class="tw:flex tw:items-center tw:text-[10.5px]">
                <dt class="tw:text-[10.5px] tw:w-[74px] tw:shrink-0 tw:text-an-faint">File</dt>
                <dd class="tw:text-[10.5px] tw:min-w-0 tw:truncate tw:font-mono tw:text-an-n-700">
                    {{ name }}
                </dd>
            </div>
            <div v-if="dimensions" class="tw:flex tw:items-center tw:text-[10.5px]">
                <dt class="tw:text-[10.5px] tw:w-[74px] tw:shrink-0 tw:text-an-faint">
                    Dimensions
                </dt>
                <dd
                    class="tw:text-[10.5px] tw:min-w-0 tw:truncate tw:font-mono tw:tabular-nums tw:text-an-n-700"
                >
                    {{ dimensions.w }} × {{ dimensions.h }}
                </dd>
            </div>
            <div v-if="seededBy" class="tw:flex tw:items-center tw:text-[10.5px]">
                <dt class="tw:text-[10.5px] tw:w-[74px] tw:shrink-0 tw:text-an-faint">Seeded by</dt>
                <dd class="tw:text-[10.5px] tw:min-w-0 tw:truncate tw:font-mono tw:text-an-n-700">
                    {{ seededBy }}
                </dd>
            </div>
        </dl>

        <!-- The metadata bag, edited in place, exactly as the library's detail panel does it.
             Title lives here too (it is just a key), so this is also where the file is renamed. -->
        <div v-if="open && image" class="tw:mb-[11px]">
            <span
                class="tw:mb-1.5 tw:block tw:text-[10.5px] tw:font-semibold tw:tracking-[0.06em] tw:text-an-faint tw:uppercase"
            >
                Metadata
            </span>
            <MetadataEditor :metadata="image.metadata" @save="emit('save', $event)" />
        </div>

        <!--
            `M`, not `R`: R is the rectangle tool. Persisted into `images.metadata.reviewed`, which
            is an open bag with a PATCH - so it survives a reload today, and it is the placeholder
            for the first-class field this wants.

            A bordered box on the tinted footer rather than a full-width bar: it is a control, and
            the design gives it an edge so it reads as one thing to press.
        -->
        <label
            class="tw:flex tw:h-[30px] tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-an-n-200 tw:bg-an-panel tw:px-2.5 tw:text-[11.5px] tw:text-an-n-700"
        >
            <input
                type="checkbox"
                class="tw:h-3.5 tw:w-3.5 tw:accent-an-accent"
                :checked="reviewed"
                :disabled="saving"
                @change="emit('update:reviewed', ($event.target as HTMLInputElement).checked)"
            />
            Mark reviewed
            <div class="tw:flex-1"></div>
            <kbd
                class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-[5px] tw:py-[3px] tw:font-mono tw:text-[9.5px] tw:leading-none tw:text-an-muted"
            >
                M
            </kbd>
        </label>
    </div>
</template>
