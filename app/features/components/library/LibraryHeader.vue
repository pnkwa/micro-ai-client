<script setup lang="ts">
import { Check, LayoutGrid, List, MoreHorizontal, Upload, X } from '@lucide/vue'
import type { AppLayout } from '~/core/composables/useAppLayout'
import type { LibrarySort } from '~/features/types/library'

/**
 * The 48px title row: what this is, how much of it there is, and the one primary action.
 *
 * THE FILTERS ARE NOT HERE. They are a row down, in the toolbar, because search, chips and sort
 * change what the grid shows and this row does not. The old bar mixed the two, which is how Upload
 * ended up beside the search field it has nothing to do with.
 */
export type LibraryView = 'grid' | 'list'

const props = defineProps<{
    /** The server's count for the current filter, not the number of rows loaded so far. */
    total: number
    view: LibraryView
    layout: AppLayout
    /** On a phone the header becomes the selection header while a batch is being picked. */
    selecting?: boolean
    selectedCount?: number
    sort: LibrarySort
    sorts: { id: LibrarySort; label: string }[]
}>()

const emit = defineEmits<{
    'update:view': [view: LibraryView]
    'update:sort': [sort: LibrarySort]
    upload: []
    /** Files picked from the phone's own sheet, camera included. */
    files: [files: File[]]
    'start-selecting': []
    'stop-selecting': []
    'select-all': []
}>()

const compact = computed(() => props.layout === 'compact')

/**
 * On a phone, Upload is the system file sheet with `capture` set, not our dialog.
 *
 * A phone held to an eyepiece is a real capture path in a teaching lab, and the dialog's album
 * picker is a step someone standing at a microscope should not have to take: the files land in
 * whatever album the grid is already showing.
 */
const filePicker = useTemplateRef<HTMLInputElement>('filePicker')

const onFiles = (event: Event) => {
    const input = event.target as HTMLInputElement
    const files = [...(input.files ?? [])]
    // Cleared, or picking the same file twice in a row fires no change event the second time.
    input.value = ''
    if (files.length) emit('files', files)
}

const views: { id: LibraryView; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'grid', label: 'Grid view', icon: LayoutGrid },
    { id: 'list', label: 'List view', icon: List },
]
</script>

