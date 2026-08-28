<script setup lang="ts">
import { ArrowUpDown, Eye, EyeOff, Pentagon, Shapes, Sparkles } from '@lucide/vue'
import type { Shape } from '~/core/helpers/annotationShapes'
import { colorForShape } from '~/core/helpers/annotationClasses'
import ShapeRow from './ShapeRow.vue'

const props = defineProps<{
    shapes: Shape[]
    classLabels: string[]
    selectedId: string | null
    hiddenIds: Set<string>
    /** Shape id to model confidence, for the ones seeded and not yet judged. */
    seeded: Record<string, number>
    allHidden: boolean
}>()

const emit = defineEmits<{
    select: [id: string]
    'toggle-hidden': [id: string]
    'toggle-all': []
    accept: [id: string]
    reject: [id: string]
    seed: []
    'draw-polygon': []
}>()

/**
 * Unreviewed seeded shapes float to the top.
 *
 * They are the work: the list is a review queue while any of them remain, and burying them under
 * hand-drawn shapes in draw order is how a batch gets called done with model output nobody read.
 * Everything else keeps draw order, which is the order someone drew it in and therefore the order
 * they expect to find it.
 */
const sorted = computed(() => {
    const seededFirst = props.shapes.filter((shape) => shape.id in props.seeded)
    const rest = props.shapes.filter((shape) => !(shape.id in props.seeded))
    return [...seededFirst, ...rest]
})

const unreviewed = computed(() => Object.keys(props.seeded).length)
</script>

<template>
    <section class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <div class="tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:px-3.5 tw:pt-1 tw:pb-2">
            <span class="tw:text-[12.5px] tw:font-semibold tw:text-an-text">Shapes</span>
            <span class="tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-faint">
                {{ shapes.length }}
            </span>
            <span
                v-if="unreviewed"
                class="tw:flex tw:items-center tw:gap-1 tw:rounded tw:bg-an-warn-tint tw:px-1.5 tw:py-0.5 tw:text-[10px] tw:font-semibold tw:text-an-warn"
            >
                <Sparkles class="tw:h-2.5 tw:w-2.5" />
                {{ unreviewed }} to review
            </span>
            <div class="tw:flex-1"></div>
            <button
                type="button"
                class="tw:flex tw:h-6 tw:w-6 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-400 tw:hover:bg-an-n-100 tw:hover:text-an-muted"
                :aria-label="allHidden ? 'Show all shapes' : 'Hide all shapes'"
                title="Hide/show all (H)"
                @click="emit('toggle-all')"
            >
                <EyeOff v-if="allHidden" class="tw:h-3.5 tw:w-3.5" />
                <Eye v-else class="tw:h-3.5 tw:w-3.5" />
            </button>
            <button
                type="button"
                class="tw:flex tw:h-6 tw:w-6 tw:cursor-not-allowed tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-300"
                aria-label="Sort"
                title="Unreviewed first, then draw order"
                disabled
            >
                <ArrowUpDown class="tw:h-3.5 tw:w-3.5" />
            </button>
        </div>

        <ul
            v-if="sorted.length"
            class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:px-2 tw:pb-2"
            style="scrollbar-gutter: stable"
        >
            <ShapeRow
                v-for="shape in sorted"
                :key="shape.id"
                :shape="shape"
                :color="colorForShape(classLabels, shape)"
                :selected="shape.id === selectedId"
                :hidden="hiddenIds.has(shape.id)"
                :confidence="seeded[shape.id] ?? null"
                @select="emit('select', shape.id)"
                @toggle-hidden="emit('toggle-hidden', shape.id)"
                @accept="emit('accept', shape.id)"
                @reject="emit('reject', shape.id)"
            />

            <!-- Under the list rather than in the empty state, because it is the answer to "what
                 now" once there is already something here. Naming the class requirement is the
                 point: drawing without one produces an unlabelled shape nobody can grade. -->
            <li
                class="tw:flex tw:items-center tw:gap-1.5 tw:px-2 tw:pt-2 tw:text-[11px] tw:text-an-n-400"
            >
                <Pentagon class="tw:h-3 tw:w-3 tw:shrink-0" />
                Draw with
                <kbd
                    class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-1 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none"
                >
                    P
                </kbd>
                or
                <kbd
                    class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-1 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none"
                >
                    R
                </kbd>
                · pick a class first
            </li>
        </ul>

        <!-- Anchored to the top, not centred: this region is tall, and a message floating in the
             middle of it reads as a hole rather than as a prompt. -->
        <div
            v-else
            class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:items-center tw:gap-2 tw:px-5 tw:pt-12 tw:text-center"
        >
            <Shapes class="tw:h-6 tw:w-6 tw:text-an-n-300" />
            <p class="tw:text-[13px] tw:font-medium tw:text-an-text">Nothing labelled yet</p>
            <p class="tw:text-[11.5px] tw:text-an-n-500">
                Seed from a model run to correct its output, or draw the first shape yourself.
            </p>
            <div class="tw:mt-1 tw:flex tw:flex-col tw:gap-1.5">
                <McButton size="sm" @click="emit('seed')">
                    <Sparkles class="tw:h-3.5 tw:w-3.5" />
                    Seed from run
                </McButton>
                <McButton variant="outline" size="sm" @click="emit('draw-polygon')">
                    Draw polygon
                    <kbd
                        class="tw:ml-1 tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none tw:text-an-muted"
                    >
                        P
                    </kbd>
                </McButton>
            </div>
        </div>
    </section>
</template>
