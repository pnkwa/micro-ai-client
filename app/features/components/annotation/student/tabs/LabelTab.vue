<script setup lang="ts">
/**
 * The Label tab body: do it.
 *
 * At PEEK (100px) it is two 44px rows — the tool row, then the horizontally scrolling class chips —
 * so the whole labelling loop (pick a tool, pick a class, draw) is reachable without expanding the
 * sheet. At half/full (`expanded`) the shape list on this image follows beneath, with a permanently
 * visible delete on every row (there is no hover on touch).
 */
import { Pentagon, Square, Trash2 } from '@lucide/vue'
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
    expanded?: boolean
}>()

const emit = defineEmits<{
    'update:tool': [tool: Tool]
    undo: []
    redo: []
    'delete-selected': []
    pick: [id: number]
    'select-shape': [id: string]
    'delete-shape': [id: string]
}>()

const shapeColor = (s: Shape) => colorForShape(props.palette, s) ?? 'var(--color-an-n-250)'
</script>

<template>
    <div class="tw:flex tw:h-full tw:flex-col">
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
            <ClassChipStrip :classes="classes" :active="activeLabelId" @pick="emit('pick', $event)" />
        </div>

        <!-- Expanded only: the shapes on this image. Eye/delete are always shown — no hover on touch. -->
        <div v-if="expanded" class="tw:mt-2 tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-y-auto tw:[touch-action:pan-y]">
            <div
                v-for="s in shapes"
                :key="s.id"
                class="tw:flex tw:h-11 tw:cursor-pointer tw:items-center tw:gap-2.5 tw:rounded-[9px] tw:px-2"
                :class="[
                    s.id === selectedId ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-inset tw:ring-an-accent/40' : '',
                    hiddenIds.has(s.id) ? 'tw:opacity-45' : '',
                ]"
                @click="emit('select-shape', s.id)"
            >
                <span class="tw:h-6 tw:w-[3px] tw:shrink-0 tw:rounded-[2px]" :style="{ background: shapeColor(s) }" />
                <component :is="s.polygon ? Pentagon : Square" class="tw:size-[15px] tw:shrink-0 tw:text-an-n-500" />
                <span
                    class="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[13.5px]"
                    :class="s.label ? 'tw:text-an-text' : 'tw:text-an-n-300 tw:italic'"
                >
                    {{ s.label || 'Unlabelled' }}
                </span>
                <button
                    type="button"
                    class="tw:flex tw:size-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-400"
                    aria-label="Delete"
                    @click.stop="emit('delete-shape', s.id)"
                >
                    <Trash2 class="tw:size-[15px]" />
                </button>
            </div>
            <p v-if="!shapes.length" class="tw:px-2 tw:pt-3 tw:text-[12px] tw:text-an-faint">
                Pick a class, then draw a box on the image.
            </p>
        </div>
    </div>
</template>
