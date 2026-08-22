<script setup lang="ts">
import { History, Loader2, RefreshCw } from '@lucide/vue'
import {
    detectionService,
    type DetectionRecord,
    type DetectionWithSubmitter,
} from '~/services/detectionService'
import {
    canBrowseAllDetections,
    filterHistory,
    historyClassOptions,
    sortNewestFirst,
    type HistoryDateRange,
    type HistoryRecord,
    type HistoryScope,
} from '~/core/helpers/detectionHistory'

/**
 * Past detection runs, newest first (BE-ADR-024).
 *
 * Picking a row loads it back into the page's existing viewer rather than re-running the worker
 * - the parent owns that, so this only emits the record. Nothing here re-derives what the viewer
 * shows, which is what keeps the student-vs-staff rule honoured automatically: it is the same
 * viewer, reading the same `isStudent`.
 */
const emit = defineEmits<{ select: [record: HistoryRecord] }>()

const props = defineProps<{
    /** Highlighted row - the record currently loaded in the viewer. */
    activeId?: number | null
}>()

const auth = useAuth()
const canBrowseAll = computed(() =>
    canBrowseAllDetections(
        auth.jwtUserInfo?.user_type ?? auth.user?.user_type,
        auth.jwtUserInfo?.role ?? auth.user?.role,
    ),
)

const scope = ref<HistoryScope>('mine')
const records = ref<HistoryRecord[]>([])
const isLoading = ref(false)
const loadError = ref<string | null>(null)

/**
 * Thumbnails, keyed by detection id.
 *
 * `<img src>` cannot carry the Authorization header `$api` attaches, so each one is fetched as a
 * blob and held as an object URL. They are cached because switching scope re-lists the same rows,
 * and every one of them is revoked on unmount - an object URL pins its blob in memory until it is.
 *
 * The server's 256px variant (BE-ADR-026), not the original: this slot is 48px, and the originals
 * are multi-MB microscopy frames that were being downloaded whole and then shrunk by CSS.
 */
const thumbnails = ref<Record<number, string>>({})

const revokeThumbnails = () => {
    for (const url of Object.values(thumbnails.value)) URL.revokeObjectURL(url)
    thumbnails.value = {}
}

// In flight as well as done: a row that scrolls out and back, or is remounted by a filter change,
// announces itself again - and without this that is a second request for the same image.
const pending = new Set<number>()

// Cached under the detection id (the row's identity) but FETCHED by the image's own name: the
// detection id does not address a stable file, the image name does (BE-ADR-027).
const loadThumbnail = async (record: HistoryRecord) => {
    const id = record.id
    if (thumbnails.value[id] || pending.has(id) || !record.image_id) return
    pending.add(id)
    try {
        thumbnails.value[id] = await detectionService.imageBlobUrl(record.image_id, 'thumb')
    } catch {
        // A missing image is not worth failing the row over - the metadata still reads fine.
    } finally {
        pending.delete(id)
    }
}

/**
 * Rows fetch their own thumbnail as they come into view (`McDetectionHistoryRow` owns the observing;
 * this owns the cache and the fetching).
 *
 * The panel used to fetch every row's image at once and await all of them before clearing the
 * spinner, so opening it cost the whole history - on a few hundred rows that is hundreds of
 * concurrent full-resolution downloads for a list you can see eight rows of. Now the list appears as
 * soon as the metadata arrives and the images follow the scroll.
 *
 * The `<ul>` is handed down as the observer root because it is the scroll container: the panel
 * deliberately scrolls only the list, so the viewport is not what clips a row.
 */
const listEl = useTemplateRef<HTMLElement>('list')

const load = async () => {
    isLoading.value = true
    loadError.value = null
    try {
        const rows: HistoryRecord[] =
            scope.value === 'all'
                ? ((await detectionService.listAll()) as DetectionWithSubmitter[])
                : ((await detectionService.listMine()) as DetectionRecord[])
        records.value = sortNewestFirst(rows)
    } catch {
        records.value = []
        // The all-users endpoint ships in a later server release than this panel; until it is
        // deployed the request 400s/404s. Say so plainly rather than showing an empty list that
        // reads as "you have no history".
        loadError.value =
            scope.value === 'all'
                ? 'Could not load everyone’s history. This needs the admin history endpoint on the server.'
                : 'Could not load your detection history.'
    } finally {
        isLoading.value = false
    }
}

