<script setup lang="ts">
import { AlignLeft, Eye, EyeOff, Pentagon, Sparkles } from '@lucide/vue'
import type { Shape } from '~/core/helpers/annotationShapes'
import type { AnnotationLabel } from '~/services/annotationLabelService'
import { colorForShape } from '~/core/helpers/annotationClasses'
import ShapeRow from './ShapeRow.vue'

const props = defineProps<{
    shapes: Shape[]
    palette: AnnotationLabel[]
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
</script>

<template>
    <section class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <div class="tw:flex tw:shrink-0 tw:items-center tw:pt-3 tw:pr-3 tw:pb-2 tw:pl-3.5">
            <span class="tw:text-[11.5px] tw:font-semibold tw:tracking-[-0.1px] tw:text-an-text">
                Shapes
            </span>
            <span class="tw:ml-1.5 tw:font-mono tw:text-[10.5px] tw:tabular-nums tw:text-an-faint">
                {{ shapes.length }}
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
                <AlignLeft class="tw:h-3.5 tw:w-3.5" />
            </button>
        </div>

        <ul
            v-if="sorted.length"
            class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-0.5 tw:overflow-y-auto tw:px-2 tw:pb-2"
            style="scrollbar-gutter: stable"
        >
            <ShapeRow
                v-for="shape in sorted"
                :key="shape.id"
                :shape="shape"
                :color="colorForShape(palette, shape)"
                :selected="shape.id === selectedId"
                :hidden="hiddenIds.has(shape.id)"
                :confidence="seeded[shape.id] ?? null"
                @select="emit('select', shape.id)"
                @toggle-hidden="emit('toggle-hidden', shape.id)"
                @accept="emit('accept', shape.id)"
                @reject="emit('reject', shape.id)"
            />

            <!-- Under the list rather than in the empty state, because it is the answer to "what
                 now" once there is already something here. It says the class can wait rather than
                 that it is required: an unnamed shape saves, and outlining a slide in one pass and
                 naming afterwards is how people actually work through a batch. -->
            <li
                class="tw:flex tw:items-center tw:gap-[7px] tw:px-2.5 tw:pt-2 tw:text-[10.5px] tw:text-an-n-300"
            >
                <Pentagon class="tw:h-[13px] tw:w-[13px] tw:shrink-0" />
                Draw with
                <kbd
                    class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-[5px] tw:py-[3px] tw:font-mono tw:text-[9.5px] tw:leading-none"
                >
                    P
                </kbd>
                or
                <kbd
                    class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-[5px] tw:py-[3px] tw:font-mono tw:text-[9.5px] tw:leading-none"
                >
                    R
                </kbd>
                then name it whenever
            </li>
        </ul>

        <!-- A dashed card rather than a bare centred message: the region is tall, and text floating
             in the middle of it reads as a hole where a panel failed to load. The border makes the
             emptiness deliberate, and holds the two ways out. -->
        <div v-else class="tw:min-h-0 tw:flex-1 tw:px-3.5 tw:pb-3.5">
            <div
                class="tw:flex tw:h-full tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:rounded-xl tw:border tw:border-dashed tw:border-an-n-200 tw:bg-an-chrome tw:p-[18px]"
            >
                <Pentagon class="tw:h-[26px] tw:w-[26px] tw:text-an-n-250" />
                <div class="tw:flex tw:flex-col tw:items-center tw:gap-1">
                    <span class="tw:text-[11.5px] tw:font-semibold tw:text-an-text">
                        Nothing labelled yet
                    </span>
                    <span class="tw:text-center tw:text-[11px] tw:text-pretty tw:text-an-faint">
                        Pick a class, then draw. Or let the last model run place shapes for you.
                    </span>
                </div>
                <div class="tw:flex tw:gap-1.5">
                    <McButton size="sm" class="tw:text-[12px]!" @click="emit('seed')">
                        <Sparkles class="tw:h-3.5 tw:w-3.5" />
                        Seed from run
                    </McButton>
                    <McButton
                        variant="outline"
                        size="sm"
                        class="tw:text-[12px]!"
                        @click="emit('draw-polygon')"
                    >
                        Draw polygon
                        <kbd
                            class="tw:ml-1 tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-[5px] tw:py-[3px] tw:font-mono tw:text-[9.5px] tw:leading-none tw:text-an-muted"
                        >
                            P
                        </kbd>
                    </McButton>
                </div>
            </div>
        </div>
    </section>
</template>
