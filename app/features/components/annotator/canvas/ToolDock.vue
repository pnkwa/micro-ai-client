<script setup lang="ts">
import { MousePointer2, Pentagon, Redo2, Square, Trash2, Undo2 } from '@lucide/vue'
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
    /**
     * Sit at the vertical middle instead of the top-left corner.
     *
     * Focus mode puts the filename in that corner, and the dock landing on top of it is what the
     * top-left looked like before this existed. The artboard centres it there for the same reason.
     */
    centered?: boolean
}>()

const emit = defineEmits<{
    'update:tool': [tool: Tool]
    undo: []
    redo: []
    'delete-selected': []
}>()

const tools = [
    { id: 'select', label: 'Select and pan', key: 'V', icon: MousePointer2 },
    { id: 'rectangle', label: 'Rectangle', key: 'R', icon: Square },
    { id: 'polygon', label: 'Polygon', key: 'P', icon: Pentagon },
] as const
</script>

<template>
    <div
        class="tw:absolute tw:z-10 tw:flex tw:w-11 tw:flex-col tw:items-center tw:gap-1 tw:rounded-xl tw:border tw:border-white/[0.09] tw:bg-an-overlay/95 tw:p-1.5 tw:backdrop-blur"
        :class="centered ? 'tw:top-1/2 tw:left-4 tw:-translate-y-1/2' : 'tw:top-3 tw:left-3'"
    >
        <!-- Each tool wraps a hover tooltip - a light pill with the name and its keycap, sitting to
             the right of the dock, the way the mockup shows it. A group-hover pill rather than
             McTooltip so the dark dock needs no TooltipProvider around it. -->
        <div v-for="option in tools" :key="option.id" class="tw:group tw:relative">
            <button
                type="button"
                class="tw:flex tw:h-8 tw:w-8 tw:items-center tw:justify-center tw:rounded-lg tw:transition-colors"
                :class="
                    tool === option.id
                        ? 'tw:bg-an-accent tw:text-white'
                        : 'tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white'
                "
                :aria-label="option.label"
                :aria-pressed="tool === option.id"
                @click="emit('update:tool', option.id as Tool)"
            >
                <component :is="option.icon" class="tw:h-4 tw:w-4" />
            </button>
            <span
                class="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-[calc(100%+8px)] tw:z-20 tw:flex tw:-translate-y-1/2 tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-an-border tw:bg-an-panel tw:px-2 tw:py-1 tw:whitespace-nowrap tw:opacity-0 tw:shadow-md tw:transition-opacity tw:group-hover:opacity-100"
            >
                <span class="tw:text-[11.5px] tw:font-medium tw:text-an-text">
                    {{ option.label }}
                </span>
                <kbd
                    class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-1 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none tw:text-an-muted"
                >
                    {{ option.key }}
                </kbd>
            </span>
        </div>

        <div class="tw:my-0.5 tw:h-px tw:w-6 tw:bg-white/10"></div>

        <div class="tw:group tw:relative">
            <button
                type="button"
                class="tw:flex tw:h-8 tw:w-8 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-icon tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-35 tw:disabled:hover:bg-transparent"
                :disabled="!canUndo"
                aria-label="Undo"
                @click="emit('undo')"
            >
                <Undo2 class="tw:h-4 tw:w-4" />
            </button>
            <span
                class="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-[calc(100%+8px)] tw:z-20 tw:flex tw:-translate-y-1/2 tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-an-border tw:bg-an-panel tw:px-2 tw:py-1 tw:whitespace-nowrap tw:opacity-0 tw:shadow-md tw:transition-opacity tw:group-hover:opacity-100"
            >
                <span class="tw:text-[11.5px] tw:font-medium tw:text-an-text">Undo</span>
                <kbd
                    class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-1 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none tw:text-an-muted"
                >
                    Z
                </kbd>
            </span>
        </div>
        <div class="tw:group tw:relative">
            <button
                type="button"
                class="tw:flex tw:h-8 tw:w-8 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-icon tw:transition-colors tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-35 tw:disabled:hover:bg-transparent"
                :disabled="!canRedo"
                aria-label="Redo"
                @click="emit('redo')"
            >
                <Redo2 class="tw:h-4 tw:w-4" />
            </button>
            <span
                class="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-[calc(100%+8px)] tw:z-20 tw:flex tw:-translate-y-1/2 tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-an-border tw:bg-an-panel tw:px-2 tw:py-1 tw:whitespace-nowrap tw:opacity-0 tw:shadow-md tw:transition-opacity tw:group-hover:opacity-100"
            >
                <span class="tw:text-[11.5px] tw:font-medium tw:text-an-text">Redo</span>
                <kbd
                    class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-1 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none tw:text-an-muted"
                >
                    Y
                </kbd>
            </span>
        </div>

        <div class="tw:my-0.5 tw:h-px tw:w-6 tw:bg-white/10"></div>

        <div class="tw:group tw:relative">
            <button
                type="button"
                class="tw:flex tw:h-8 tw:w-8 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-icon tw:transition-colors tw:hover:bg-danger/20 tw:hover:text-danger tw:disabled:opacity-35 tw:disabled:hover:bg-transparent"
                :disabled="!canDelete"
                aria-label="Delete selected"
                @click="emit('delete-selected')"
            >
                <Trash2 class="tw:h-4 tw:w-4" />
            </button>
            <span
                class="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-[calc(100%+8px)] tw:z-20 tw:flex tw:-translate-y-1/2 tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-an-border tw:bg-an-panel tw:px-2 tw:py-1 tw:whitespace-nowrap tw:opacity-0 tw:shadow-md tw:transition-opacity tw:group-hover:opacity-100"
            >
                <span class="tw:text-[11.5px] tw:font-medium tw:text-an-text">Delete</span>
                <kbd
                    class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-1 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none tw:text-an-muted"
                >
                    Del
                </kbd>
            </span>
        </div>
    </div>
</template>