/**
 * Narrowing, client-side: the endpoint hands back the whole list, and filtering what is already in
 * memory answers instantly where a round trip per keystroke would not.
 *
 * "Every class" is a sentinel string, not null: McSelect round-trips its value through reka-ui,
 * which reads null as "nothing selected" and would show the placeholder rather than "All classes".
 * It is mapped back to the null `filterHistory` expects at the point of use.
 *
 * Declared before the refs that read it - a `const` referenced above its own line is a TDZ crash at
 * module evaluation, not a hoist.
 */
const ALL_CLASSES = '__all__'

const classFilter = ref<string>(ALL_CLASSES)
const dateFilter = ref<HistoryDateRange>('all')

/** Options come from the rows actually loaded, so a class the model gains needs no change here. */
const classFilterOptions = computed(() => [
    { value: ALL_CLASSES, label: 'All classes' },
    ...historyClassOptions(records.value).map((o) => ({
        value: o.label,
        label: `${o.label} (${o.count})`,
    })),
])

/**
 * Short labels on purpose. Three controls share one row, and inside the phone sheet's card that
 * leaves each select about 118px - "Last 30 days" does not fit and truncates to "Last 30 da...",
 * which is worse than dropping a word that the sibling options already imply.
 */
const dateFilterOptions: { value: HistoryDateRange; label: string }[] = [
    { value: 'all', label: 'All time' },
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
]

const visibleRecords = computed(() =>
    filterHistory(records.value, {
        classLabel: classFilter.value === ALL_CLASSES ? null : classFilter.value,
        range: dateFilter.value,
    }),
)

const clearFilters = () => {
    classFilter.value = ALL_CLASSES
    dateFilter.value = 'all'
}

const setScope = (next: HistoryScope) => {
    if (scope.value === next) return
    scope.value = next
    // The other scope is a different population, and a class filter picked from this one may not
    // exist there - which would land on an empty list that looks like the switch failed.
    clearFilters()
    load()
}

/** Exposed so the page can refresh the list after a new run lands. */
defineExpose({ refresh: load })

onMounted(load)
// Only the object URLs: the observer disposes itself with the component's effect scope.
onUnmounted(revokeThumbnails)
</script>

