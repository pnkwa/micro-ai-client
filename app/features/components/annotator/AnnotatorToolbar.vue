<script setup lang="ts">
import {
    Maximize2,
    MousePointer2,
    PanelRightClose,
    PanelRightOpen,
    Pentagon,
    Redo2,
    Save,
    Square,
    Trash2,
    Undo2,
    Wand2,
    ZoomIn,
    ZoomOut,
} from '@lucide/vue'

/**
 * The annotator's toolbar. SCAFFOLD: every control is present and disabled.
 *
 * Laid out now because the tool set is the part of phase 2 that decides the rest. Two tools
 * (rectangle and polygon) because those are the two geometries `image_annotations` stores: a plain
 * box, and an outline whose extent the server recomputes into the box columns on write.
 */
import type { Tool } from './AnnotatorCanvas.vue'

defineProps<{
    panelOpen: boolean
    zoomPercent: number
    canZoom: boolean
    canUndo: boolean
    canRedo: boolean
    canDelete: boolean
    canSave: boolean
}>()

const tool = defineModel<Tool>('tool', { required: true })

const emit = defineEmits<{
    'toggle-panel': []
    'zoom-in': []
    'zoom-out': []
    fit: []
    'actual-size': []
    undo: []
    redo: []
    'delete-selected': []
    save: []
}>()

// Data rather than markup, so the set is one list to extend.
const tools = [
    { id: 'select', label: 'Select and pan', icon: MousePointer2 },
    { id: 'rectangle', label: 'Rectangle', icon: Square },
    { id: 'polygon', label: 'Polygon', icon: Pentagon },
] as const
</script>

<template>
    <div
        class="tw:flex tw:shrink-0 tw:flex-wrap tw:items-center tw:gap-2 tw:border-b tw:border-navy-15 tw:bg-white tw:px-3 tw:py-2"
    >
        <div class="tw:flex tw:items-center tw:gap-1">
            <McButton
                v-for="option in tools"
                :key="option.id"
                :variant="tool === option.id ? 'default' : 'outline'"
                size="icon-sm"
                :aria-label="option.label"
                :aria-pressed="tool === option.id"
                :title="option.label"
                @click="tool = option.id"
            >
                <component :is="option.icon" class="tw:h-4 tw:w-4" />
            </McButton>
        </div>

        <McSeparator orientation="vertical" class="tw:h-6" />

        <div class="tw:flex tw:items-center tw:gap-1">
            <McButton
                variant="ghost"
                size="icon-sm"
                disabled
                aria-label="Undo"
                title="Undo (not implemented)"
            >
                <Undo2 class="tw:h-4 tw:w-4" />
            </McButton>
            <McButton
                variant="ghost"
                size="icon-sm"
                disabled
                aria-label="Redo"
                title="Redo (not implemented)"
            >
                <Redo2 class="tw:h-4 tw:w-4" />
            </McButton>
            <McButton
                variant="ghost"
                size="icon-sm"
                disabled
                aria-label="Delete selected"
                title="Delete selected (not implemented)"
            >
                <Trash2 class="tw:h-4 tw:w-4" />
            </McButton>
        </div>

        <McSeparator orientation="vertical" class="tw:h-6" />

        <!-- Zoom and pan ARE implemented; the drawing tools above are not. -->
        <div class="tw:flex tw:items-center tw:gap-1">
            <McButton
                variant="ghost"
                size="icon-sm"
                :disabled="!canZoom"
                aria-label="Zoom out"
                title="Zoom out"
                @click="emit('zoom-out')"
            >
                <ZoomOut class="tw:h-4 tw:w-4" />
            </McButton>
            <button
                type="button"
                class="tw:min-w-14 tw:rounded tw:px-1 tw:py-0.5 tw:font-mono tw:text-xs tw:text-navy-80 tw:hover:bg-navy-5 tw:disabled:opacity-50"
                :disabled="!canZoom"
                title="Reset to 100%"
                @click="emit('actual-size')"
            >
                {{ zoomPercent }}%
            </button>
            <McButton
                variant="ghost"
                size="icon-sm"
                :disabled="!canZoom"
                aria-label="Zoom in"
                title="Zoom in"
                @click="emit('zoom-in')"
            >
                <ZoomIn class="tw:h-4 tw:w-4" />
            </McButton>
            <McButton
                variant="ghost"
                size="icon-sm"
                :disabled="!canZoom"
                aria-label="Fit to window"
                title="Fit to window"
                @click="emit('fit')"
            >
                <Maximize2 class="tw:h-4 tw:w-4" />
            </McButton>
        </div>

        <McSeparator orientation="vertical" class="tw:h-6" />

        <!--
            Seeding is where the value is (BE-ADR-030): copying a run's own boxes in and CORRECTING
            them tells the research team where the model was wrong, which a fresh label never does.
            So it sits in the toolbar rather than buried in a menu.
        -->
        <McButton
            variant="outline"
            size="sm"
            disabled
            title="Seed from a model run (not implemented)"
        >
            <Wand2 class="tw:h-4 tw:w-4" />
            Seed from run
        </McButton>

        <div class="tw:ml-auto tw:flex tw:items-center tw:gap-2">
            <span
                class="tw:rounded tw:bg-navy-15 tw:px-1.5 tw:py-0.5 tw:text-[10px] tw:font-semibold tw:tracking-wide tw:text-navy-80 tw:uppercase"
                title="Save logs the payload to the console instead of sending it."
            >
                Not saved to server
            </span>
            <McButton
                size="sm"
                :disabled="!canSave"
                title="Log the payload that would be sent"
                @click="emit('save')"
            >
                <Save class="tw:h-4 tw:w-4" />
                Save
            </McButton>
            <McButton
                variant="ghost"
                size="icon-sm"
                :aria-label="panelOpen ? 'Hide panel' : 'Show panel'"
                @click="emit('toggle-panel')"
            >
                <PanelRightClose v-if="panelOpen" class="tw:h-4 tw:w-4" />
                <PanelRightOpen v-else class="tw:h-4 tw:w-4" />
            </McButton>
        </div>
    </div>
</template>