<template>
    <!--
        THE SELECTION HEADER REPLACES THE HEADER, on a phone, rather than sitting under it.

        A 52px row is the whole top of the screen there, and stacking a second one costs a row of
        cards to say something the bottom bar is already saying. Leaving selection mode puts the
        ordinary header back.
    -->
    <header
        v-if="compact && selecting"
        class="tw:flex tw:h-13 tw:shrink-0 tw:items-center tw:gap-2 tw:border-b tw:border-an-border tw:bg-an-panel tw:px-2"
    >
        <button
            type="button"
            class="tw:flex tw:h-11 tw:w-11 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-n-600"
            aria-label="Leave selection mode"
            @click="emit('stop-selecting')"
        >
            <X class="tw:h-[18px] tw:w-[18px]" />
        </button>
        <span class="tw:flex-1 tw:font-mono tw:text-[13px] tw:text-an-text tw:tabular-nums">
            {{ selectedCount }} selected
        </span>
        <button
            type="button"
            class="tw:flex tw:h-11 tw:items-center tw:rounded-lg tw:px-3 tw:text-[13px] tw:font-medium tw:text-an-accent-hover"
            @click="emit('select-all')"
        >
            Select all
        </button>
    </header>

    <header
        v-else
        class="tw:flex tw:shrink-0 tw:items-center tw:gap-2.5 tw:border-b tw:border-an-border tw:bg-an-panel"
        :class="compact ? 'tw:h-[52px] tw:px-2' : 'tw:h-12 tw:pr-3 tw:pl-3.5'"
    >
        <h2
            class="tw:text-[13.5px] tw:font-semibold tw:text-an-text"
            :class="compact ? 'tw:pl-1.5' : ''"
        >
            Image Library
        </h2>
        <!-- The count is the fact the old page never told anyone. Mono and tabular so it does not
             jitter as pages append. -->
        <span
            class="tw:rounded-[5px] tw:bg-an-n-100 tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-n-600"
        >
            {{ total }}
        </span>

        <div class="tw:flex-1"></div>

        <!-- The phone's way INTO selection mode, top-level like the Photos app rather than buried in
             the overflow where nobody found it. A long press still works; this is the discoverable
             half. Hidden when the grid is empty, where there is nothing to pick. -->
        <button
            v-if="compact && total > 0"
            type="button"
            class="tw:flex tw:h-11 tw:items-center tw:rounded-lg tw:px-2 tw:text-[13px] tw:font-medium tw:text-an-accent-hover"
            @click="emit('start-selecting')"
        >
            Select
        </button>

        <!-- The view toggle has a row of its own on a desktop and lives in the overflow on a phone,
             where two more 44px targets would crowd out the ones people actually reach for. -->
        <div
            v-if="!compact"
            class="tw:flex tw:h-[30px] tw:overflow-hidden tw:rounded-[7px] tw:border tw:border-an-n-200"
        >
            <button
                v-for="option in views"
                :key="option.id"
                type="button"
                class="tw:flex tw:w-8 tw:items-center tw:justify-center tw:border-an-n-200 tw:transition-colors tw:not-first:border-l"
                :class="
                    view === option.id
                        ? 'tw:bg-an-n-100 tw:text-an-text'
                        : 'tw:bg-an-panel tw:text-an-n-400 tw:hover:text-an-text'
                "
                :aria-label="option.label"
                :aria-pressed="view === option.id"
                @click="emit('update:view', option.id)"
            >
                <component :is="option.icon" class="tw:h-[13px] tw:w-[13px]" />
            </button>
        </div>

        <McDropdownMenu v-if="compact">
            <McDropdownMenuTrigger as-child>
                <button
                    type="button"
                    class="tw:flex tw:h-11 tw:w-11 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-n-600"
                    aria-label="More"
                >
                    <MoreHorizontal class="tw:h-[18px] tw:w-[18px]" />
                </button>
            </McDropdownMenuTrigger>
            <McDropdownMenuContent align="end">
                <McDropdownMenuItem
                    v-for="option in views"
                    :key="option.id"
                    @select="emit('update:view', option.id)"
                >
                    <Check
                        class="tw:h-4 tw:w-4"
                        :class="view === option.id ? '' : 'tw:invisible'"
                    />
                    {{ option.label }}
                </McDropdownMenuItem>
                <McDropdownMenuSeparator />
                <McDropdownMenuItem
                    v-for="option in sorts"
                    :key="option.id"
                    @select="emit('update:sort', option.id)"
                >
                    <Check
                        class="tw:h-4 tw:w-4"
                        :class="sort === option.id ? '' : 'tw:invisible'"
                    />
                    {{ option.label }}
                </McDropdownMenuItem>
            </McDropdownMenuContent>
        </McDropdownMenu>

        <!--
            On a phone this is the SYSTEM sheet, with the camera offered: `capture="environment"`
            asks for the back camera, which is the one pointed down an eyepiece. On a desktop it
            stays our dialog, where the album picker and the per-file status are worth the step.
        -->
        <template v-if="compact">
            <input
                ref="filePicker"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                class="tw:hidden"
                @change="onFiles"
            />
            <button
                type="button"
                class="tw:flex tw:h-11 tw:w-11 tw:items-center tw:justify-center tw:rounded-lg tw:bg-an-accent tw:text-white"
                aria-label="Upload images"
                @click="filePicker?.click()"
            >
                <Upload class="tw:h-[18px] tw:w-[18px]" />
            </button>
        </template>
        <McButton v-else size="sm" @click="emit('upload')">
            <Upload class="tw:h-3.5 tw:w-3.5" />
            Upload
        </McButton>
    </header>
</template>
