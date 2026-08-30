<script setup lang="ts">
import { Check, ChevronDown, Folder, Search, X } from '@lucide/vue'
import type { QueueFilter } from '~/core/helpers/annotationQueue'
import type { AppLayout } from '~/core/composables/useAppLayout'
import { LIBRARY_SORTS, type LibrarySort } from '~/features/types/library'

/**
 * What the grid shows: search, the four chips, my uploads and sort.
 *
 * TWO KINDS OF FILTER SIT IN ONE ROW, and the difference matters enough to say here rather than
 * leave to whoever debugs it. Search and My uploads are SERVER-side (`?q=`, `?mine=`) and restart
 * the listing. The chips are CLIENT-side over what is loaded, because the status they filter on is
 * `metadata.reviewed` plus a caller-scoped count, and `?annotated=` cannot express the three-way
 * split. The annotator's queue splits them the same way, deliberately.
 *
 * The consequence, stated where someone will hit it: a chip count describes the rows LOADED so far,
 * not the library. With lazy loading that number climbs as you scroll. It is honest at the bottom of
 * the list and an undercount before that, which is why the header's total comes from the server
 * instead.
 */
const props = defineProps<{
    /**
     * Full keeps one row. Medium WRAPS to two, so search and the album chip stay reachable on the
     * first line and the chips take the second. Compact keeps one row and scrolls it.
     */
    layout: AppLayout
    /** The album the grid is showing, named on the chip that opens the drawer. */
    albumLabel: string
    albumCount: number | null
    q: string
    mine: boolean
    filter: QueueFilter
    /** Per-chip counts over the loaded rows, from `queueCounts` so they cannot drift from the badges. */
    counts: Record<QueueFilter, number>
    sort: LibrarySort
}>()

const emit = defineEmits<{
    'open-albums': []
    'update:q': [value: string]
    'update:mine': [value: boolean]
    'update:filter': [value: QueueFilter]
    'update:sort': [value: LibrarySort]
}>()

/**
 * Four chips, and the last three partition: `matchesChip` is the strict reading of the same
 * `chipFor` the annotator uses, so All is the sum rather than a fourth opinion.
 */
const chips: { id: QueueFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'todo', label: 'Unlabelled' },
    { id: 'progress', label: 'In progress' },
    { id: 'done', label: 'Reviewed' },
]

const sortLabel = (id: LibrarySort) =>
    LIBRARY_SORTS.find((option) => option.id === id)?.label ?? 'Newest'

/**
 * 44px is the floor for anything a finger touches, and it comes from the LAYOUT rather than a
 * global token, so the desktop's tighter controls are untouched.
 *
 * The chips grow to 34px at Medium per the spec, but their tap target is the row they sit in: the
 * row itself goes to 56px there, which is what actually decides whether a thumb hits the chip or
 * the one beside it.
 */
const touch = computed(() => props.layout !== 'full')
const compact = computed(() => props.layout === 'compact')

/**
 * On a phone the search field is a BUTTON until it is used.
 *
 * A 48px row has to hold the album chip and four filter chips; a permanent input would take the
 * width of all of them to sit empty most of the time. Tapping it takes the row over, with a Cancel
 * beside it, and Esc or Cancel gives the row back.
 */
const searchOpen = ref(false)

const openSearch = async () => {
    searchOpen.value = true
    await nextTick()
    searchInput.value?.focus()
}

const closeSearch = () => {
    searchOpen.value = false
    emit('update:q', '')
}

const searchInput = useTemplateRef<HTMLInputElement>('searchInput')
const chipHeight = computed(() => (touch.value ? 'tw:h-[34px]' : 'tw:h-[26px]'))
const controlHeight = computed(() => (touch.value ? 'tw:h-[38px]' : 'tw:h-[30px]'))
</script>

