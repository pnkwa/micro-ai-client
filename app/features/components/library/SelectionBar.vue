<script setup lang="ts">
import { Download, FolderMinus, FolderPlus, MoreHorizontal, Pencil, Trash2 } from '@lucide/vue'
import type { Album } from '~/services/albumService'
import type { AppLayout } from '~/core/composables/useAppLayout'

/**
 * What you can do to a batch, floating over the foot of the grid.
 *
 * It appears only when something is selected, which is why it can afford the middle of the screen:
 * it is never in the way of a page nobody is acting on.
 *
 * *** NOTHING DESTRUCTIVE ON THE FACE OF IT. *** Delete and Remove from album live in the overflow,
 * one deliberate extra click away, and Delete then still has to pass a confirm. The bar is a strip
 * of buttons the size of a thumb over a grid people drag things around in; a red button there is a
 * mis-click away from taking ten pictures with it.
 */
const props = defineProps<{
    count: number
    albums: Album[]
    /** Whether every selected image sits in the album currently being viewed. */
    inAlbum?: boolean
    /** The album being viewed, if any, so "Remove from …" names it rather than saying "this album". */
    albumName?: string | null
    layout: AppLayout
}>()

const emit = defineEmits<{
    /** On a phone this opens the album SHEET instead, which the page owns. */
    'pick-album': []
    'add-to-album': [albumId: number]
    annotate: []
    download: []
    'remove-from-album': []
    delete: []
    clear: []
}>()

const compact = computed(() => props.layout === 'compact')

/**
 * The floating pill carries a label on every button at full width, but on a medium window the whole
 * strip (count + four actions + overflow + Clear) runs wider than the viewport and the labels wrap.
 * There it drops to icons - each keeps its title/aria-label - so the bar stays one compact row.
 */
const dense = computed(() => props.layout === 'medium')

/**
 * Three actions, icon over an 11px label, evenly flexed, plus the overflow.
 *
 * Sized so no target drops under 44px at 390px, which is why Download is on the bar and Remove from
 * album is in the overflow with Delete.
 */
const actions = computed(() => [
    { id: 'album' as const, label: 'Album', icon: FolderPlus },
    { id: 'annotate' as const, label: 'Annotate', icon: Pencil },
    { id: 'download' as const, label: 'Download', icon: Download },
])

const fire = (id: 'album' | 'annotate' | 'download') => {
    if (id === 'album') emit('pick-album')
    if (id === 'annotate') emit('annotate')
    if (id === 'download') emit('download')
}
</script>

