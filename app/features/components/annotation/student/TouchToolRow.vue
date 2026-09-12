<script setup lang="ts">
/**
 * The student's touch tool row — the top half of the Label tab body.
 *
 * SEVEN equal-flex targets: select, rectangle, polygon, pencil | undo, redo, delete. The same
 * drawing set as the instructor `BottomTools` minus its erase MODE, which is the one that does not
 * fit: eight targets inside the sheet's px-3 body fall below the 44px floor on a 390px phone, and
 * delete-selected plus picking a different class chip cover what erase and reclass did.
 *
 * Both ring tools behave exactly as they do on /image-annotator, because the gesture logic lives in
 * the shared `AnnotationCanvas` and is driven by nothing but the `tool` prop: the polygon lays a
 * straight edge per drag (or a point per tap) and closes by hand, the pencil traces a freehand
 * outline that is smoothed and thinned into a polygon on release. The pencil is the drawing route
 * an Apple Pencil can use, since iPadOS reports a stylus as an ordinary touch and a continuous drag
 * is the one gesture a mouse, a finger and a stylus all make identically.
 *
 * Its own component rather than a reshaped `BottomTools` because that bar is shared with the
 * instructor annotator, whose touch set keeps the erase mode.
 */
import { MousePointer2, PenTool, Pentagon, Redo2, Square, Trash2, Undo2 } from '@lucide/vue'
import type { Tool } from '~/features/components/annotator/canvas/AnnotationCanvas.vue'

defineProps<{ tool: Tool; canUndo: boolean; canRedo: boolean; canDelete: boolean }>()

const emit = defineEmits<{
    'update:tool': [tool: Tool]
    undo: []
    redo: []
    'delete-selected': []
}>()

// Only the drawing modes are tools; undo/redo/delete are actions, so they sit past a divider.
const tools = [
    { id: 'select', label: 'Select', icon: MousePointer2 },
    { id: 'rectangle', label: 'Rectangle', icon: Square },
    // Tap a corner at a time, or drag one straight edge at a time, then close the ring by hand.
    { id: 'polygon', label: 'Polygon', icon: Pentagon },
    // One drag, traced freehand, thinned into a polygon on release.
    { id: 'pencil', label: 'Pencil (trace an outline)', icon: PenTool },
] as const

// SQUARE targets spread across the row, not equal-flex cells. Stretched cells made each button
// ~49x44 on a phone, so the armed tool's fill read as a wide slab behind a square icon; at 44x44 it
// reads as the icon's own key. `shrink` is left on (no `shrink-0`), so on a very narrow phone the
// row still gives way rather than overflowing the sheet.
const btn =
    'tw:flex tw:size-11 tw:min-w-0 tw:items-center tw:justify-center tw:rounded-[10px] tw:transition-colors'
</script>

<template>
    <div class="tw:flex tw:h-11 tw:items-center tw:justify-between tw:[touch-action:pan-x_pan-y]">
        <button
            v-for="option in tools"
            :key="option.id"
            type="button"
            :class="[
                btn,
                tool === option.id ? 'tw:bg-an-accent tw:text-white' : 'tw:text-an-n-600',
            ]"
            :aria-label="option.label"
            :aria-pressed="tool === option.id"
            @click="emit('update:tool', option.id as Tool)"
        >
            <component :is="option.icon" class="tw:size-[19px]" />
        </button>

        <span class="tw:h-[22px] tw:w-px tw:shrink-0 tw:bg-an-divider" />

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
