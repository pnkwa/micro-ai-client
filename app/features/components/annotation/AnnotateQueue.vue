<script setup lang="ts">
/**
 * The student annotation workspace's image queue: a progress summary plus the per-image list.
 *
 * A view component (props in, `select` out) so the same queue renders both docked (the left column
 * on a wide screen) and inside a drawer on a tablet, without the markup living in two places.
 */
import { colorForShape } from '~/core/helpers/annotationClasses'
import type { Shape } from '~/core/helpers/annotationShapes'
import type { AnnotationLabel } from '~/services/annotationLabelService'

// The subset of the page's per-image state the queue reads.
interface QueueField {
    imageId: number
    shapes: Shape[]
    status: 'pending' | 'completed' | 'skipped'
    thumb: string | null
}

const props = defineProps<{
    fields: QueueField[]
    palette: AnnotationLabel[]
    currentIndex: number
    doneCount: number
    skippedCount: number
    percent: number
}>()

const emit = defineEmits<{ select: [index: number] }>()

const statusText = (field: QueueField) =>
    field.status === 'completed'
        ? 'done'
        : field.status === 'skipped'
          ? 'skipped'
          : field.shapes.length > 0
            ? `${field.shapes.length} box${field.shapes.length === 1 ? '' : 'es'}`
            : 'to do'

// Up to four distinct class colours on a row, mirroring the desktop queue dots.
const fieldDots = (field: QueueField) =>
    [
        ...new Set(
            field.shapes
                .map((s) => colorForShape(props.palette, s))
                .filter((c): c is string => Boolean(c)),
        ),
    ].slice(0, 4)

const fieldBadge = (field: QueueField) =>
    field.shapes.length > 0 ? String(field.shapes.length) : null

const fieldBadgeClass = (field: QueueField) =>
    field.status === 'completed'
        ? 'tw:bg-an-accent-tint tw:text-an-accent-hover'
        : field.status === 'skipped'
          ? 'tw:bg-an-warn-tint tw:text-an-warn'
          : 'tw:bg-an-n-100 tw:text-an-n-600'

const metaClass = (field: QueueField) =>
    field.status === 'pending' && field.shapes.length === 0
        ? 'tw:text-an-n-300'
        : 'tw:text-an-n-500'
</script>

<template>
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <!-- progress -->
        <div class="tw:shrink-0 tw:px-3 tw:pt-3 tw:pb-3">
            <div class="tw:mb-1.5 tw:flex tw:items-baseline tw:gap-1.5">
                <div class="tw:flex tw:flex-col">
                    <div>
                        <span
                            class="tw:font-mono tw:text-[11px] tw:font-semibold tw:tabular-nums tw:text-an-text"
                        >
                            {{ doneCount }} / {{ fields.length }}
                        </span>
                        <span class="tw:text-[11px] tw:text-an-faint tw:px-1">done</span>
                    </div>
                    <div>
                        <span
                            class="tw:text-an-warn tw:font-mono tw:text-[11px] tw:font-semibold tw:tabular-nums tw:text-an-text"
                        >
                            {{ skippedCount }}
                        </span>
                        <span class="tw:text-[11px] tw:text-an-faint tw:px-1">skipped</span>
                    </div>
                </div>
                <div class="tw:flex-1"></div>
                <span class="tw:font-mono tw:tabular-nums tw:text-an-faint">{{ percent }}%</span>
            </div>
            <div class="tw:h-1 tw:overflow-hidden tw:rounded-full tw:bg-an-n-150">
                <div
                    class="tw:h-full tw:rounded-full tw:bg-an-accent tw:transition-[width]"
                    :style="{ width: `${percent}%` }"
                ></div>
            </div>
        </div>

        <div class="tw:h-px tw:shrink-0 tw:bg-an-divider"></div>

        <ul class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-px tw:overflow-y-auto tw:p-1.5">
            <li v-for="(field, i) in fields" :key="field.imageId">
                <button
                    type="button"
                    class="tw:flex tw:h-14 tw:w-full tw:items-center tw:gap-2.5 tw:rounded-lg tw:py-0 tw:pr-2 tw:pl-[7px] tw:text-left tw:transition-colors"
                    :class="
                        i === currentIndex
                            ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-an-accent'
                            : 'tw:hover:bg-an-n-50'
                    "
                    @click="emit('select', i)"
                >
                    <span
                        class="tw:h-[42px] tw:w-[42px] tw:shrink-0 tw:overflow-hidden tw:rounded-md tw:bg-an-canvas"
                    >
                        <img
                            v-if="field.thumb"
                            :src="field.thumb"
                            class="tw:h-full tw:w-full tw:object-cover"
                            alt=""
                        />
                        <McSkeleton v-else class="tw:h-full tw:w-full tw:rounded-none" />
                    </span>

                    <span class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-[3px]">
                        <span
                            class="tw:truncate tw:font-mono tw:text-[11.5px] tw:font-medium tw:text-an-n-700"
                        >
                            Image {{ String(i + 1).padStart(2, '0') }}
                        </span>
                        <span class="tw:flex tw:items-center tw:gap-1.5">
                            <span
                                v-for="(dot, di) in fieldDots(field)"
                                :key="di"
                                class="tw:h-1.5 tw:w-1.5 tw:shrink-0 tw:rounded-[2px]"
                                :style="{ background: dot }"
                            ></span>
                            <span class="tw:truncate tw:text-[10.5px]" :class="metaClass(field)">
                                {{ statusText(field) }}
                            </span>
                        </span>
                    </span>

                    <span
                        v-if="fieldBadge(field) !== null"
                        class="tw:flex tw:h-[19px] tw:min-w-[19px] tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[5px] tw:px-1.5 tw:font-mono tw:text-[10.5px] tw:font-semibold tw:tabular-nums"
                        :class="fieldBadgeClass(field)"
                    >
                        {{ fieldBadge(field) }}
                    </span>
                </button>
            </li>
        </ul>
    </div>
</template>
