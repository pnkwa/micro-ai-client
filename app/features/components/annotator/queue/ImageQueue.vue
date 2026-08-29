<script setup lang="ts">
import { refDebounced, useIntersectionObserver } from '@vueuse/core'
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
}>()

const emit = defineEmits<{
    select: [id: number]
    'update:search': [value: string]
    'update:filter': [value: QueueFilter]
    more: []
    /** Collapse the queue to its rail. Lives on the Images header rather than the top toolbar. */
    collapse: []
}>()

const scroller = useTemplateRef<HTMLElement>('scroller')
const searchEl = useTemplateRef<HTMLInputElement>('searchEl')
const { urls, errors, load } = useImageObjectUrls()

const mode = ref<'list' | 'grid'>('list')

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
const visible = computed(() =>
    props.images
        .filter((image) => matchesFilter(viewFor(image).status, props.filter))
        .slice()
        .sort((a, b) => a.id - b.id),
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

defineExpose({ focusSearch: () => searchEl.value?.focus() })
</script>

<template>
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <div class="tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:px-3.5 tw:pt-3 tw:pb-1.5">
            <!-- The queue's own collapse. `PanelLeftClose` - a panel with an arrow - is
                 deliberately NOT the app sidebar's plain `PanelLeft`: two identical icons for two
                 different panels is the confusion this separates. -->
            <button
                type="button"
                class="tw:flex tw:h-6 tw:w-6 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-500 tw:hover:bg-an-n-100 tw:hover:text-an-text"
                aria-label="Collapse the image queue"
                title="Collapse the image queue"
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
                    class="tw:flex tw:h-[22px] tw:w-6 tw:items-center tw:justify-center tw:rounded-[5px] tw:transition-colors"
                    :class="
                        mode === option
                            ? 'tw:bg-white tw:text-an-text tw:shadow-sm'
                            : 'tw:text-an-faint tw:hover:text-an-muted'
                    "
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

            <!-- Grid mode is the same data through the same filter; only the shape changes. -->
            <ul v-else class="tw:grid tw:grid-cols-3 tw:gap-1.5">
                <li v-for="image in visible" :key="image.id">
                    <button
                        type="button"
                        class="tw:relative tw:block tw:aspect-square tw:w-full tw:overflow-hidden tw:rounded-[7px] tw:bg-an-canvas"
                        :class="image.id === selectedId ? 'tw:ring-2 tw:ring-an-accent' : ''"
                        @click="emit('select', image.id)"
                        @pointerenter="load(image.id, 'thumb', image.content_hash)"
                    >
                        <img
                            v-if="urls[image.id]"
                            :src="urls[image.id]"
                            alt=""
                            class="tw:h-full tw:w-full tw:object-cover"
                        />
                        <McSkeleton v-else class="tw:h-full tw:w-full tw:rounded-none" />
                        <span
                            v-if="viewFor(image).badge !== null"
                            class="tw:absolute tw:right-1 tw:bottom-1 tw:flex tw:h-[17px] tw:min-w-[17px] tw:items-center tw:justify-center tw:rounded tw:bg-black/70 tw:px-1 tw:font-mono tw:text-[10px] tw:font-semibold tw:text-white"
                        >
                            {{ viewFor(image).badge }}
                        </span>
                    </button>
                </li>
            </ul>

            <p
                v-if="!visible.length && !loading"
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
