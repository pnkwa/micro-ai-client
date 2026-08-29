<script setup lang="ts">
import { ImageOff } from '@lucide/vue'
import type { LibraryImage } from '~/services/imageService'
import { useImageObjectUrls } from '~/core/composables/useImageObjectUrls'
import ImageGridTile from './ImageGridTile.vue'

/**
 * The thumbnail grid.
 *
 * It owns the object-URL cache and the fetching; each tile owns its own visibility observer. The
 * page above owns the filters and the paging, because the album rail and the filter bar change the
 * same query this reads.
 */
const props = defineProps<{
    images: LibraryImage[]
    loading?: boolean
    total: number
    page: number
    perPage: number
    selectedId?: number | null
    /** Shown when the library is empty, so the copy can name the active filter. */
    emptyMessage?: string
}>()

const emit = defineEmits<{ select: [image: LibraryImage]; 'update:page': [page: number] }>()

const { urls, errors, load } = useImageObjectUrls()

const container = useTemplateRef<HTMLElement>('container')

// Always the server's cached 256px downscale. A tile is ~200px and the originals are multi-MB
// microscopy frames; fetching those whole and shrinking them with CSS is how the detection history
// used to do it, and it cost the whole library to show one screen.
const onVisible = (image: LibraryImage) => load(image.id, 'thumb', image.content_hash)

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.perPage)))
</script>

<template>
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <div ref="container" class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:p-4">
            <ul
                v-if="images.length"
                class="tw:grid tw:grid-cols-2 tw:gap-3 tw:sm:grid-cols-3 tw:lg:grid-cols-4 tw:xl:grid-cols-5"
            >
                <ImageGridTile
                    v-for="image in images"
                    :key="image.id"
                    :image="image"
                    :root="container"
                    :thumbnail="urls[image.id]"
                    :error="errors[image.id]"
                    :selected="image.id === selectedId"
                    @visible="onVisible(image)"
                    @select="emit('select', image)"
                />
            </ul>

            <ul
                v-else-if="loading"
                class="tw:grid tw:grid-cols-2 tw:gap-3 tw:sm:grid-cols-3 tw:lg:grid-cols-4 tw:xl:grid-cols-5"
            >
                <li v-for="n in perPage" :key="n">
                    <McSkeleton class="tw:aspect-square tw:w-full tw:rounded-lg" />
                </li>
            </ul>

            <McStatePanel v-else>
                <ImageOff class="tw:h-8 tw:w-8 tw:text-navy-40" />
                <p class="tw:text-base tw:font-medium tw:text-navy-100">No images here</p>
                <p class="tw:text-sm tw:text-navy-60">
                    {{ emptyMessage ?? 'Upload a picture to start building the library.' }}
                </p>
            </McStatePanel>
        </div>

        <div
            v-if="pageCount > 1"
            class="tw:flex tw:items-center tw:justify-between tw:border-t tw:border-navy-15 tw:px-4 tw:py-2"
        >
            <p class="tw:text-sm tw:text-navy-60">{{ total }} image(s)</p>
            <McPagination
                v-slot="{ page: current }"
                :sibling-count="1"
                show-edges
                :page="page"
                :items-per-page="perPage"
                :total="total"
                @update:page="(value) => emit('update:page', value)"
            >
                <McPaginationContent v-slot="{ items }">
                    <McPaginationPrevious />
                    <template v-for="(item, index) in items" :key="index">
                        <McPaginationItem
                            v-if="item.type === 'page'"
                            :value="item.value"
                            :is-active="item.value === current"
                        >
                            {{ item.value }}
                        </McPaginationItem>
                        <McPaginationEllipsis v-else :key="item.type" :index="index" />
                    </template>
                    <McPaginationNext />
                </McPaginationContent>
            </McPagination>
        </div>
    </div>
</template>
