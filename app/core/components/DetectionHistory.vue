<script setup lang="ts">
import { History, Loader2, RefreshCw, User } from '@lucide/vue'
import {
    detectionService,
    type DetectionRecord,
    type DetectionWithSubmitter,
} from '~/services/detectionService'
import {
    boxCount,
    canBrowseAllDetections,
    filterHistory,
    formatHistoryDate,
    historyClassOptions,
    recordClasses,
    sortNewestFirst,
    submitterName,
    type HistoryDateRange,
    type HistoryRecord,
    type HistoryScope,
} from '~/core/helpers/detectionHistory'

/**
 * Past detection runs, newest first (BE-ADR-024).
 *
 * Picking a row loads it back into the page's existing viewer rather than re-running the worker
 * — the parent owns that, so this only emits the record. Nothing here re-derives what the viewer
 * shows, which is what keeps the student-vs-staff rule honoured automatically: it is the same
 * viewer, reading the same `isStudent`.
 */
const emit = defineEmits<{ select: [record: HistoryRecord] }>()

const props = defineProps<{
    /** Highlighted row — the record currently loaded in the viewer. */
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
 * and every one of them is revoked on unmount — an object URL pins its blob in memory until it is.
 *
 * The server's 256px variant (BE-ADR-026), not the original: this slot is 48px, and the originals
 * are multi-MB microscopy frames that were being downloaded whole and then shrunk by CSS.
 */
const thumbnails = ref<Record<number, string>>({})

const revokeThumbnails = () => {
    for (const url of Object.values(thumbnails.value)) URL.revokeObjectURL(url)
    thumbnails.value = {}
}

// In flight as well as done: a row can be observed again (a filter change remounts the element)
// before its first fetch has resolved, and without this that is a second request for the same image.
const pending = new Set<number>()

const loadThumbnail = async (id: number) => {
    if (thumbnails.value[id] || pending.has(id)) return
    pending.add(id)
    try {
        thumbnails.value[id] = await detectionService.imageBlobUrl(id, 'thumb')
    } catch {
        // A missing image is not worth failing the row over — the metadata still reads fine.
    } finally {
        pending.delete(id)
    }
}

/**
 * Rows fetch their own thumbnail as they come into view.
 *
 * The panel used to fetch every row's image at once and await all of them before clearing the
 * spinner, so opening it cost the whole history — on a few hundred rows that is hundreds of
 * concurrent full-resolution downloads for a list you can see eight rows of. Now the list appears as
 * soon as the metadata arrives and the images follow the scroll.
 *
 * One observer, rooted on the `<ul>` because that is the scroll container (the panel deliberately
 * scrolls only the list). `unobserve` on the first hit: a thumbnail is fetched once and then cached
 * in the map, so there is nothing to watch for afterwards.
 *
 * Created lazily and torn down with the component: the `<ul>` is behind a `v-if`, so it does not
 * exist to be a root until there is something to show.
 */
const listEl = useTemplateRef<HTMLElement>('list')
let observer: IntersectionObserver | null = null

const rowObserver = () => {
    if (observer) return observer
    if (!listEl.value) return null
    observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue
                const id = Number((entry.target as HTMLElement).dataset.detectionId)
                observer?.unobserve(entry.target)
                if (id) void loadThumbnail(id)
            }
        },
        // A screen's worth of lead, so a row is fetched shortly before it is looked at rather than
        // after — at 20 KB a row the cost of being early is negligible.
        { root: listEl.value, rootMargin: '200px' },
    )
    return observer
}

/**
 * A function ref, so rows register and deregister themselves as the filters change what is
 * rendered. Vue calls it with the element on mount and with null on unmount.
 */
const observeRow = (el: Element | ComponentPublicInstance | null, id: number) => {
    if (!(el instanceof HTMLElement)) return
    if (thumbnails.value[id]) return
    el.dataset.detectionId = String(id)
    rowObserver()?.observe(el)
}

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
onUnmounted(() => {
    observer?.disconnect()
    observer = null
    revokeThumbnails()
})
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
            <!-- Each row registers itself with the observer above, which is what makes its
                 thumbnail load when it is scrolled to rather than on open. -->
            <li
                v-for="record in visibleRecords"
                :key="record.id"
                :ref="(el) => observeRow(el, record.id)"
            >
                <!-- A row, not a card. Each one used to be a bordered white box, which on a
                     full-screen panel drew a 1392px frame around a line of text - the border was
                     doing separation work that a divider does with less ink. The loaded record is
                     marked by a tint and a left edge instead of a full outline. -->
                <button
                    type="button"
                    class="tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-3 tw:border-l-2 tw:p-2 tw:text-left tw:transition-colors"
                    :class="
                        record.id === props.activeId
                            ? 'tw:border-l-primary tw:bg-primary/5'
                            : 'tw:border-l-transparent hover:tw:bg-slate-50'
                    "
                    @click="emit('select', record)"
                >
                    <img
                        v-if="thumbnails[record.id]"
                        :src="thumbnails[record.id]"
                        alt=""
                        class="tw:w-12 tw:h-12 tw:rounded-lg tw:object-cover tw:shrink-0 tw:bg-slate-100"
                    />
                    <span
                        v-else
                        class="tw:w-12 tw:h-12 tw:rounded-lg tw:bg-slate-100 tw:shrink-0"
                    ></span>

                    <span class="tw:flex tw:flex-col tw:min-w-0 tw:gap-0.5">
                        <span class="tw:text-xs tw:font-semibold tw:text-slate-700 tw:truncate">
                            {{ recordClasses(record).join(', ') || 'No findings' }}
                        </span>
                        <span class="tw:text-[11px] tw:text-slate-400 tw:truncate">
                            {{ formatHistoryDate(record.created_at) }} ·
                            {{ boxCount(record) }} box{{ boxCount(record) === 1 ? '' : 'es' }}
                        </span>
                        <span
                            v-if="submitterName(record)"
                            class="tw:flex tw:items-center tw:gap-1 tw:text-[11px] tw:text-slate-500 tw:truncate"
                        >
                            <User class="tw:w-3 tw:h-3 tw:shrink-0" />
                            {{ submitterName(record) }}
                        </span>
                    </span>
                </button>
            </li>
        </ul>
    </div>
</template>
