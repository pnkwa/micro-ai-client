<script setup lang="ts">
import { Eraser, MousePointer2, Pentagon, Redo2, Square, Trash2, Undo2 } from '@lucide/vue'
import type { Tool } from '../canvas/AnnotationCanvas.vue'

/**
 * The tool row, as a fixed bottom bar. Compact and portrait-tablet layouts.
 *
 * A bar rather than the desktop's floating dock: holding a tablet, the reachable band is the bottom
 * of the screen, and a dock in the top-left corner is the furthest point from a thumb. Every target
 * is 44px, which is the floor for anything tapped.
 */
defineProps<{ tool: Tool; canUndo: boolean; canRedo: boolean; canDelete: boolean }>()

const emit = defineEmits<{
    'update:tool': [tool: Tool]
    undo: []
    redo: []
    'delete-selected': []
}>()

const tools = [
    { id: 'select', label: 'Select and pan', icon: MousePointer2 },
    { id: 'rectangle', label: 'Rectangle', icon: Square },
    { id: 'polygon', label: 'Polygon', icon: Pentagon },
    // A mode, and the only delete a finger has: the trash beside it needs a selection, and
    // selecting on a touchscreen is the step this tool removes.
    { id: 'delete', label: 'Erase a shape or a point', icon: Eraser },
] as const
</script>

<template>
    <div
        class="tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:justify-around tw:border-t tw:border-an-border tw:bg-an-panel tw:px-2"
    >
        <button
            v-for="option in tools"
            :key="option.id"
            type="button"
            class="tw:flex tw:h-11 tw:w-11 tw:items-center tw:justify-center tw:rounded-xl tw:transition-colors"
            :class="
                tool !== option.id
                    ? 'tw:text-an-n-600'
                    : option.id === 'delete'
                      ? 'tw:bg-danger tw:text-white'
                      : 'tw:bg-an-accent tw:text-white'
            "
            :aria-label="option.label"
            :aria-pressed="tool === option.id"
            @click="emit('update:tool', option.id as Tool)"
        >
            <component :is="option.icon" class="tw:h-5 tw:w-5" />
        </button>

        <div class="tw:h-6 tw:w-px tw:bg-an-divider"></div>

        <button
            type="button"
            class="tw:flex tw:h-11 tw:w-11 tw:items-center tw:justify-center tw:rounded-xl tw:text-an-n-600 tw:disabled:opacity-30"
            :disabled="!canUndo"
            aria-label="Undo"
            @click="emit('undo')"
        >
            <Undo2 class="tw:h-5 tw:w-5" />
        </button>
        <button
            type="button"
            class="tw:flex tw:h-11 tw:w-11 tw:items-center tw:justify-center tw:rounded-xl tw:text-an-n-600 tw:disabled:opacity-30"
            :disabled="!canRedo"
            aria-label="Redo"
            @click="emit('redo')"
        >
            <Redo2 class="tw:h-5 tw:w-5" />
        </button>
        <button
            type="button"
            class="tw:flex tw:h-11 tw:w-11 tw:items-center tw:justify-center tw:rounded-xl tw:text-danger tw:disabled:opacity-30"
            :disabled="!canDelete"
            aria-label="Delete selected"
            @click="emit('delete-selected')"
        >
            <Trash2 class="tw:h-5 tw:w-5" />
        </button>
    </div>
</template>