<template>
    <div
        class="tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:border-b tw:border-an-border tw:bg-an-panel tw:px-3.5"
        :class="
            compact
                ? 'tw:h-12 tw:overflow-x-auto tw:whitespace-nowrap'
                : touch
                  ? 'tw:min-h-[56px] tw:flex-wrap tw:py-2'
                  : 'tw:h-11 tw:overflow-x-auto tw:whitespace-nowrap'
        "
    >
        <!-- The phone's collapsed search: a target, not a field, until someone wants it. -->
        <button
            v-if="compact && !searchOpen"
            type="button"
            class="tw:flex tw:h-11 tw:w-11 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-n-600"
            aria-label="Search"
            @click="openSearch"
        >
            <Search class="tw:h-[18px] tw:w-[18px]" />
        </button>

        <!-- Expanded, it takes the row: `order-first` and a full-width basis put it over the chips
             rather than beside them, which is the only way a search field is usable at 390px. -->
        <div
            v-if="!compact || searchOpen"
            class="tw:flex tw:items-center tw:gap-1.5 tw:rounded-[7px] tw:border tw:border-an-n-200 tw:bg-an-n-50 tw:px-2 tw:text-an-n-400 tw:focus-within:border-an-accent"
            :class="[
                controlHeight,
                compact
                    ? 'tw:order-first tw:min-w-0 tw:flex-1'
                    : 'tw:min-w-[140px] tw:flex-[0_1_300px]',
            ]"
        >
            <Search class="tw:h-3.5 tw:w-3.5 tw:shrink-0" />
            <input
                ref="searchInput"
                :value="q"
                type="search"
                placeholder="Search titles"
                class="tw:min-w-0 tw:flex-1 tw:bg-transparent tw:text-[12.5px] tw:text-an-text tw:outline-none tw:placeholder:text-an-n-300"
                @input="emit('update:q', ($event.target as HTMLInputElement).value)"
                @keydown.esc="closeSearch"
            />
            <button
                v-if="q"
                type="button"
                class="tw:shrink-0 tw:text-an-n-400 tw:hover:text-an-text"
                aria-label="Clear search"
                @click="emit('update:q', '')"
            >
                <X class="tw:h-3.5 tw:w-3.5" />
            </button>
        </div>
        <button
            v-if="compact && searchOpen"
            type="button"
            class="tw:order-first tw:h-11 tw:shrink-0 tw:px-2 tw:text-[13px] tw:font-medium tw:text-an-accent-hover"
            @click="closeSearch"
        >
            Cancel
        </button>

        <!--
            The album chip: what the grid is showing, and the way into the drawer.

            It exists only below Full, where the column it replaces is not on screen. It names the
            album rather than saying "Albums", because the answer to "why am I only seeing eight
            pictures" has to be visible without opening anything.
        -->
        <button
            v-if="touch"
            type="button"
            data-drop-spring
            class="tw:flex tw:shrink-0 tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:border-an-n-200 tw:bg-an-panel tw:px-2.5 tw:text-[12.5px] tw:whitespace-nowrap tw:text-an-n-700 tw:hover:bg-an-n-50"
            :class="controlHeight"
            @click="emit('open-albums')"
        >
            <Folder class="tw:h-3.5 tw:w-3.5 tw:text-an-n-400" />
            {{ albumLabel }}
            <span v-if="albumCount !== null" class="tw:font-mono tw:text-[11px] tw:text-an-n-400">
                {{ albumCount }}
            </span>
        </button>

        <!--
            *** NOWRAP AND `shrink-0` ON EVERY CONTROL. *** The row is a fixed 44px, so a chip whose
            label wraps does not make the row taller - it just breaks in half inside it, which is
            what "In progress" and "My uploads" were doing. The search field is the one thing
            allowed to give way, down to 140px; past that the row scrolls sideways rather than
            folding a control in two.
        -->
        <div
            class="tw:flex tw:gap-1.5"
            :class="
                compact
                    ? 'tw:shrink-0'
                    : touch
                      ? 'tw:order-1 tw:w-full tw:overflow-x-auto'
                      : 'tw:shrink-0'
            "
        >
            <button
                v-for="chip in chips"
                :key="chip.id"
                type="button"
                class="tw:flex tw:shrink-0 tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:px-2.5 tw:text-[12px] tw:whitespace-nowrap tw:transition-colors"
                :class="[
                    chipHeight,
                    filter === chip.id
                        ? 'tw:border-an-n-700 tw:bg-an-n-700 tw:text-white'
                        : 'tw:border-an-n-200 tw:bg-an-panel tw:text-an-n-600 tw:hover:bg-an-n-50',
                ]"
                :aria-pressed="filter === chip.id"
                @click="emit('update:filter', chip.id)"
            >
                {{ chip.label }}
                <span
                    class="tw:font-mono tw:text-[11px] tw:tabular-nums"
                    :class="filter === chip.id ? 'tw:text-white/60' : 'tw:text-an-n-400'"
                >
                    {{ counts[chip.id] }}
                </span>
            </button>
        </div>

        <!-- A real toggle with a pressed state. It was a button before, and you could not tell
             whether it was on. -->
        <button
            type="button"
            class="tw:flex tw:shrink-0 tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:px-2.5 tw:text-[12px] tw:whitespace-nowrap tw:transition-colors"
            :class="[
                chipHeight,
                mine
                    ? 'tw:border-an-accent/35 tw:bg-an-accent-tint tw:font-medium tw:text-an-accent-hover'
                    : 'tw:border-an-n-200 tw:bg-an-panel tw:text-an-n-600 tw:hover:bg-an-n-50',
            ]"
            :aria-pressed="mine"
            @click="emit('update:mine', !mine)"
        >
            <Check v-if="mine" class="tw:h-3.5 tw:w-3.5" />
            My uploads
        </button>

        <div class="tw:min-w-2 tw:flex-1"></div>

        <McDropdownMenu v-if="!compact">
            <McDropdownMenuTrigger as-child>
                <button
                    type="button"
                    class="tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:rounded-[7px] tw:border tw:border-an-n-200 tw:bg-an-panel tw:px-2.5 tw:text-[12.5px] tw:whitespace-nowrap tw:text-an-n-700 tw:hover:bg-an-n-50"
                    :class="controlHeight"
                >
                    <span class="tw:text-an-n-400">Sort</span>
                    {{ sortLabel(sort) }}
                    <ChevronDown class="tw:h-3.5 tw:w-3.5 tw:text-an-n-400" />
                </button>
            </McDropdownMenuTrigger>
            <McDropdownMenuContent align="end">
                <McDropdownMenuItem
                    v-for="option in LIBRARY_SORTS"
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
    </div>
</template>
