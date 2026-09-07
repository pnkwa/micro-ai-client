<script setup lang="ts">
/**
 * The review screen's image list: one row per album image, a thumbnail, a verdict dot and the
 * box/skip summary.
 *
 * A view component (props in, `select`/`reveal` out) so it renders both docked (the left column on a
 * wide screen) and inside a drawer on a tablet. Thumbnails load lazily: a row emits `reveal` as it
 * scrolls into view and the page fetches its thumb, so a large album does not fetch every one up
 * front. The parent hands the loaded URLs back in `thumbnails`.
 */
import type { SubmissionField } from '~/services/annotationAssignmentService'

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

const reviewDotClass = (status: string) =>
    status === 'approved'
        ? 'tw:bg-success'
        : status === 'flagged'
          ? 'tw:bg-warning'
          : status === 'incorrect'
            ? 'tw:bg-danger'
            : 'tw:bg-an-n-300'

const fieldStatusLabel = (f: SubmissionField) =>
    f.status === 'skipped'
        ? 'skipped'
        : `${f.annotations.length} box${f.annotations.length === 1 ? '' : 'es'}`

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
watch(
    () => props.items.length,
    () => nextTick(syncObserver),
)
</script>

<template>
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <div class="tw:border-b tw:border-an-divider tw:p-2.5">
            <span class="tw:text-[12.5px] tw:font-semibold tw:text-an-text">Images</span>
            <span class="tw:ml-2 tw:font-mono tw:text-[10px] tw:text-an-faint">
                {{ items.length }}
            </span>
        </div>
        <ul
            ref="listEl"
            class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-px tw:overflow-y-auto tw:p-1.5"
        >
            <li v-for="(item, i) in items" :key="item.imageId">
                <button
                    :data-review-id="item.imageId"
                    class="tw:flex tw:h-14 tw:w-full tw:items-center tw:gap-2.5 tw:rounded-lg tw:px-2 tw:text-left"
                    :class="
                        i === currentIndex
                            ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-an-accent'
                            : 'tw:hover:bg-an-n-50'
                    "
                    @click="emit('select', i)"
                >
                    <span
                        class="tw:size-2 tw:shrink-0 tw:rounded-full"
                        :class="
                            item.field ? reviewDotClass(item.field.review_status) : 'tw:bg-an-n-200'
                        "
                    />
                    <!-- 42px thumbnail; a skeleton until its `reveal` fetch lands, never an empty box. -->
                    <span
                        class="tw:size-[42px] tw:shrink-0 tw:overflow-hidden tw:rounded-md tw:border tw:border-an-divider tw:bg-an-n-100"
                    >
                        <img
                            v-if="thumbnails?.[item.imageId]"
                            :src="thumbnails[item.imageId]"
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
                            Image {{ String(item.index + 1).padStart(2, '0') }}
                        </span>
                        <span class="tw:text-[10.5px] tw:text-an-faint">
                            {{ item.field ? fieldStatusLabel(item.field) : 'not attempted' }}
                        </span>
                    </span>
                </button>
            </li>
        </ul>
    </div>
</template>
