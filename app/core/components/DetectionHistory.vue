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
    formatHistoryDate,
    recordClasses,
    sortNewestFirst,
    submitterName,
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
 */
const thumbnails = ref<Record<number, string>>({})

const revokeThumbnails = () => {
    for (const url of Object.values(thumbnails.value)) URL.revokeObjectURL(url)
    thumbnails.value = {}
}

const loadThumbnail = async (id: number) => {
    if (thumbnails.value[id]) return
    try {
        thumbnails.value[id] = await detectionService.imageBlobUrl(id)
    } catch {
        // A missing image is not worth failing the row over — the metadata still reads fine.
    }
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
        await Promise.all(records.value.map((r) => loadThumbnail(r.id)))
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

const setScope = (next: HistoryScope) => {
    if (scope.value === next) return
    scope.value = next
    load()
}

/** Exposed so the page can refresh the list after a new run lands. */
defineExpose({ refresh: load })

onMounted(load)
onUnmounted(revokeThumbnails)
</script>

<template>
    <div class="tw:bg-white tw:rounded-2xl tw:border tw:border-slate-200 tw:p-5 tw:md:p-6">
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-4 tw:gap-2">
            <div class="tw:flex tw:items-center tw:gap-2">
                <span
                    class="tw:flex tw:items-center tw:justify-center tw:w-7 tw:h-7 tw:rounded-lg tw:bg-primary/10 tw:text-primary"
                >
                    <History class="tw:w-4 tw:h-4" />
                </span>
                <h2 class="tw:text-sm tw:font-bold tw:text-slate-700">Recent analyses</h2>
            </div>

            <button
                type="button"
                :disabled="isLoading"
                class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-slate-400 hover:tw:text-primary tw:disabled:opacity-50"
                aria-label="Refresh history"
                @click="load"
            >
                <RefreshCw class="tw:w-3.5 tw:h-3.5" :class="isLoading && 'tw:animate-spin'" />
            </button>
        </div>

        <!-- UX only: listAll() is enforced by the RolesGuard, so hiding this changes nothing
             server-side. It is hidden from non-admins because offering a control that always
             403s is worse than not offering it. -->
        <div
            v-if="canBrowseAll"
            class="tw:flex tw:gap-1 tw:mb-4 tw:p-0.5 tw:bg-slate-100 tw:rounded-lg"
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

        <ul v-else class="tw:flex tw:flex-col tw:gap-2 tw:max-h-96 tw:overflow-y-auto">
            <li v-for="record in records" :key="record.id">
                <button
                    type="button"
                    class="tw:w-full tw:flex tw:items-center tw:gap-3 tw:p-2 tw:rounded-xl tw:border tw:text-left tw:transition-colors"
                    :class="
                        record.id === props.activeId
                            ? 'tw:border-primary tw:bg-primary/5'
                            : 'tw:border-slate-200 hover:tw:border-primary/40 hover:tw:bg-slate-50'
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
