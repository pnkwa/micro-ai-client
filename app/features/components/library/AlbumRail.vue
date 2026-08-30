<script setup lang="ts">
import { Folder, FolderOpen, Images, MoreVertical, Pencil, Plus, Star, Trash2 } from '@lucide/vue'
import type { Album } from '~/services/albumService'

/**
 * The album column: the library's one grouping, and a drop target for filing.
 *
 * It renders the COLUMN'S CONTENT, not the column: `LibraryShell` owns the width, the border and the
 * collapse, so this is free to be a list that scrolls inside whatever it is given.
 *
 * `+ New album` sits at the END OF THE LIST rather than pinned to the bottom of the column. Pinned,
 * it floated alone under 1,200px of white on a library with two albums, which read as a footer for a
 * page rather than the last row of a list.
 */
const props = defineProps<{
    albums: Album[]
    loading?: boolean
    /** `null` is "All images". */
    selectedId: number | null
    /**
     * Images per album, keyed by album id, and the total under the `null` row.
     *
     * Counted by the page, not here: `GET /albums` returns no image count, so each number is a
     * `per_page: 1` listing read for its `total`. Requested as `image_count` on the album row on
     * 2026-08-30; until then a missing entry renders as no count rather than as a zero, because
     * "not counted yet" and "empty" are different things.
     */
    counts?: Record<number, number>
    totalCount?: number
    /**
     * How many images are being dragged over the sidebar right now, or 0.
     *
     * The drag itself lives in the page (`useAlbumDrag`); this column only publishes which rows are
     * targets, through `data-drop-album`, and paints the one under the pointer.
     */
    draggingCount?: number
    /** The row the pointer is over, from the drag's own hit test. */
    dropTarget?: number | 'new' | null
    /**
     * 34px docked, 48px in the drawer.
     *
     * A row is a target for a finger there rather than for a cursor, and 34px is under the 44px
     * floor everything touchable on this page holds to.
     */
    rowHeight?: number
}>()

const rowStyle = computed(() => ({ height: `${props.rowHeight ?? 34}px` }))

const emit = defineEmits<{
    select: [albumId: number | null]
    create: []
    edit: [album: Album]
    remove: [album: Album]
}>()

/**
 * The album being viewed refuses a drop, because everything on screen is already in it.
 *
 * The only membership this column can know without a request per row: the images in view came from
 * `?album_id=`, so they are in THAT album and nothing can be said about the others. `image_count`
 * on the album row was requested on 2026-08-30; a membership summary was not, because a row that
 * says "already here" wrongly is worse than one that says nothing.
 */
const alreadyHere = (albumId: number) =>
    props.draggingCount ? albumId === props.selectedId : false

// Curated first, then by name. The curated albums are the ones that gate question authoring, so
// they are what someone is looking for.
const sorted = computed(() =>
    [...props.albums].sort(
        (a, b) =>
            Number(b.kind === 'curated') - Number(a.kind === 'curated') ||
            a.name.localeCompare(b.name),
    ),
)
</script>

