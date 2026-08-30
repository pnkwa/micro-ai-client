<script setup lang="ts">
import { Download, FolderPlus, MoreHorizontal, Pencil, Play, Trash2 } from '@lucide/vue'
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
 * Four actions, icon over an 11px label, evenly flexed, plus the overflow.
 *
 * Four is what fits at 390px without a target dropping under 44px, which is why Download is on the
 * bar and Remove from album is in the overflow with Delete.
 */
const actions = computed(() => [
    { id: 'album' as const, label: 'Album', icon: FolderPlus, disabled: false },
    { id: 'run' as const, label: 'Run model', icon: Play, disabled: true },
    { id: 'annotate' as const, label: 'Annotate', icon: Pencil, disabled: false },
    { id: 'download' as const, label: 'Download', icon: Download, disabled: false },
])

const fire = (id: 'album' | 'run' | 'annotate' | 'download') => {
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
            class="tw:flex tw:h-16 tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-1"
            :class="action.disabled ? 'tw:text-an-n-300' : 'tw:text-an-n-700'"
            :disabled="action.disabled"
            :title="
                action.disabled
                    ? 'Running a model over a batch needs an endpoint that takes a list. Coming soon.'
                    : undefined
            "
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
                <McDropdownMenuItem :disabled="!inAlbum" @select="emit('remove-from-album')">
                    Remove from this album
                </McDropdownMenuItem>
                <McDropdownMenuSeparator />
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
        <span class="tw:mr-2 tw:font-mono tw:text-[12px] tw:text-white tw:tabular-nums">
            {{ count }} selected
        </span>

        <McDropdownMenu>
            <McDropdownMenuTrigger as-child>
                <button
                    type="button"
                    class="tw:flex tw:h-[30px] tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2.5 tw:text-[12px] tw:font-medium tw:text-an-d-strong tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white"
                >
                    <FolderPlus class="tw:h-3.5 tw:w-3.5" />
                    Add to album
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

        <!--
            Disabled on purpose, and it says so.

            `POST /images/:id/detect` takes one image and blocks until the worker answers, so a
            batch of ten is ten serial round trips through a GPU queue with no way to report or
            cancel the middle of it. Shipped visible rather than hidden: the gap is a backend one,
            and hiding it would just make someone ask for it again.
        -->
        <button
            type="button"
            disabled
            class="tw:flex tw:h-[30px] tw:cursor-not-allowed tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2.5 tw:text-[12px] tw:font-medium tw:text-white/35"
            title="Running a model over a batch needs an endpoint that takes a list. Coming soon."
        >
            <Play class="tw:h-3.5 tw:w-3.5" />
            Run model
        </button>

        <button
            type="button"
            class="tw:flex tw:h-[30px] tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2.5 tw:text-[12px] tw:font-medium tw:text-an-d-strong tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white"
            @click="emit('annotate')"
        >
            <Pencil class="tw:h-3.5 tw:w-3.5" />
            Annotate
        </button>

        <button
            type="button"
            class="tw:flex tw:h-[30px] tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2.5 tw:text-[12px] tw:font-medium tw:text-an-d-strong tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white"
            @click="emit('download')"
        >
            <Download class="tw:h-3.5 tw:w-3.5" />
            Download
        </button>

        <McDropdownMenu>
            <McDropdownMenuTrigger as-child>
                <button
                    type="button"
                    class="tw:flex tw:h-[30px] tw:items-center tw:rounded-md tw:px-2 tw:text-an-d-strong tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white"
                    aria-label="More actions"
                >
                    <MoreHorizontal class="tw:h-3.5 tw:w-3.5" />
                </button>
            </McDropdownMenuTrigger>
            <McDropdownMenuContent align="end">
                <McDropdownMenuItem :disabled="!inAlbum" @select="emit('remove-from-album')">
                    Remove from this album
                </McDropdownMenuItem>
                <McDropdownMenuSeparator />
                <McDropdownMenuItem variant="destructive" @select="emit('delete')">
                    <Trash2 class="tw:h-4 tw:w-4" />
                    Delete {{ count }} image{{ count === 1 ? '' : 's' }}
                </McDropdownMenuItem>
            </McDropdownMenuContent>
        </McDropdownMenu>

        <span class="tw:mx-1 tw:h-5 tw:w-px tw:bg-white/15"></span>

        <button
            type="button"
            class="tw:flex tw:h-[30px] tw:items-center tw:rounded-md tw:px-2.5 tw:text-[12px] tw:font-medium tw:text-an-d-strong tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white"
            @click="emit('clear')"
        >
            Clear
        </button>
    </div>
</template>
