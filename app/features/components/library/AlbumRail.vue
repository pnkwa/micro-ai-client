<script setup lang="ts">
import { Images, MoreVertical, Pencil, Plus, Star, Trash2 } from '@lucide/vue'
import type { Album } from '~/services/albumService'
import { IMAGE_DRAG_TYPE } from '~/core/constant/drag'

const props = defineProps<{
    albums: Album[]
    loading?: boolean
    /** `null` is "All images". */
    selectedId: number | null
}>()

const emit = defineEmits<{
    select: [albumId: number | null]
    create: []
    edit: [album: Album]
    remove: [album: Album]
    /** A tile was dropped on an album. The page decides what filing means. */
    fileImage: [payload: { albumId: number; imageId: number }]
}>()

/**
 * The album currently under a dragged tile.
 *
 * `dragover` fires continuously and `dragleave` fires when crossing INTO a child element, so a
 * per-row boolean flickers. One id held here cannot: entering another row overwrites it, and the
 * drop or the drag ending clears it.
 */
const dragOverId = ref<number | null>(null)

const carriesImage = (event: DragEvent): boolean =>
    event.dataTransfer?.types.includes(IMAGE_DRAG_TYPE) ?? false

const onDragOver = (event: DragEvent, albumId: number) => {
    if (!carriesImage(event)) return
    // Both are required: without preventDefault the browser refuses the drop entirely.
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dragOverId.value = albumId
}

const onDrop = (event: DragEvent, albumId: number) => {
    dragOverId.value = null
    if (!carriesImage(event)) return
    event.preventDefault()
    const imageId = Number(event.dataTransfer?.getData(IMAGE_DRAG_TYPE))
    if (Number.isInteger(imageId) && imageId > 0) emit('fileImage', { albumId, imageId })
}

// Curated first, then by name. The curated albums are the ones that gate annotation and question
// authoring, so they are what someone is looking for.
const sorted = computed(() =>
    [...props.albums].sort(
        (a, b) =>
            Number(b.kind === 'curated') - Number(a.kind === 'curated') ||
            a.name.localeCompare(b.name),
    ),
)
</script>

<template>
    <aside
        class="tw:flex tw:w-56 tw:shrink-0 tw:flex-col tw:border-r tw:border-navy-15 tw:bg-white"
    >
        <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-0.5 tw:overflow-y-auto tw:p-2">
            <button
                type="button"
                class="tw:flex tw:items-center tw:gap-2 tw:rounded-md tw:px-2.5 tw:py-2 tw:text-left tw:text-sm tw:transition-colors"
                :class="
                    selectedId === null
                        ? 'tw:bg-primary/10 tw:font-medium tw:text-primary'
                        : 'tw:text-navy-80 tw:hover:bg-navy-5'
                "
                @click="emit('select', null)"
            >
                <Images class="tw:h-4 tw:w-4 tw:shrink-0" />
                All images
            </button>

            <div v-if="loading" class="tw:flex tw:flex-col tw:gap-1 tw:p-1">
                <McSkeleton v-for="n in 4" :key="n" class="tw:h-8 tw:w-full" />
            </div>

            <div
                v-for="album in sorted"
                :key="album.id"
                class="tw:group tw:flex tw:items-center tw:gap-1 tw:rounded-md tw:pr-1 tw:transition-colors"
                :class="
                    dragOverId === album.id
                        ? 'tw:bg-primary/20 tw:ring-2 tw:ring-primary'
                        : selectedId === album.id
                          ? 'tw:bg-primary/10'
                          : 'tw:hover:bg-navy-5'
                "
                @dragover="onDragOver($event, album.id)"
                @dragleave="dragOverId = null"
                @drop="onDrop($event, album.id)"
            >
                <button
                    type="button"
                    class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-2 tw:px-2.5 tw:py-2 tw:text-left tw:text-sm tw:transition-colors"
                    :class="
                        selectedId === album.id
                            ? 'tw:font-medium tw:text-primary'
                            : 'tw:text-navy-80'
                    "
                    @click="emit('select', album.id)"
                >
                    <Star
                        v-if="album.kind === 'curated'"
                        class="tw:h-4 tw:w-4 tw:shrink-0 tw:text-primary"
                    />
                    <span v-else class="tw:h-4 tw:w-4 tw:shrink-0" />
                    <span class="tw:truncate" :title="album.description ?? album.name">
                        {{ album.name }}
                    </span>
                </button>

                <McDropdownMenu>
                    <McDropdownMenuTrigger as-child>
                        <McButton
                            variant="ghost"
                            size="icon-sm"
                            class="tw:opacity-0 tw:group-hover:opacity-100"
                            :aria-label="`Actions for ${album.name}`"
                        >
                            <MoreVertical class="tw:h-4 tw:w-4" />
                        </McButton>
                    </McDropdownMenuTrigger>
                    <McDropdownMenuContent align="end">
                        <McDropdownMenuItem @select="emit('edit', album)">
                            <Pencil class="tw:h-4 tw:w-4" />
                            Edit
                        </McDropdownMenuItem>
                        <McDropdownMenuItem @select="emit('remove', album)">
                            <Trash2 class="tw:h-4 tw:w-4" />
                            Delete
                        </McDropdownMenuItem>
                    </McDropdownMenuContent>
                </McDropdownMenu>
            </div>
        </div>

        <div class="tw:border-t tw:border-navy-15 tw:p-2">
            <McButton variant="outline" size="sm" class="tw:w-full" @click="emit('create')">
                <Plus class="tw:h-4 tw:w-4" />
                New album
            </McButton>
        </div>
    </aside>
</template>
