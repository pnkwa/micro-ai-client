<script setup lang="ts">
/**
 * The student's touch tool row — the top half of the Label tab body.
 *
 * SIX equal-flex 44px targets: select, rectangle, polygon | undo, redo, delete. The pencil and the
 * erase-mode tool from the shared instructor `BottomTools` are deliberately NOT here — eight 41px
 * targets on a 390px phone fall below the 44px floor, and delete-selected plus picking a different
 * class chip cover what erase and reclass did. Trace-into-polygon is still reachable: the polygon
 * tool's finger drag lays a straight edge, tap by tap.
 *
 * Its own component rather than a reshaped `BottomTools` because that bar is shared with the
 * instructor annotator, whose touch set keeps the pencil and the erase mode.
 */
import { MousePointer2, Pentagon, Redo2, Square, Trash2, Undo2 } from '@lucide/vue'
import type { Tool } from '~/features/components/annotator/canvas/AnnotationCanvas.vue'

defineProps<{ tool: Tool; canUndo: boolean; canRedo: boolean; canDelete: boolean }>()

const emit = defineEmits<{
    'update:tool': [tool: Tool]
    undo: []
    redo: []
    'delete-selected': []
}>()

// Only the three drawing modes are tools; undo/redo/delete are actions, so they sit past a divider.
const tools = [
    { id: 'select', label: 'Select', icon: MousePointer2 },
    { id: 'rectangle', label: 'Rectangle', icon: Square },
    { id: 'polygon', label: 'Polygon', icon: Pentagon },
] as const

const btn =
    'tw:flex tw:h-11 tw:min-w-0 tw:flex-1 tw:items-center tw:justify-center tw:rounded-[9px] tw:transition-colors'
</script>

<template>
    <div class="tw:flex tw:h-11 tw:items-center tw:gap-0.5 tw:[touch-action:pan-x_pan-y]">
        <button
            v-for="option in tools"
            :key="option.id"
            type="button"
            :class="[btn, tool === option.id ? 'tw:bg-an-accent tw:text-white' : 'tw:text-an-n-600']"
            :aria-label="option.label"
            :aria-pressed="tool === option.id"
            @click="emit('update:tool', option.id as Tool)"
        >
            <component :is="option.icon" class="tw:size-[19px]" />
        </button>

        <span class="tw:mx-1 tw:h-[22px] tw:w-px tw:shrink-0 tw:bg-an-divider" />

        <button
            type="button"
            :class="[btn, 'tw:text-an-n-600 tw:disabled:opacity-30']"
            :disabled="!canUndo"
            aria-label="Undo"
            @click="emit('undo')"
        >
            <Undo2 class="tw:size-[19px]" />
        </button>
        <button
            type="button"
            :class="[btn, 'tw:text-an-n-600 tw:disabled:opacity-30']"
            :disabled="!canRedo"
            aria-label="Redo"
            @click="emit('redo')"
        >
            <Redo2 class="tw:size-[19px]" />
        </button>
        <button
            type="button"
            :class="[btn, 'tw:text-an-rose tw:disabled:opacity-30']"
            :disabled="!canDelete"
            aria-label="Delete selected"
            @click="emit('delete-selected')"
        >
            <Trash2 class="tw:size-[19px]" />
        </button>
    </div>
</template>
