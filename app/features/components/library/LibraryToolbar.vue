<script setup lang="ts">
import { Check, ChevronDown, Folder, Search, Upload, X } from '@lucide/vue'
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
     * Drives the SIZING of every control (height, padding, whether search is a button until tapped),
     * which is a question about the input device and so is rightly a viewport question.
     *
     * It no longer decides whether the status chips are inline: that is about the space this row has
     * rather than the space the window has, and is measured instead (see `chipsInline`). Below Full
     * the chips always collapse to a single "Show" select beside Sort; at Full they collapse too once
     * the row is squeezed narrow enough, by the inspector opening. Compact still scrolls the row
     * sideways if what remains overflows.
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

const filterLabel = (id: QueueFilter) => chips.find((chip) => chip.id === id)?.label ?? 'All'

/**
 * A finger's target comes from the LAYOUT, not a global token, so the desktop's tighter controls are
 * untouched. The controls sit taller below Full (see `controlHeight`), and the row itself grows to
 * 56px on a tablet, which is what actually decides whether a thumb hits a control or its neighbour.
 */
const touch = computed(() => props.layout !== 'full')
const compact = computed(() => props.layout === 'compact')

/**
 * Whether the four status chips fit INLINE, measured from this row rather than from the viewport.
 *
 * `layout` answers "how big is the screen", and that is the wrong question here. The inspector is a
 * 400px grid track that SQUEEZES the grid column this row lives in (see LibraryShell), so opening an
 * image detail on a 1440px desktop leaves the row about 800px while `layout` still says `full`. The
 * row kept all four chips at desktop width and spilled into a sideways scrollbar.
 *
 * So the chips collapse into the same "Show" select the tablet uses, on the same rule, just decided
 * by the space that actually exists. Everything else stays keyed on `layout`: a narrow desktop row is
 * not a touch surface, so the controls keep their 30px height and their tighter hit areas.
 *
 * The threshold is the row's own arithmetic at desktop sizing: ~372px of chips, ~112 My uploads,
 * ~126 Sort, ~28 padding and ~32 of gaps come to ~670px of fixed content, and the search field is
 * allowed to shrink to 140px but reads badly below roughly 230px. 900px is where it stops being
 * worth keeping all four.
 *
 * Measured, NOT derived from `scrollWidth > clientWidth`: overflow-driven collapsing oscillates,
 * because collapsing removes the overflow that caused it and the row then expands back.
 */
const CHIPS_INLINE_MIN_PX = 900
const row = useTemplateRef<HTMLElement>('row')
const { width: rowWidth } = useElementSize(row, undefined, { box: 'border-box' })
const chipsInline = computed(() => !touch.value && rowWidth.value >= CHIPS_INLINE_MIN_PX)

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

/**
 * Expanded on touch once the field is focused or already holds a query; always on the desktop, where
 * it is a permanent field. The field's width follows this, and the controls beside it step aside: on
 * a phone the search takes the whole row, on a tablet only the filter button gives way to it.
 */
const searchExpanded = computed(() => (touch.value ? searchOpen.value || Boolean(props.q) : true))

/** On a phone an open search owns the whole row, so the album chip and My uploads stand down too. */
const phoneSearchTakesRow = computed(() => compact.value && searchExpanded.value)

/**
 * The "Show" select stands in for the chips whenever they are not inline, which is now the tablet
 * AND a squeezed desktop row. It still steps aside for an open search, but only on touch, where the
 * field takes the row; on the desktop the field is permanent and never claims it.
 */
const showFilterSelect = computed(
    () => !chipsInline.value && !(touch.value && searchExpanded.value),
)

const searchInput = useTemplateRef<HTMLInputElement>('searchInput')
/**
 * One height for every control in the row - search, album, the status chips, My uploads, the selects
 * - so nothing sits a few pixels shorter than its neighbour. Controls take a step down on a PHONE so
 * the whole row clears the screen without a sideways scroll; the medium tablet keeps the roomier
 * 38px, the desktop its 30px.
 */
const controlHeight = computed(() =>
    compact.value ? 'tw:h-[34px]' : touch.value ? 'tw:h-[38px]' : 'tw:h-[30px]',
)
/** Tighter horizontal padding and gap on a phone, for the same reason. */
const controlPad = computed(() => (compact.value ? 'tw:gap-1 tw:px-2' : 'tw:gap-1.5 tw:px-2.5'))
</script>

