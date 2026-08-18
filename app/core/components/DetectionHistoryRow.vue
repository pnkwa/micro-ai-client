<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { User } from '@lucide/vue'
import {
    boxCount,
    formatHistoryDate,
    recordClasses,
    submitterName,
    type HistoryRecord,
} from '~/core/helpers/detectionHistory'

/**
 * One row of the detection history, which asks for its own thumbnail when it comes into view.
 *
 * A component per row rather than one observer over a `v-for` ref array, and that is not a
 * stylistic call: Vue MUTATES a `v-for` ref array in place instead of assigning a new one, so a
 * shallow ref holding it never triggers, and `useIntersectionObserver` — which rebuilds when its
 * targets or root change — keeps a targets list of `<li>`s that were detached when the panel last
 * reloaded. Measured: every row after a Refresh stayed blank. A row that owns its own observer has
 * nothing to go stale; it is created when the row mounts, torn down with it by the effect scope, and
 * a reload replaces both the root and every row together.
 *
 * The panel keeps the thumbnail cache and the fetching: this only says "I am visible".
 */
const props = defineProps<{
    record: HistoryRecord
    /** The scrolling `<ul>`, as the observer's root — a phone's viewport is not what clips this. */
    root?: HTMLElement | null
    /** Object URL of the already-loaded thumbnail, if there is one. */
    thumbnail?: string
    /** The record currently open in the viewer. */
    active?: boolean
}>()

const emit = defineEmits<{ visible: []; select: [] }>()

const el = useTemplateRef<HTMLElement>('row')

useIntersectionObserver(
    el,
    ([entry]) => {
        if (entry?.isIntersecting) emit('visible')
    },
    // A screen's worth of lead, so a row is fetched shortly before it is looked at rather than
    // after — at ~20 KB a row the cost of being early is negligible.
    { root: () => props.root, rootMargin: '200px' },
)
</script>

<template>
    <li ref="row">
        <!-- A row, not a card. Each one used to be a bordered white box, which on a full-screen
             panel drew a 1392px frame around a line of text - the border was doing separation work
             that a divider does with less ink. The loaded record is marked by a tint and a left edge
             instead of a full outline. -->
        <button
            type="button"
            class="tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-3 tw:border-l-2 tw:p-2 tw:text-left tw:transition-colors"
            :class="
                active
                    ? 'tw:border-l-primary tw:bg-primary/5'
                    : 'tw:border-l-transparent hover:tw:bg-slate-50'
            "
            @click="emit('select')"
        >
            <img
                v-if="thumbnail"
                :src="thumbnail"
                alt=""
                class="tw:w-12 tw:h-12 tw:rounded-lg tw:object-cover tw:shrink-0 tw:bg-slate-100"
            />
            <span v-else class="tw:w-12 tw:h-12 tw:rounded-lg tw:bg-slate-100 tw:shrink-0"></span>

            <span class="tw:flex tw:flex-col tw:min-w-0 tw:gap-0.5">
                <span class="tw:text-xs tw:font-semibold tw:text-slate-700 tw:truncate">
                    {{ recordClasses(record).join(', ') || 'No findings' }}
                </span>
                <span class="tw:text-[11px] tw:text-slate-400 tw:truncate">
                    {{ formatHistoryDate(record.created_at) }} · {{ boxCount(record) }} box{{
                        boxCount(record) === 1 ? '' : 'es'
                    }}
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
</template>
