<script setup lang="ts">
/**
 * The Label tab body: do it.
 *
 * At PEEK (108px) it is two 44px rows — the tool row, then the horizontally scrolling class chips —
 * so the whole labelling loop (pick a tool, pick a class, draw) is reachable without expanding the
 * sheet. At half/full (`expanded`) the shape list on this image follows beneath, with a permanently
 * visible delete on every row (there is no hover on touch).
 *
 * That list is its own SECTION when expanded — a rule and a "Your labels" heading — because the
 * expanded sheet is 68dvh and an unlabelled image would otherwise leave one grey sentence stranded
 * in several hundred pixels of nothing, which reads as a broken layout rather than an empty list.
 * Its empty state is anchored near the top and centred across the column for the same reason the
 * docked AnnotatePanel's is: the start of a list waiting to be filled, not a hole that ate the sheet.
 */
import { Lock, Pentagon, Shapes, Square, Trash2 } from '@lucide/vue'
import { colorForShape } from '~/core/helpers/annotationClasses'
import type { AnnotationClass } from '~/core/helpers/annotationClasses'
import type { Shape } from '~/core/helpers/annotationShapes'
import type { AnnotationLabel } from '~/services/annotationLabelService'
import type { Tool } from '~/features/components/annotator/canvas/AnnotationCanvas.vue'
import TouchToolRow from '../TouchToolRow.vue'
import ClassChipStrip from '../ClassChipStrip.vue'

const props = defineProps<{
    tool: Tool
    canUndo: boolean
    canRedo: boolean
    canDelete: boolean
    classes: AnnotationClass[]
    activeLabelId: number | null
    shapes: Shape[]
    selectedId: string | null
    hiddenIds: Set<string>
    palette: AnnotationLabel[]
    /** A fixed vocabulary: the chip strip picks only, with no "+" and no swatch editor. */
    fixed?: boolean
    /** The image is marked done, so the labelling controls are replaced by a notice. */
    locked?: boolean
    expanded?: boolean
}>()

const emit = defineEmits<{
    'update:tool': [tool: Tool]
    undo: []
    redo: []
    'delete-selected': []
    pick: [id: number]
    'create-class': [label: string, colorHex: string]
    'edit-class': [id: number, label: string, colorHex: string]
    'select-shape': [id: string]
    'delete-shape': [id: string]
}>()

const shapeColor = (s: Shape) => colorForShape(props.palette, s) ?? 'var(--color-an-n-250)'
</script>

<template>
    <div class="tw:flex tw:h-full tw:flex-col">
        <!-- Marked done: the tools and the chips are REPLACED rather than greyed out. A row of
             disabled icons still reads as "tap here", and the honest answer is a sentence naming
             the button that unlocks it.
             ONE LINE, no tinted card, and it FILLS the body at peek rather than sitting as a block
             with dead space beneath. The state is already said twice below (the status line's
             "Done · saved" and the button itself), so a third full-width alert competing with the
             action row's colour was weight this sheet did not need. Expanded, it shrinks back to a
             44px band so the shape list keeps the room. -->
        <div
            v-if="locked"
            class="tw:flex tw:items-center tw:justify-center tw:gap-2"
            :class="expanded ? 'tw:h-11 tw:shrink-0' : 'tw:min-h-0 tw:flex-1'"
        >
            <Lock class="tw:size-4 tw:shrink-0 tw:text-an-accent" />
            <p class="tw:text-[12.5px] tw:text-an-n-600">
                Marked done. Tap
                <b class="tw:font-semibold tw:text-an-text">Undo done</b>
                to edit.
            </p>
        </div>

        <template v-else>
            <TouchToolRow
                :tool="tool"
                :can-undo="canUndo"
                :can-redo="canRedo"
                :can-delete="canDelete"
                @update:tool="emit('update:tool', $event)"
                @undo="emit('undo')"
                @redo="emit('redo')"
                @delete-selected="emit('delete-selected')"
            />
            <div class="tw:mt-2 tw:shrink-0">
                <ClassChipStrip
                    :classes="classes"
                    :active="activeLabelId"
                    :fixed="fixed"
                    @pick="emit('pick', $event)"
                    @create="(label, color) => emit('create-class', label, color)"
                    @edit="(id, label, color) => emit('edit-class', id, label, color)"
                />
            </div>
        </template>

        <!-- Expanded only: the shapes on this image, as their own section under a rule so the list
             is not just loose rows hanging off the class chips. Delete is always shown — no hover
             on touch. -->
        <div
            v-if="expanded"
            class="tw:mt-2.5 tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:border-t tw:border-an-divider tw:pt-2.5"
        >
            <div class="tw:mb-1 tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:px-2">
                <span class="tw:text-[12px] tw:font-semibold tw:text-an-text">Your labels</span>
                <span class="tw:font-mono tw:text-[11px] tw:text-an-faint">
                    {{ shapes.length }}
                </span>
            </div>

            <div
                class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-y-auto tw:[touch-action:pan-y]"
            >
                <div
                    v-for="s in shapes"
                    :key="s.id"
                    class="tw:flex tw:h-11 tw:cursor-pointer tw:items-center tw:gap-2.5 tw:rounded-[9px] tw:px-2"
                    :class="[
                        s.id === selectedId
                            ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-inset tw:ring-an-accent/40'
                            : '',
                        hiddenIds.has(s.id) ? 'tw:opacity-45' : '',
                    ]"
                    @click="emit('select-shape', s.id)"
                >
                    <span
                        class="tw:h-6 tw:w-[3px] tw:shrink-0 tw:rounded-[2px]"
                        :style="{ background: shapeColor(s) }"
                    />
                    <component
                        :is="s.polygon ? Pentagon : Square"
                        class="tw:size-[15px] tw:shrink-0 tw:text-an-n-500"
                    />
                    <span
                        class="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[13.5px]"
                        :class="s.label ? 'tw:text-an-text' : 'tw:text-an-n-300 tw:italic'"
                    >
                        {{ s.label || 'Unlabelled' }}
                    </span>
                    <!-- No delete while the image is locked: the row stays tappable so a shape can
                         still be picked out on the picture, but nothing here removes one. -->
                    <button
                        v-if="!locked"
                        type="button"
                        class="tw:flex tw:size-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-400"
                        aria-label="Delete"
                        @click.stop="emit('delete-shape', s.id)"
                    >
                        <Trash2 class="tw:size-[15px]" />
                    </button>
                </div>
                <!-- Anchored near the TOP of the region, not vertically centred: it reads as the
                     start of a list waiting to be filled, not an empty state that ate the sheet. -->
                <div
                    v-if="!shapes.length"
                    class="tw:flex tw:flex-col tw:items-center tw:gap-1 tw:px-4 tw:pt-8 tw:text-center"
                >
                    <Shapes class="tw:size-6 tw:text-an-n-300" />
                    <span class="tw:text-[12.5px] tw:font-medium tw:text-an-n-500">
                        Nothing labelled yet
                    </span>
                    <span class="tw:text-[11.5px] tw:text-an-faint">
                        Pick a class, then draw on the image.
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>