<template>
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <p
            class="tw:px-3.5 tw:pt-3.5 tw:pb-2 tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-an-n-400 tw:uppercase"
        >
            Albums
        </p>

        <!-- `data-album-scroll` is what the drag auto-scrolls when the pointer nears an edge. -->
        <div
            data-album-scroll
            class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-px tw:overflow-y-auto tw:px-2 tw:pb-3"
        >
            <!-- Deliberately carries no `data-drop-album`: "All images" is a VIEW, not an album,
                 so there is nothing a drop could file into. It stays unlit while a drag is live. -->
            <button
                type="button"
                class="tw:relative tw:flex tw:shrink-0 tw:items-center tw:gap-2.5 tw:rounded-[7px] tw:px-2 tw:text-left tw:transition-colors"
                :style="rowStyle"
                :class="
                    selectedId === null
                        ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-an-accent/25 tw:ring-inset'
                        : 'tw:hover:bg-an-n-50'
                "
                @click="emit('select', null)"
            >
                <span
                    class="tw:flex tw:h-[18px] tw:w-[22px] tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[4px] tw:border tw:border-an-n-200 tw:bg-an-n-100"
                    :class="selectedId === null ? 'tw:text-an-accent-hover' : 'tw:text-an-n-400'"
                >
                    <Images class="tw:h-3 tw:w-3" />
                </span>
                <span
                    class="tw:flex-1 tw:truncate tw:text-[12.5px]"
                    :class="
                        selectedId === null
                            ? 'tw:font-medium tw:text-an-accent-hover'
                            : 'tw:text-an-n-700'
                    "
                >
                    All images
                </span>
                <span
                    v-if="totalCount !== undefined"
                    class="tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-n-400"
                >
                    {{ totalCount }}
                </span>
            </button>

            <div v-if="loading" class="tw:flex tw:flex-col tw:gap-1 tw:p-1">
                <McSkeleton v-for="n in 4" :key="n" class="tw:h-8 tw:w-full" />
            </div>

            <!--
                THE HEIGHT NEVER CHANGES ON HOVER, drag or no drag. A 34px row that grows to 40px
                shifts every row beneath it, and the target moves out from under the pointer at the
                exact moment someone is aiming at it. Only colour and opacity move.
            -->
            <div
                v-for="album in sorted"
                :key="album.id"
                :data-drop-album="album.id"
                :data-drop-disabled="alreadyHere(album.id) ? 'true' : 'false'"
                class="tw:group tw:relative tw:flex tw:shrink-0 tw:items-center tw:rounded-[7px] tw:pr-1 tw:transition-colors"
                :style="rowStyle"
                :class="[
                    dropTarget === album.id && !alreadyHere(album.id)
                        ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-an-accent/35 tw:ring-inset'
                        : selectedId === album.id
                          ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-an-accent/25 tw:ring-inset'
                          : 'tw:hover:bg-an-n-50',
                    draggingCount && alreadyHere(album.id)
                        ? 'tw:cursor-not-allowed tw:opacity-45'
                        : '',
                ]"
            >
                <button
                    type="button"
                    class="tw:flex tw:h-full tw:min-w-0 tw:flex-1 tw:items-center tw:gap-2.5 tw:px-2 tw:text-left"
                    @click="emit('select', album.id)"
                >
                    <!--
                        A 22x18 tile rather than a bare icon, so every row starts at the same
                        left edge and the list reads as a column of albums rather than a mix of
                        starred and unstarred text.

                        It OPENS while the row is the drop target: a folder about to receive
                        something says more than the same glyph in a different colour.
                    -->
                    <span
                        class="tw:flex tw:h-[18px] tw:w-[22px] tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[4px] tw:border tw:transition-colors"
                        :class="
                            dropTarget === album.id && !alreadyHere(album.id)
                                ? 'tw:border-an-accent/35 tw:bg-an-panel tw:text-an-accent'
                                : album.kind === 'curated'
                                  ? 'tw:border-an-n-200 tw:bg-an-accent-tint tw:text-an-accent'
                                  : 'tw:border-an-n-200 tw:bg-an-n-100 tw:text-an-n-400'
                        "
                    >
                        <FolderOpen
                            v-if="dropTarget === album.id && !alreadyHere(album.id)"
                            class="tw:h-3 tw:w-3"
                        />
                        <Star v-else-if="album.kind === 'curated'" class="tw:h-3 tw:w-3" />
                        <Folder v-else class="tw:h-3 tw:w-3" />
                    </span>
                    <span
                        class="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[12.5px]"
                        :class="
                            selectedId === album.id ||
                            (dropTarget === album.id && !alreadyHere(album.id))
                                ? 'tw:font-medium tw:text-an-accent-hover'
                                : 'tw:text-an-n-700'
                        "
                        :title="album.description ?? album.name"
                    >
                        {{ album.name }}
                    </span>
                    <span
                        v-if="draggingCount && alreadyHere(album.id)"
                        class="tw:shrink-0 tw:text-[11px] tw:text-an-n-400"
                    >
                        Already here
                    </span>
                    <span
                        v-else-if="counts?.[album.id] !== undefined"
                        class="tw:shrink-0 tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-n-400 tw:group-hover:invisible"
                    >
                        {{ counts[album.id] }}
                    </span>
                </button>

                <McDropdownMenu>
                    <McDropdownMenuTrigger as-child>
                        <McButton
                            variant="ghost"
                            size="icon-sm"
                            class="tw:absolute tw:right-1 tw:opacity-0 tw:group-hover:opacity-100"
                            :aria-label="`Actions for ${album.name}`"
                        >
                            <MoreVertical class="tw:h-4 tw:w-4" />
                        </McButton>
                    </McDropdownMenuTrigger>
                    <McDropdownMenuContent align="end">
                        <McDropdownMenuItem @select="emit('edit', album)">
                            <Pencil class="tw:h-4 tw:w-4" />
                            Rename
                        </McDropdownMenuItem>
                        <McDropdownMenuItem @select="emit('remove', album)">
                            <Trash2 class="tw:h-4 tw:w-4" />
                            Delete
                        </McDropdownMenuItem>
                    </McDropdownMenuContent>
                </McDropdownMenu>
            </div>

            <!-- One muted line rather than an empty column, and it says what an album is FOR. An
                 empty list with a button on it teaches nobody what to put in it. -->
            <p
                v-if="!loading && !albums.length"
                class="tw:px-2 tw:pt-0.5 tw:text-[11.5px] tw:leading-[1.5] tw:text-an-n-400"
            >
                No albums yet. Group images by class, slide set or teaching week.
            </p>

            <!-- Also a drop target: dropping here makes the album and files them in one gesture. -->
            <button
                type="button"
                data-drop-album="new"
                class="tw:mt-1.5 tw:flex tw:shrink-0 tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-[7px] tw:border tw:text-[12px] tw:transition-colors"
                :style="rowStyle"
                :class="
                    dropTarget === 'new'
                        ? 'tw:border-solid tw:border-an-accent tw:bg-an-accent-tint tw:text-an-accent-hover'
                        : 'tw:border-dashed tw:border-an-n-250 tw:text-an-n-500 tw:hover:border-an-accent tw:hover:bg-an-accent-tint tw:hover:text-an-accent-hover'
                "
                @click="emit('create')"
            >
                <Plus class="tw:h-3.5 tw:w-3.5" />
                {{
                    draggingCount
                        ? `New album from ${draggingCount} image${draggingCount === 1 ? '' : 's'}`
                        : 'New album'
                }}
            </button>
        </div>
    </div>
</template>