<template>
    <div
        ref="row"
        class="tw:flex tw:shrink-0 tw:items-center tw:border-b tw:border-an-border tw:bg-an-panel tw:px-3.5"
        :class="
            compact
                ? 'tw:h-12 tw:gap-1.5 tw:overflow-x-auto tw:whitespace-nowrap'
                : touch
                  ? 'tw:min-h-[56px] tw:gap-2 tw:flex-wrap tw:py-2'
                  : 'tw:h-11 tw:gap-2 tw:overflow-x-auto tw:whitespace-nowrap'
        "
    >
        <!--
            One field, not a button that swaps for a field. On touch it is a 44px target that grows
            to take the room when tapped and shrinks back when left empty; `flex-grow` is what the
            transition animates, so the width change reads as one motion rather than a pop. On the
            desktop it is a permanent, fixed-width field. `order-first` keeps it leading the row on a
            phone, where an expanded search sits over everything else.
        -->
        <div
            class="tw:order-first tw:flex tw:items-center tw:overflow-hidden tw:rounded-[7px] tw:border tw:border-an-n-200 tw:bg-an-n-50 tw:px-2 tw:text-an-n-400 tw:transition-[flex-grow,border-color] tw:duration-300 tw:ease-out tw:focus-within:border-an-accent"
            :class="[
                controlHeight,
                !touch
                    ? 'tw:min-w-[140px] tw:flex-[0_1_300px] tw:gap-1.5'
                    : searchExpanded
                      ? 'tw:min-w-0 tw:flex-[1_1_44px] tw:gap-1.5'
                      : 'tw:flex-[0_1_44px] tw:cursor-text tw:justify-center',
            ]"
            @click="openSearch"
        >
            <Search class="tw:h-3.5 tw:w-3.5 tw:shrink-0" />
            <input
                ref="searchInput"
                :value="q"
                type="search"
                placeholder="Search titles"
                class="tw:min-w-0 tw:bg-transparent tw:text-[12.5px] tw:text-an-text tw:outline-none tw:placeholder:text-an-n-300"
                :class="searchExpanded ? 'tw:flex-1' : 'tw:w-0 tw:flex-none'"
                @input="emit('update:q', ($event.target as HTMLInputElement).value)"
                @focus="searchOpen = true"
                @blur="searchOpen = false"
                @keydown.esc="closeSearch"
            />
            <button
                v-if="q"
                type="button"
                class="tw:shrink-0 tw:text-an-n-400 tw:hover:text-an-text"
                aria-label="Clear search"
                @click.stop="emit('update:q', '')"
            >
                <X class="tw:h-3.5 tw:w-3.5" />
            </button>
        </div>

        <!--
            The album chip: what the grid is showing, and the way into the drawer.

            It exists only below Full, where the column it replaces is not on screen. It names the
            album rather than saying "Albums", because the answer to "why am I only seeing eight
            pictures" has to be visible without opening anything.
        -->
        <button
            v-if="touch && !phoneSearchTakesRow"
            type="button"
            data-drop-spring
            class="tw:flex tw:shrink-0 tw:items-center tw:rounded-md tw:border tw:border-an-n-200 tw:bg-an-panel tw:text-[12.5px] tw:whitespace-nowrap tw:text-an-n-700 tw:hover:bg-an-n-50"
            :class="[controlHeight, controlPad]"
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
        <div v-if="chipsInline" class="tw:flex tw:shrink-0 tw:gap-1.5">
            <button
                v-for="chip in chips"
                :key="chip.id"
                type="button"
                class="tw:flex tw:shrink-0 tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:px-2.5 tw:text-[12px] tw:whitespace-nowrap tw:transition-colors"
                :class="[
                    controlHeight,
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
             whether it was on. On a phone it collapses to its icon: the label is the longest thing on
             a row that has to hold search, the album and the filter too, and the pressed tint carries
             the on/off just as well without it. -->
        <button
            v-if="!phoneSearchTakesRow"
            type="button"
            class="tw:flex tw:shrink-0 tw:items-center tw:rounded-md tw:border tw:text-[12px] tw:whitespace-nowrap tw:transition-colors"
            :class="[
                controlHeight,
                controlPad,
                mine
                    ? 'tw:border-an-accent/35 tw:bg-an-accent-tint tw:font-medium tw:text-an-accent-hover'
                    : 'tw:border-an-n-200 tw:bg-an-panel tw:text-an-n-600 tw:hover:bg-an-n-50',
            ]"
            :aria-pressed="mine"
            :aria-label="compact ? 'My uploads' : undefined"
            :title="compact ? 'My uploads' : undefined"
            @click="emit('update:mine', !mine)"
        >
            <Check v-if="mine && !compact" class="tw:h-3.5 tw:w-3.5" />
            <Upload v-if="compact" class="tw:h-4 tw:w-4" />
            <span v-if="!compact">My uploads</span>
        </button>

        <!-- Does not grow while the search is expanded, or it would split the free space with the
             field and the search would only get half of the room it is meant to take. -->
        <div class="tw:min-w-2" :class="touch && searchExpanded ? '' : 'tw:flex-1'"></div>

        <!-- Below Full the four status chips live here as one select instead of a row of their own,
             mirroring Sort and sitting right beside it. The current filter and its count show on the
             trigger so the answer to "what am I looking at" survives the collapse. It steps aside
             while the search is open, giving the field the row. -->
        <McDropdownMenu v-if="showFilterSelect">
            <McDropdownMenuTrigger as-child>
                <button
                    type="button"
                    class="tw:flex tw:shrink-0 tw:items-center tw:rounded-[7px] tw:border tw:border-an-n-200 tw:bg-an-panel tw:text-[12.5px] tw:whitespace-nowrap tw:text-an-n-700 tw:hover:bg-an-n-50"
                    :class="[controlHeight, controlPad]"
                >
                    <span class="tw:text-an-n-400">Show</span>
                    {{ filterLabel(filter) }}
                    <span class="tw:font-mono tw:text-[11px] tw:text-an-n-400">
                        {{ counts[filter] }}
                    </span>
                    <ChevronDown class="tw:h-3.5 tw:w-3.5 tw:text-an-n-400" />
                </button>
            </McDropdownMenuTrigger>
            <McDropdownMenuContent align="end">
                <McDropdownMenuItem
                    v-for="chip in chips"
                    :key="chip.id"
                    @select="emit('update:filter', chip.id)"
                >
                    <Check
                        class="tw:h-4 tw:w-4"
                        :class="filter === chip.id ? '' : 'tw:invisible'"
                    />
                    {{ chip.label }}
                    <span
                        class="tw:ml-auto tw:pl-4 tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-n-400"
                    >
                        {{ counts[chip.id] }}
                    </span>
                </McDropdownMenuItem>
            </McDropdownMenuContent>
        </McDropdownMenu>

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