<template>
    <!--
        No card of its own - no background, border or padding. Both callers are full-screen overlays
        that draw their own surface, and nesting a second inside one framed the list twice.

        A flex column that may shrink: the heading and the controls hold their place while only the
        list below them scrolls. Scrolling the whole panel instead would carry the filters, Refresh
        and the overlay's own close button off the top of the screen, which on a list of a couple of
        hundred rows means scrolling back up to reach any of them.
    -->
    <div class="tw:flex tw:min-h-0 tw:flex-col">
        <!-- Title only. The corner opposite it belongs to the overlay's close button, and Refresh
             sat 24px from it on a phone - close enough that a missed tap dismisses the dialog
             instead of reloading a list. -->
        <div class="tw:mb-3 tw:flex tw:items-center tw:gap-2 tw:pr-10">
            <span
                class="tw:flex tw:items-center tw:justify-center tw:w-7 tw:h-7 tw:rounded-lg tw:bg-primary/10 tw:text-primary"
            >
                <History class="tw:w-4 tw:h-4" />
            </span>
            <h2 class="tw:text-sm tw:font-bold tw:text-slate-700">Recent analyses</h2>
        </div>

        <!-- Scope, admin only, on its own line: it swaps the whole population, where everything
             in the row below only narrows what is already loaded. UX only - listAll() is enforced
             by the RolesGuard, so hiding this changes nothing server-side; it is hidden because
             offering a control that always 403s is worse than not offering it. -->
        <div
            v-if="canBrowseAll"
            class="tw:mb-2 tw:flex tw:gap-1 tw:rounded-lg tw:bg-slate-100 tw:p-0.5"
        >
            <button
                v-for="opt in [
                    { value: 'mine' as const, label: 'Mine' },
                    { value: 'all' as const, label: 'All users' },
                ]"
                :key="opt.value"
                type="button"
                class="tw:flex-1 tw:text-xs tw:font-semibold tw:py-1.5 tw:rounded-md tw:transition-colors"
                :class="
                    scope === opt.value
                        ? 'tw:bg-white tw:text-primary tw:shadow-sm'
                        : 'tw:text-slate-500 hover:tw:text-slate-700'
                "
                @click="setScope(opt.value)"
            >
                {{ opt.label }}
            </button>
        </div>

        <!--
            One row: narrow the list, or re-read it. All three act on the same list, and keeping
            them together leaves the title line to the overlay's close button - Refresh sat 24px
            from it before, close enough that a missed tap dismissed the dialog.

            McSelect, the same listbox the model pickers use, so a select looks like a select
            everywhere in this app.

            Refresh survives an empty list; the filters do not, because filters over nothing are
            furniture.
        -->
        <div class="tw:mb-4 tw:flex tw:items-center tw:gap-2">
            <template v-if="records.length">
                <McSelect
                    v-model="classFilter"
                    :options="classFilterOptions"
                    option-value="value"
                    option-label="label"
                    class="tw:min-w-0 tw:flex-1 tw:bg-white tw:text-xs"
                    aria-label="Filter by class"
                />
                <McSelect
                    v-model="dateFilter"
                    :options="dateFilterOptions"
                    option-value="value"
                    option-label="label"
                    class="tw:min-w-0 tw:flex-1 tw:bg-white tw:text-xs"
                    aria-label="Filter by date"
                />
            </template>

            <!-- Labelled, not a bare glyph: a circular arrow is guessable rather than readable, and
                 the word costs ~50px in a row with space for it. -->
            <button
                type="button"
                :disabled="isLoading"
                class="tw:ml-auto tw:flex tw:shrink-0 tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-lg tw:px-2.5 tw:py-1.5 tw:text-xs tw:font-semibold tw:text-slate-500 tw:transition-colors hover:tw:bg-slate-100 hover:tw:text-primary tw:disabled:opacity-50"
                @click="load"
            >
                <RefreshCw class="tw:w-3.5 tw:h-3.5" :class="isLoading && 'tw:animate-spin'" />
                Refresh
            </button>
        </div>

        <div v-if="isLoading" class="tw:flex tw:items-center tw:gap-2 tw:py-6 tw:justify-center">
            <Loader2 class="tw:w-4 tw:h-4 tw:animate-spin tw:text-primary" />
            <span class="tw:text-sm tw:text-slate-400">Loading…</span>
        </div>

        <p v-else-if="loadError" class="tw:text-sm tw:text-amber-700 tw:leading-relaxed">
            {{ loadError }}
        </p>

        <p v-else-if="!records.length" class="tw:text-sm tw:text-slate-400 tw:italic">
            {{
                scope === 'all'
                    ? 'No one has run a detection yet.'
                    : 'You have not run a detection yet. Your analyses will be listed here.'
            }}
        </p>

        <!-- "Nothing matches" is a different fact from "there is nothing", and only one of them is
             the user's own doing. Saying which, and offering the undo, is what stops a filtered
             list reading as a list that lost its contents. -->
        <div
            v-else-if="!visibleRecords.length"
            class="tw:flex tw:flex-col tw:items-start tw:gap-2 tw:py-2"
        >
            <p class="tw:text-sm tw:text-slate-400 tw:italic">No analyses match these filters.</p>
            <button
                type="button"
                class="tw:cursor-pointer tw:rounded-lg tw:px-2.5 tw:py-1.5 tw:text-xs tw:font-semibold tw:text-primary tw:transition-colors hover:tw:bg-primary/5"
                @click="clearFilters"
            >
                Clear filters
            </button>
        </div>

        <!-- The only part that scrolls, and it takes whatever height is left. No max-height: the
             callers are full-screen, so a cap would strand the list in the top of the screen with
             the rest blank. -->
        <ul
            v-else
            ref="list"
            class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:divide-y tw:divide-slate-100 tw:overflow-y-auto"
        >
            <McDetectionHistoryRow
                v-for="record in visibleRecords"
                :key="record.id"
                :record="record"
                :root="listEl"
                :thumbnail="thumbnails[record.id]"
                :active="record.id === props.activeId"
                @visible="loadThumbnail(record)"
                @select="emit('select', record)"
            />
        </ul>
    </div>
</template>