<template>
    <!--
        THE PHONE'S BAR IS THE BOTTOM OF THE SCREEN, not a pill floating over the grid.

        `env(safe-area-inset-bottom)` is not decoration: without it the home indicator sits on top of
        the row and the right-hand targets stop being reachable at all.
    -->
    <div
        v-if="compact"
        class="tw:absolute tw:inset-x-0 tw:bottom-0 tw:z-20 tw:flex tw:items-stretch tw:border-t tw:border-an-border tw:bg-an-panel"
        :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }"
    >
        <button
            v-for="action in actions"
            :key="action.id"
            type="button"
            class="tw:flex tw:h-16 tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-1 tw:text-an-n-700"
            @click="fire(action.id)"
        >
            <component :is="action.icon" class="tw:h-[18px] tw:w-[18px]" />
            <span class="tw:text-[11px]">{{ action.label }}</span>
        </button>

        <McDropdownMenu>
            <McDropdownMenuTrigger as-child>
                <button
                    type="button"
                    class="tw:flex tw:h-16 tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-1 tw:text-an-n-700"
                    aria-label="More actions"
                >
                    <MoreHorizontal class="tw:h-[18px] tw:w-[18px]" />
                    <span class="tw:text-[11px]">More</span>
                </button>
            </McDropdownMenuTrigger>
            <McDropdownMenuContent align="end" side="top">
                <McDropdownMenuItem v-if="inAlbum" @select="emit('remove-from-album')">
                    <FolderMinus class="tw:h-4 tw:w-4" />
                    Remove from {{ albumName }}
                </McDropdownMenuItem>
                <McDropdownMenuSeparator v-if="inAlbum" />
                <McDropdownMenuItem variant="destructive" @select="emit('delete')">
                    <Trash2 class="tw:h-4 tw:w-4" />
                    Delete {{ count }} image{{ count === 1 ? '' : 's' }}
                </McDropdownMenuItem>
            </McDropdownMenuContent>
        </McDropdownMenu>
    </div>

    <div
        v-else
        class="tw:absolute tw:bottom-[22px] tw:left-1/2 tw:z-20 tw:flex tw:h-11 tw:-translate-x-1/2 tw:items-center tw:gap-1 tw:rounded-[10px] tw:border tw:border-white/[0.09] tw:bg-an-text tw:pr-2 tw:pl-3.5 tw:shadow-[0_8px_30px_rgba(13,17,23,0.28)]"
    >
        <span
            class="tw:mr-2 tw:shrink-0 tw:font-mono tw:text-[12px] tw:whitespace-nowrap tw:text-white tw:tabular-nums"
        >
            {{ count }} selected
        </span>

        <McDropdownMenu>
            <McDropdownMenuTrigger as-child>
                <button
                    type="button"
                    class="tw:flex tw:h-[30px] tw:shrink-0 tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2.5 tw:text-[12px] tw:font-medium tw:whitespace-nowrap tw:text-an-d-strong tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white"
                    :aria-label="dense ? 'Add to album' : undefined"
                    :title="dense ? 'Add to album' : undefined"
                >
                    <FolderPlus class="tw:h-3.5 tw:w-3.5" />
                    <span v-if="!dense">Add to album</span>
                </button>
            </McDropdownMenuTrigger>
            <McDropdownMenuContent align="start">
                <McDropdownMenuItem
                    v-for="album in albums"
                    :key="album.id"
                    @select="emit('add-to-album', album.id)"
                >
                    {{ album.kind === 'curated' ? `${album.name} (curated)` : album.name }}
                </McDropdownMenuItem>
                <McDropdownMenuItem v-if="!albums.length" disabled>
                    No albums yet
                </McDropdownMenuItem>
            </McDropdownMenuContent>
        </McDropdownMenu>

        <button
            type="button"
            class="tw:flex tw:h-[30px] tw:shrink-0 tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2.5 tw:text-[12px] tw:font-medium tw:whitespace-nowrap tw:text-an-d-strong tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white"
            :aria-label="dense ? 'Annotate' : undefined"
            :title="dense ? 'Annotate' : undefined"
            @click="emit('annotate')"
        >
            <Pencil class="tw:h-3.5 tw:w-3.5" />
            <span v-if="!dense">Annotate</span>
        </button>

        <button
            type="button"
            class="tw:flex tw:h-[30px] tw:shrink-0 tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2.5 tw:text-[12px] tw:font-medium tw:whitespace-nowrap tw:text-an-d-strong tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white"
            :aria-label="dense ? 'Download' : undefined"
            :title="dense ? 'Download' : undefined"
            @click="emit('download')"
        >
            <Download class="tw:h-3.5 tw:w-3.5" />
            <span v-if="!dense">Download</span>
        </button>

        <McDropdownMenu>
            <McDropdownMenuTrigger as-child>
                <button
                    type="button"
                    class="tw:flex tw:h-[30px] tw:shrink-0 tw:items-center tw:rounded-md tw:px-2 tw:text-an-d-strong tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white"
                    aria-label="More actions"
                >
                    <MoreHorizontal class="tw:h-3.5 tw:w-3.5" />
                </button>
            </McDropdownMenuTrigger>
            <McDropdownMenuContent align="end">
                <McDropdownMenuItem v-if="inAlbum" @select="emit('remove-from-album')">
                    <FolderMinus class="tw:h-4 tw:w-4" />
                    Remove from {{ albumName }}
                </McDropdownMenuItem>
                <McDropdownMenuSeparator v-if="inAlbum" />
                <McDropdownMenuItem variant="destructive" @select="emit('delete')">
                    <Trash2 class="tw:h-4 tw:w-4" />
                    Delete {{ count }} image{{ count === 1 ? '' : 's' }}
                </McDropdownMenuItem>
            </McDropdownMenuContent>
        </McDropdownMenu>

        <span class="tw:mx-1 tw:h-5 tw:w-px tw:shrink-0 tw:bg-white/15"></span>

        <button
            type="button"
            class="tw:flex tw:h-[30px] tw:shrink-0 tw:items-center tw:rounded-md tw:px-2.5 tw:text-[12px] tw:font-medium tw:whitespace-nowrap tw:text-an-d-strong tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white"
            @click="emit('clear')"
        >
            Clear
        </button>
    </div>
</template>
