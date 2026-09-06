<script setup lang="ts">
/**
 * The review screen's image list: one row per album image, a status dot, and the box/skip summary.
 *
 * A view component (props in, `select` out) so it renders both docked (the left column on a wide
 * screen) and inside a drawer on a tablet.
 */
import type { SubmissionField } from '~/services/annotationAssignmentService'

// Numbered over the album, so an image the student never attempted still has a row (field null).
interface ReviewItem {
    index: number
    imageId: number
    field: SubmissionField | null
}

defineProps<{ items: ReviewItem[]; currentIndex: number }>()
const emit = defineEmits<{ select: [index: number] }>()

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
</script>

<template>
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <div class="tw:border-b tw:border-an-divider tw:p-2.5">
            <span class="tw:text-[12.5px] tw:font-semibold tw:text-an-text">Images</span>
            <span class="tw:ml-2 tw:font-mono tw:text-[10px] tw:text-an-faint">
                {{ items.length }}
            </span>
        </div>
        <ul class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-px tw:overflow-y-auto tw:p-1.5">
            <li v-for="(item, i) in items" :key="item.imageId">
                <button
                    class="tw:flex tw:h-11 tw:w-full tw:items-center tw:gap-2.5 tw:rounded-lg tw:px-2 tw:text-left"
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
