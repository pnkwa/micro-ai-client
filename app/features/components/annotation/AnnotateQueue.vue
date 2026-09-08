<script setup lang="ts">
/**
 * The student annotation workspace's image queue: a title, the filter chips, a thin progress bar and
 * the per-image list. The numeric progress readout (`n / N done`) lives in the header now — this is
 * list state, the header is assignment state.
 *
 * A view component (props in, `select` out) so the same queue renders both docked (the left column on
 * a wide screen) and inside a drawer on a tablet, without the markup living in two places.
 */
import { colorForShape } from '~/core/helpers/annotationClasses'
import type { Shape } from '~/core/helpers/annotationShapes'
import type { AnnotationLabel } from '~/services/annotationLabelService'
import {
    assignmentCounts,
    assignmentRowView,
    assignmentStatusOf,
    matchesAssignmentChip,
    type AssignmentFilter,
} from '~/core/helpers/assignmentQueue'

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
    percentComplete: number
    percentSkipped: number
}>()

const emit = defineEmits<{ select: [index: number] }>()

// The active chip. `progress` folds into `todo` (see assignmentQueue), so an image with boxes that
// is not marked done stays under "To do".
const filter = ref<AssignmentFilter>('all')

const statuses = computed(() =>
    props.fields.map((f) => assignmentStatusOf({ status: f.status, shapeCount: f.shapes.length })),
)
const counts = computed(() => assignmentCounts(statuses.value))

// Rows carry their real index in `fields` so clicking a filtered row still selects the right image.
const rows = computed(() =>
    props.fields.map((field, index) => ({
        field,
        index,
        status: statuses.value[index]!,
        view: assignmentRowView({ status: field.status, shapeCount: field.shapes.length }),
    })),
)
const visibleRows = computed(() =>
    rows.value.filter((r) => matchesAssignmentChip(r.status, filter.value)),
)

const chips: { key: AssignmentFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'todo', label: 'To do' },
    { key: 'done', label: 'Done' },
    { key: 'skipped', label: 'Skipped' },
]

// Up to four distinct class colours on a row, mirroring the desktop queue dots.
const fieldDots = (field: QueueField) =>
    [
        ...new Set(
            field.shapes
                .map((s) => colorForShape(props.palette, s))
                .filter((c): c is string => Boolean(c)),
        ),
    ].slice(0, 4)

// Whole literal strings: Tailwind extracts class names from templates, so a class built by
// concatenation in script is never emitted.
const badgeClass = (status: string) =>
    status === 'done'
        ? 'tw:bg-an-accent-tint tw:text-an-accent-hover'
        : status === 'skipped'
          ? 'tw:bg-an-warn-tint tw:text-an-warn'
          : 'tw:bg-an-n-100 tw:text-an-n-600'

const metaClass = (status: string) => (status === 'todo' ? 'tw:text-an-n-300' : 'tw:text-an-n-500')
</script>

<template>
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <!-- title -->
        <div class="tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:px-3 tw:pt-3 tw:pb-2">
            <span class="tw:text-[12.5px] tw:font-semibold tw:text-an-text">Images</span>
            <span class="tw:font-mono tw:text-[10px] tw:tabular-nums tw:text-an-faint">
                {{ fields.length }}
            </span>
        </div>

        <!-- filter chips, from one selector so they partition to the total -->
        <div class="tw:flex tw:shrink-0 tw:flex-wrap tw:gap-1 tw:px-3 tw:pb-2">
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
                <span class="tw:font-mono tw:text-[11px] tw:tabular-nums">
                    {{ counts[chip.key] }}
                </span>
            </button>
        </div>

        <!-- 4px stacked progress bar; numeric readout is in the header -->
        <div class="tw:shrink-0 tw:px-3 tw:pb-3">
            <div class="tw:flex tw:h-1 tw:overflow-hidden tw:rounded-full tw:bg-an-n-150">
                <!-- Complete -->
                <div
                    class="tw:h-full tw:bg-an-accent tw:transition-[width]"
                    :style="{ width: `${percentComplete}%` }"
                ></div>

                <!-- Skipped -->
                <div
                    class="tw:h-full tw:bg-amber-300 tw:transition-[width]"
                    :style="{ width: `${percentSkipped}%` }"
                ></div>
            </div>
        </div>

        <div class="tw:h-px tw:shrink-0 tw:bg-an-divider"></div>

        <ul class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-px tw:overflow-y-auto tw:p-1.5">
            <li v-for="row in visibleRows" :key="row.field.imageId">
                <button
                    type="button"
                    class="tw:relative tw:flex tw:h-14 tw:w-full tw:items-center tw:gap-2.5 tw:rounded-lg tw:py-0 tw:pr-2 tw:pl-[7px] tw:text-left tw:transition-colors"
                    :class="
                        row.index === currentIndex
                            ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-an-accent'
                            : 'tw:hover:bg-an-n-50'
                    "
                    @click="emit('select', row.index)"
                >
                    <!-- 2px teal left bar on the selected row -->
                    <span
                        v-if="row.index === currentIndex"
                        class="tw:absolute tw:top-1/2 tw:left-0 tw:h-6 tw:w-0.5 tw:-translate-y-1/2 tw:rounded-full tw:bg-an-accent"
                    />
                    <span
                        class="tw:h-[42px] tw:w-[42px] tw:shrink-0 tw:overflow-hidden tw:rounded-md tw:bg-an-canvas"
                    >
                        <img
                            v-if="row.field.thumb"
                            :src="row.field.thumb"
                            class="tw:h-full tw:w-full tw:object-cover"
                            alt=""
                        />
                        <McSkeleton v-else class="tw:h-full tw:w-full tw:rounded-none" />
                    </span>

                    <span class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-[3px]">
                        <span
                            class="tw:truncate tw:font-mono tw:text-[11.5px] tw:font-medium tw:text-an-n-700"
                        >
                            Image {{ String(row.index + 1).padStart(2, '0') }}
                        </span>
                        <span class="tw:flex tw:items-center tw:gap-1.5">
                            <span
                                v-for="(dot, di) in fieldDots(row.field)"
                                :key="di"
                                class="tw:h-1.5 tw:w-1.5 tw:shrink-0 tw:rounded-[2px]"
                                :style="{ background: dot }"
                            ></span>
                            <span
                                class="tw:truncate tw:text-[10.5px]"
                                :class="metaClass(row.status)"
                            >
                                {{ row.view.meta }}
                            </span>
                        </span>
                    </span>

                    <!-- done/in-progress show the count; skipped shows a dash; untouched shows none. -->
                    <span
                        v-if="row.status === 'skipped' || row.view.badge !== null"
                        class="tw:flex tw:h-[19px] tw:min-w-[19px] tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[5px] tw:px-1.5 tw:font-mono tw:text-[10.5px] tw:font-semibold tw:tabular-nums"
                        :class="badgeClass(row.status)"
                    >
                        {{ row.status === 'skipped' ? '—' : row.view.badge }}
                    </span>
                </button>
            </li>
        </ul>
    </div>
</template>
