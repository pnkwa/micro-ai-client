<script setup lang="ts">
import { MousePointer2, Pentagon, Redo2, Sparkles, Square, Trash2, Undo2 } from '@lucide/vue'
import type { Tool } from './AnnotationCanvas.vue'

/**
 * The vertical tool dock, floating over the top-left of the canvas.
 *
 * Floating rather than a toolbar band, because a band costs the picture its full width for the
 * whole session and the dock costs it 44px of one corner. The canvas is the thing this rebuild
 * exists to make bigger.
 */
defineProps<{
    tool: Tool
    canUndo: boolean
    canRedo: boolean
    canDelete: boolean
}>()

const emit = defineEmits<{
    'update:tool': [tool: Tool]
    undo: []
    redo: []
    'delete-selected': []
}>()

/**
 * `W` is a stub by agreement: the button and the hotkey exist, the segmentation behind them is a
 * separate conversation. Shipped visible rather than omitted so the dock's shape is settled now.
 */
const tools = [
    { id: 'select', label: 'Select and pan', key: 'V', icon: MousePointer2, ready: true },
    { id: 'rectangle', label: 'Rectangle', key: 'R', icon: Square, ready: true },
    { id: 'polygon', label: 'Polygon', key: 'P', icon: Pentagon, ready: true },
    { id: 'smart', label: 'Smart outline · coming soon', key: 'W', icon: Sparkles, ready: false },
] as const
</script>

<template>
    <div
        class="tw:absolute tw:top-3 tw:left-3 tw:z-10 tw:flex tw:w-11 tw:flex-col tw:items-center tw:gap-1 tw:rounded-xl tw:border tw:border-white/[0.09] tw:bg-an-overlay/95 tw:p-1.5 tw:backdrop-blur"
    >
        <button
            v-for="option in tools"
            :key="option.id"
            type="button"
            class="tw:flex tw:h-8 tw:w-8 tw:items-center tw:justify-center tw:rounded-lg tw:transition-colors"
            :class="[
                tool === option.id
                    ? 'tw:bg-an-accent tw:text-white'
                    : 'tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white',
                option.ready ? '' : 'tw:opacity-50',
            ]"
            :title="`${option.label} (${option.key})`"
            :aria-label="option.label"
            :aria-pressed="tool === option.id"
            :disabled="!option.ready"
            @click="emit('update:tool', option.id as Tool)"
        >
            <component :is="option.icon" class="tw:h-4 tw:w-4" />
        </button>

        <div class="tw:my-0.5 tw:h-px tw:w-6 tw:bg-white/10"></div>

        <button
            type="button"
            class="tw:flex tw:h-8 tw:w-8 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-icon tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-35 tw:disabled:hover:bg-transparent"
            :disabled="!canUndo"
            title="Undo (Z)"
            aria-label="Undo"
            @click="emit('undo')"
        >
            <Undo2 class="tw:h-4 tw:w-4" />
        </button>
        <button
            type="button"
            class="tw:flex tw:h-8 tw:w-8 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-icon tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-35 tw:disabled:hover:bg-transparent"
            :disabled="!canRedo"
            title="Redo (Y)"
            aria-label="Redo"
            @click="emit('redo')"
        >
            <Redo2 class="tw:h-4 tw:w-4" />
        </button>

        <div class="tw:my-0.5 tw:h-px tw:w-6 tw:bg-white/10"></div>

        <button
            type="button"
            class="tw:flex tw:h-8 tw:w-8 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-icon tw:transition-colors tw:hover:bg-danger/20 tw:hover:text-danger tw:disabled:opacity-35 tw:disabled:hover:bg-transparent"
            :disabled="!canDelete"
            title="Delete the selected shape (Del)"
            aria-label="Delete selected"
            @click="emit('delete-selected')"
        >
            <Trash2 class="tw:h-4 tw:w-4" />
        </button>
    </div>
</template>
