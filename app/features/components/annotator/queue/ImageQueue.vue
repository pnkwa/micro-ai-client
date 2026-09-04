<script setup lang="ts">
import { refDebounced, useIntersectionObserver } from '@vueuse/core'
import { useAnnotatorLayout } from '~/core/composables/useAnnotatorLayout'
import { LayoutGrid, List, PanelLeftClose, Search, X } from '@lucide/vue'
import type { LibraryImage } from '~/services/imageService'
import { useImageObjectUrls } from '~/core/composables/useImageObjectUrls'
import {
    matchesFilter,
    queueProgress,
    type QueueFilter,
    type QueueRowView,
} from '~/core/helpers/annotationQueue'
import QueueRow from './QueueRow.vue'
import QueueTile from './QueueTile.vue'

/**
 * The left column: search, filters, progress, and the list someone works through.
 *
 * The rows are NOT virtualised, and that is a deliberate scope call rather than an oversight. There
 * is no virtualisation dependency in this repo, the list pages 30 at a time with lazily-fetched
 * thumbnails, and rows are cheap. If a library grows past a few hundred loaded rows this is the
 * first thing to revisit - the row component is already isolated for it.
 */
const props = defineProps<{
    images: LibraryImage[]
    /** Precomputed per image, so the row is presentational and the status lives in one place. */
    views: Record<number, QueueRowView>
    dots: Record<number, string[]>
    selectedId: number | null
    loading: boolean
    total: number
    search: string
    filter: QueueFilter
    /** The albums the library can be narrowed to, for the source picker. */
    albums: { id: number; name: string }[]
    /**
     * Which images to load: an album id, `'all'` for the whole library, or `null` for nothing yet.
     * The library is deliberately empty until a source is chosen, so a huge shared pool is never
     * pulled in wholesale just to open the annotator.
     */
    source: number | 'all' | null
}>()

const emit = defineEmits<{
    select: [id: number]
    'update:search': [value: string]
    'update:filter': [value: QueueFilter]
    'update:source': [value: number | 'all' | null]
    more: []
    /** Collapse the queue to its rail. Lives on the Images header rather than the top toolbar. */
    collapse: []
}>()

/**
 * The source `<select>` carries a string; map it back to the id / 'all' / null the page holds.
 * An empty option value is "nothing chosen", which is the empty-library state.
 */
const onSource = (value: string) =>
    emit('update:source', value === '' ? null : value === 'all' ? 'all' : Number(value))
const sourceValue = computed(() => (props.source === null ? '' : String(props.source)))

const scroller = useTemplateRef<HTMLElement>('scroller')
const searchEl = useTemplateRef<HTMLInputElement>('searchEl')
const { urls, errors, load } = useImageObjectUrls()

const mode = ref<'list' | 'grid'>('list')

/**
 * How many images sit on one row, which is what an arrow key has to step by.
 *
 * *** THE GRID IS `grid-cols-3`, AND THIS IS THE SAME 3. *** Told to the page rather than assumed
 * by it: the page owns the keyboard but has no DOM, and a column count guessed there would go
 * wrong the first time this list changes shape. One in list mode, because a list IS a grid one
 * column wide, which lets the caller use the same arithmetic for both.
 */
const GRID_COLUMNS = 3
const columns = computed(() => (mode.value === 'grid' ? GRID_COLUMNS : 1))

/**
 * In a drawer, the header's controls are for a THUMB.
 *
 * Same markup, two sizes: 24px is right beside a mouse in a docked column and under the 44px floor
 * everything touchable holds to. `stacked` is the same question the shell and the page ask, so the
 * queue cannot be a drawer while thinking it is a column.
 */
const { stacked } = useAnnotatorLayout()

// Debounced because `?q=` is a server-side filter: a keystroke per request is one round trip per
// character.
const debounced = refDebounced(
    computed(() => props.search),
    250,
)
watch(debounced, (value) => emit('update:search', value))

const viewFor = (image: LibraryImage): QueueRowView =>
    props.views[image.id] ?? { status: 'empty', badge: null, meta: 'no shapes yet' }

/**
 * The filter chips run CLIENT-side over what is loaded, because the status they filter on is only
 * partly the server's: `reviewed` lives in metadata and `seeded` is session state. `?annotated=`
 * cannot express either, so filtering here is the honest place for it.
 */
/**
 * Ascending by id: the order the batch was uploaded in, and the order people read it.
 *
 * The server returns `created_at DESC` - newest first, which is right for a library listing and
 * backwards for a worklist. The strip ran IMG_22 to IMG_11 and someone working through it started
 * at the end.
 */
/**
 * Filtered, and NOT reordered.
 *
 * It used to sort by id here, which put the list in a different order from the one the page steps
 * through: pressing "next image" moved to the row above the highlighted one. The order is the
 * page's now, so the list, the pager and the arrow keys cannot disagree about which way is down.
 */
const visible = computed(() =>
    props.images.filter((image) => matchesFilter(viewFor(image).status, props.filter)),
)

const statuses = computed(() => props.images.map((image) => viewFor(image).status))

