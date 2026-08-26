<script setup lang="ts">
import { X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { rejectUnusableImage } from '~/core/helpers/imageUpload'

/**
 * The image selector, along the bottom.
 *
 * PARTIALLY IMPLEMENTED: it holds LOCAL files only, so the canvas has something real to pan and
 * zoom before any of this talks to the server. Nothing here uploads, and nothing is persisted -
 * a reload empties it.
 *
 * Phase 2 replaces the source, not the shape: the strip fills from `imageService.list()` with the
 * lazy thumbnail loading the library grid already uses (`useImageObjectUrls`, one observer per
 * tile), and `?annotated=false` is what turns it from a browser into a worklist.
 *
 * A filmstrip rather than a dropdown because annotating is a run through many images in one
 * sitting, and the next picture has to be one click away without losing the canvas.
 */
export interface LocalImage {
    id: string
    name: string
    url: string
}

const props = defineProps<{ images: LocalImage[]; selectedId: string | null }>()

const emit = defineEmits<{
    add: [files: File[]]
    select: [id: string]
    remove: [id: string]
}>()

const onFiles = (files: File[]) => {
    // The same guard the library uploader runs. HEIC is the one that actually bites, and it fails
    // at decode time rather than at pick time, so catching it here is the difference between a
    // message and a blank canvas.
    const usable: File[] = []
    for (const file of files) {
        const rejection = rejectUnusableImage(file)
        if (rejection) toast.error(rejection.message)
        else usable.push(file)
    }
    if (usable.length) emit('add', usable)
}

void props
</script>

<template>
    <div
        class="tw:flex tw:h-28 tw:shrink-0 tw:items-stretch tw:gap-2 tw:border-t tw:border-navy-15 tw:bg-white tw:p-2"
    >
        <McFileDropzone
            accept="image/*"
            multiple
            class="tw:w-56 tw:shrink-0 tw:py-0"
            label="Add local images"
            hint="Drop them here"
            @files="onFiles"
        />

        <ul v-if="images.length" class="tw:flex tw:min-w-0 tw:flex-1 tw:gap-2 tw:overflow-x-auto">
            <li v-for="image in images" :key="image.id" class="tw:relative tw:shrink-0">
                <button
                    type="button"
                    class="tw:h-full tw:overflow-hidden tw:rounded-md tw:border-2 tw:transition-colors"
                    :class="
                        image.id === selectedId
                            ? 'tw:border-primary'
                            : 'tw:border-transparent tw:hover:border-navy-20'
                    "
                    :title="image.name"
                    @click="emit('select', image.id)"
                >
                    <img
                        :src="image.url"
                        :alt="image.name"
                        class="tw:h-full tw:w-auto tw:object-cover"
                    />
                </button>
                <button
                    type="button"
                    class="tw:absolute tw:top-1 tw:right-1 tw:rounded-full tw:bg-black/60 tw:p-0.5 tw:text-white tw:hover:bg-black/80"
                    :aria-label="`Remove ${image.name}`"
                    @click="emit('remove', image.id)"
                >
                    <X class="tw:h-3 tw:w-3" />
                </button>
            </li>
        </ul>

        <div
            v-else
            class="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:text-xs tw:text-navy-50"
        >
            Local images only for now. Nothing here is uploaded or saved.
        </div>
    </div>
</template>
