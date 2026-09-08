<script setup lang="ts">
/**
 * The review screen's image list: one row per album image, a leading verdict dot, a thumbnail, the
 * box/skip summary and a trailing box-count badge in the verdict's colour.
 *
 * A view component (props in, `select`/`reveal` out) so it renders both docked (the left column on a
 * wide screen) and inside a drawer on a tablet. Thumbnails load lazily: a row emits `reveal` as it
 * scrolls into view and the page fetches its thumb, so a large album does not fetch every one up
 * front. The parent hands the loaded URLs back in `thumbnails`.
 */
import type { SubmissionField } from '~/services/annotationAssignmentService'
import {
    matchesReviewChip,
    reviewCounts,
    reviewRowView,
    reviewVerdictOf,
    type ReviewFilter,
    type ReviewVerdict,
} from '~/core/helpers/assignmentQueue'

// Numbered over the album, so an image the student never attempted still has a row (field null).
interface ReviewItem {
    index: number
    imageId: number
    field: SubmissionField | null
}

const props = defineProps<{
    items: ReviewItem[]
    currentIndex: number
    /** Loaded thumbnail object URLs, keyed by image id; a row without one shows a skeleton. */
    thumbnails?: Record<number, string>
}>()
const emit = defineEmits<{ select: [index: number]; reveal: [imageId: number] }>()

const filter = ref<ReviewFilter>('all')

const toRowInput = (f: SubmissionField | null) =>
    f ? { review_status: f.review_status, status: f.status, boxCount: f.annotations.length } : null

const rows = computed(() =>
    props.items.map((item) => {
        const input = { field: toRowInput(item.field) }
        return { item, verdict: reviewVerdictOf(input), view: reviewRowView(input) }
    }),
)
const counts = computed(() => reviewCounts(rows.value.map((r) => r.verdict)))
const visibleRows = computed(() =>
    rows.value.filter((r) => matchesReviewChip(r.verdict, filter.value)),
)

const chips: { key: ReviewFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unreviewed', label: 'Unreviewed' },
    { key: 'flagged', label: 'Flagged' },
    { key: 'incorrect', label: 'Incorrect' },
]

// Whole literal strings so Tailwind emits them.
const dotClass = (v: ReviewVerdict) =>
    v === 'approved'
        ? 'tw:bg-an-accent-hover'
        : v === 'flagged'
          ? 'tw:bg-an-warn'
          : v === 'incorrect'
            ? 'tw:bg-an-rose'
            : 'tw:bg-an-n-300'

const badgeClass = (v: ReviewVerdict) =>
    v === 'approved'
        ? 'tw:bg-an-accent-tint tw:text-an-accent-hover'
        : v === 'flagged'
          ? 'tw:bg-an-warn-tint tw:text-an-warn'
          : v === 'incorrect'
            ? 'tw:bg-an-rose-tint tw:text-an-rose'
            : 'tw:bg-an-n-100 tw:text-an-n-500'

// One observer over the list; each row asks for its thumbnail the first time it nears the viewport.
const listEl = useTemplateRef<HTMLElement>('listEl')
let observer: IntersectionObserver | undefined
const observed = new Set<number>()
const syncObserver = () => {
    if (!observer || !listEl.value) return
    for (const el of listEl.value.querySelectorAll<HTMLElement>('[data-review-id]')) {
        const id = Number(el.dataset.reviewId)
        if (observed.has(id)) continue
        observed.add(id)
        observer.observe(el)
    }
}
onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') return
    observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue
                const id = Number((entry.target as HTMLElement).dataset.reviewId)
                if (id) emit('reveal', id)
                observer?.unobserve(entry.target)
            }
        },
        { root: listEl.value, rootMargin: '200px' },
    )
    syncObserver()
})
onBeforeUnmount(() => observer?.disconnect())
watch([() => props.items.length, visibleRows], () => nextTick(syncObserver))
</script>

<template>
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <div class="tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:px-3 tw:pt-3 tw:pb-2">
            <span class="tw:text-[12.5px] tw:font-semibold tw:text-an-text">Images</span>
            <span class="tw:font-mono tw:text-[10px] tw:tabular-nums tw:text-an-faint">
                {{ items.length }}
            </span>
        </div>

        <!-- chips: verdict state is what an instructor traverses (approved is not one, on purpose) -->
        <div class="tw:flex tw:shrink-0 tw:flex-wrap tw:gap-1 tw:px-3 tw:pb-3">
            <button
                v-for="chip in chips"
                :key="chip.key"
                type="button"
                class="tw:flex tw:items-center tw:gap-1 tw:rounded-full tw:px-2 tw:py-0.5 tw:text-[11px] tw:font-medium tw:transition-colors"
                :class="
                    filter === chip.key
                        ? 'tw:bg-an-text tw:text-white'
                        : 'tw:bg-an-n-100 tw:text-an-n-600 tw:hover:bg-an-n-150'
                "
                @click="filter = chip.key"
            >
                {{ chip.label }}
                <span class="tw:font-mono tw:tabular-nums">{{ counts[chip.key] }}</span>
            </button>
        </div>

        <div class="tw:h-px tw:shrink-0 tw:bg-an-divider"></div>

        <ul
            ref="listEl"
            class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-px tw:overflow-y-auto tw:p-1.5"
        >
            <li v-for="row in visibleRows" :key="row.item.imageId">
                <button
                    :data-review-id="row.item.imageId"
                    class="tw:relative tw:flex tw:h-14 tw:w-full tw:items-center tw:gap-2.5 tw:rounded-lg tw:py-0 tw:pr-2 tw:pl-2.5 tw:text-left tw:transition-colors"
                    :class="
                        row.item.index === currentIndex
                            ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-an-accent'
                            : 'tw:hover:bg-an-n-50'
                    "
                    @click="emit('select', row.item.index)"
                >
                    <span
                        v-if="row.item.index === currentIndex"
                        class="tw:absolute tw:top-1/2 tw:left-0 tw:h-6 tw:w-0.5 tw:-translate-y-1/2 tw:rounded-full tw:bg-an-accent"
                    />
                    <!-- verdict dot -->
                    <span
                        class="tw:size-2 tw:shrink-0 tw:rounded-full"
                        :class="dotClass(row.verdict)"
                    />
                    <!-- 42px thumbnail; a skeleton until its `reveal` fetch lands, never an empty box. -->
                    <span
                        class="tw:size-[42px] tw:shrink-0 tw:overflow-hidden tw:rounded-md tw:border tw:border-an-divider tw:bg-an-n-100"
                    >
                        <img
                            v-if="thumbnails?.[row.item.imageId]"
                            :src="thumbnails[row.item.imageId]"
                            alt=""
                            class="tw:h-full tw:w-full tw:object-cover"
                        />
                        <span
                            v-else
                            class="tw:block tw:h-full tw:w-full tw:animate-pulse tw:bg-an-n-150"
                        />
                    </span>
                    <span class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
                        <span class="tw:truncate tw:font-mono tw:text-[11.5px] tw:text-an-text">
                            Image {{ String(row.item.index + 1).padStart(2, '0') }}
                        </span>
                        <span class="tw:text-[10.5px] tw:text-an-faint">{{ row.view.meta }}</span>
                    </span>
                    <span
                        v-if="row.view.badge !== null"
                        class="tw:flex tw:h-[19px] tw:min-w-[19px] tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[5px] tw:px-1.5 tw:font-mono tw:text-[10.5px] tw:font-semibold tw:tabular-nums"
                        :class="badgeClass(row.verdict)"
                    >
                        {{ row.view.badge }}
                    </span>
                </button>
            </li>
        </ul>
    </div>
</template>