/**
 * Each chip counts what ITS OWN filter catches, not what the state partition says.
 *
 * Those differ now that three chips cover four states: "To label" folds in-progress in, so reading
 * its number off the state counts would show 2 beside a list of 5. Deriving both from
 * `matchesFilter` is what keeps the number and the list it produces the same thing.
 */
const counts = computed(() =>
    Object.fromEntries(
        chips.map((chip) => [
            chip.id,
            statuses.value.filter((status) => matchesFilter(status, chip.id)).length,
        ]),
    ),
)

const progress = computed(() => queueProgress(statuses.value))

const sentinel = useTemplateRef<HTMLElement>('sentinel')
useIntersectionObserver(
    sentinel,
    ([entry]) => {
        if (entry?.isIntersecting && !props.loading) emit('more')
    },
    { root: () => scroller.value, rootMargin: '300px' },
)

/**
 * Three chips, as the mockup has them, and they still partition: To label is everything not done,
 * so All = To label + Done. The four-chip version split "in progress" out; the design keeps it
 * folded in, and folding is fine as long as the arithmetic holds.
 */
const chips: { id: QueueFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'todo', label: 'To label' },
    { id: 'done', label: 'Done' },
]

defineExpose({ focusSearch: () => searchEl.value?.focus(), columns })
</script>

<template>
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <div
            class="tw:flex tw:shrink-0 tw:items-center tw:gap-2"
            :class="stacked ? 'tw:px-2 tw:pt-1.5 tw:pb-1' : 'tw:px-3.5 tw:pt-3 tw:pb-1.5'"
        >
            <!-- The queue's own collapse. `PanelLeftClose` - a panel with an arrow - is
                 deliberately NOT the app sidebar's plain `PanelLeft`: two identical icons for two
                 different panels is the confusion this separates. -->
            <button
                type="button"
                class="tw:flex tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-500 tw:hover:bg-an-n-100 tw:hover:text-an-text"
                :class="stacked ? 'tw:h-11 tw:w-11' : 'tw:h-6 tw:w-6'"
                :aria-label="stacked ? 'Close the image queue' : 'Collapse the image queue'"
                :title="stacked ? 'Close the image queue' : 'Collapse the image queue'"
                @click="emit('collapse')"
            >
                <PanelLeftClose class="tw:h-4 tw:w-4" />
            </button>
            <span class="tw:text-[12.5px] tw:font-semibold tw:text-an-text">Images</span>
            <div class="tw:flex-1"></div>
            <div class="tw:flex tw:gap-0.5 tw:rounded-[7px] tw:bg-an-n-100 tw:p-0.5">
                <button
                    v-for="option in ['list', 'grid'] as const"
                    :key="option"
                    type="button"
                    class="tw:flex tw:items-center tw:justify-center tw:rounded-[5px] tw:transition-colors"
                    :class="[
                        stacked ? 'tw:h-9 tw:w-11' : 'tw:h-[22px] tw:w-6',
                        mode === option
                            ? 'tw:bg-white tw:text-an-text tw:shadow-sm'
                            : 'tw:text-an-faint tw:hover:text-an-muted',
                    ]"
                    :aria-label="option === 'list' ? 'List view' : 'Grid view'"
                    :aria-pressed="mode === option"
                    @click="mode = option"
                >
                    <List v-if="option === 'list'" class="tw:h-3.5 tw:w-3.5" />
                    <LayoutGrid v-else class="tw:h-3.5 tw:w-3.5" />
                </button>
            </div>
        </div>

        <div class="tw:shrink-0 tw:px-3 tw:pb-2">
            <div
                class="tw:flex tw:h-[30px] tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-an-n-200 tw:bg-an-n-50 tw:px-2.5"
            >
                <Search class="tw:h-3.5 tw:w-3.5 tw:shrink-0 tw:text-an-faint" />
                <input
                    ref="searchEl"
                    :value="search"
                    placeholder="Search filename"
                    class="tw:min-w-0 tw:flex-1 tw:bg-transparent tw:text-[12px] tw:text-an-text tw:outline-none tw:placeholder:text-an-faint"
                    @input="emit('update:search', ($event.target as HTMLInputElement).value)"
                />
                <button
                    v-if="search"
                    type="button"
                    aria-label="Clear search"
                    class="tw:text-an-faint tw:hover:text-an-muted"
                    @click="emit('update:search', '')"
                >
                    <X class="tw:h-3.5 tw:w-3.5" />
                </button>
                <kbd
                    v-else
                    class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none tw:text-an-muted"
                >
                    /
                </kbd>
            </div>
        </div>

        <!-- Which pool to load. Empty until chosen, so opening the annotator never pulls the whole
             shared library; "All images" is the explicit opt-in to that. -->
        <div class="tw:shrink-0 tw:px-3 tw:pb-2">
            <select
                :value="sourceValue"
                class="tw:h-[30px] tw:w-full tw:rounded-lg tw:border tw:border-an-n-200 tw:bg-an-n-50 tw:px-2 tw:text-[12px] tw:text-an-text tw:outline-none tw:focus:border-an-accent"
                aria-label="Image source"
                @change="onSource(($event.target as HTMLSelectElement).value)"
            >
                <option value="">Choose an album…</option>
                <option value="all">All images</option>
                <option v-for="album in albums" :key="album.id" :value="String(album.id)">
                    {{ album.name }}
                </option>
            </select>
        </div>

        <div class="tw:flex tw:shrink-0 tw:gap-1.5 tw:px-3 tw:pb-2.5">
            <button
                v-for="chip in chips"
                :key="chip.id"
                type="button"
                class="tw:flex tw:h-6 tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2 tw:text-[11.5px] tw:font-medium tw:transition-colors"
                :class="
                    filter === chip.id
                        ? 'tw:bg-an-text tw:text-white'
                        : 'tw:bg-an-n-100 tw:text-an-n-600 tw:hover:bg-an-n-150'
                "
                @click="emit('update:filter', chip.id)"
            >
                {{ chip.label }}
                <span class="tw:font-mono tw:text-[10.5px] tw:tabular-nums tw:opacity-70">
                    {{ counts[chip.id] }}
                </span>
            </button>
        </div>

        <div class="tw:shrink-0 tw:px-3 tw:pb-3">
            <div class="tw:mb-1.5 tw:flex tw:items-baseline tw:gap-1.5">
                <span
                    class="tw:font-mono tw:text-[11px] tw:font-semibold tw:tabular-nums tw:text-an-text"
                >
                    {{ progress.reviewed }} / {{ progress.total }}
                </span>
                <!-- "reviewed", not "annotated": the bar tracks the Done chip, and an image with
                     shapes nobody has signed off is not done. -->
                <span class="tw:text-[11px] tw:text-an-faint">reviewed</span>
                <div class="tw:flex-1"></div>
                <span class="tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-faint">
                    {{ progress.percent }}%
                </span>
            </div>
            <div class="tw:h-1 tw:overflow-hidden tw:rounded-full tw:bg-an-n-150">
                <div
                    class="tw:h-full tw:rounded-full tw:bg-an-accent tw:transition-[width]"
                    :style="{ width: `${progress.percent}%` }"
                ></div>
            </div>
        </div>

        <div class="tw:h-px tw:shrink-0 tw:bg-an-divider"></div>

        <!-- `scrollbar-gutter: stable` so the bar sits in reserved space rather than over the
             rows' trailing badges. -->
        <div
            ref="scroller"
            class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:p-2"
            style="scrollbar-gutter: stable"
        >
            <ul v-if="mode === 'list'" class="tw:flex tw:flex-col tw:gap-px">
                <QueueRow
                    v-for="image in visible"
                    :key="image.id"
                    :image="image"
                    :view="viewFor(image)"
                    :dots="dots[image.id] ?? []"
                    :root="scroller"
                    :thumbnail="urls[image.id]"
                    :error="errors[image.id]"
                    :selected="image.id === selectedId"
                    @visible="load(image.id, 'thumb', image.content_hash)"
                    @select="emit('select', image.id)"
                />
            </ul>

            <!-- Grid mode is the same data through the same filter; only the shape changes - and
                 the fetching, which is per tile and driven by visibility exactly as the list is. -->
            <ul v-else class="tw:grid tw:grid-cols-3 tw:gap-1.5">
                <QueueTile
                    v-for="image in visible"
                    :key="image.id"
                    :image="image"
                    :view="viewFor(image)"
                    :root="scroller"
                    :thumbnail="urls[image.id]"
                    :selected="image.id === selectedId"
                    @visible="load(image.id, 'thumb', image.content_hash)"
                    @select="emit('select', image.id)"
                />
            </ul>

            <!-- Nothing chosen yet: point at the picker rather than reading as an empty album.
                 A `?image=` deep link prepends one row with no source chosen, so this hides once
                 anything is in the strip. -->
            <div
                v-if="source === null && !images.length"
                class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:px-4 tw:py-8 tw:text-center"
            >
                <p class="tw:text-[12px] tw:text-an-faint">
                    Pick an album above to load its images, or show the whole library.
                </p>
                <button
                    type="button"
                    class="tw:flex tw:h-8 tw:items-center tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:text-[12px] tw:font-medium tw:text-an-n-700 tw:hover:bg-an-n-50"
                    @click="emit('update:source', 'all')"
                >
                    Show all images
                </button>
            </div>

            <p
                v-else-if="!visible.length && !loading"
                class="tw:px-2 tw:py-8 tw:text-center tw:text-[12px] tw:text-an-faint"
            >
                {{ search ? `Nothing matches "${search}".` : 'Nothing under this filter.' }}
            </p>

            <div v-if="loading" class="tw:flex tw:flex-col tw:gap-1 tw:pt-1">
                <McSkeleton v-for="n in 4" :key="n" class="tw:h-14 tw:w-full tw:rounded-lg" />
            </div>

            <div ref="sentinel" class="tw:h-px"></div>
        </div>
    </div>
</template>
