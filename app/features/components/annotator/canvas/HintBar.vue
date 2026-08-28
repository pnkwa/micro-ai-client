<script setup lang="ts">
import type { Tool } from './AnnotationCanvas.vue'

/**
 * The contextual hint, bottom-left. What the current tool does, in one line.
 *
 * It changes with the tool rather than listing everything, because a static legend of every gesture
 * is read once and then becomes furniture. This is the only place several of these gestures are
 * discoverable at all - right-click to drop a polygon point, Alt-drag, 1-9 to reclass.
 */
const props = defineProps<{ tool: Tool; selectedCount: number; drafting: boolean }>()

/**
 * The hint as alternating prose and KEYCAPS, rather than one string.
 *
 * A key named in running text reads as a word - "press enter" - and the same key in a box reads as
 * a thing to press. The parts are modelled so the boxes are real rather than punctuation that
 * happens to look like them.
 */
type Part = { text: string } | { key: string }

const parts = computed<Part[]>(() => {
    if (props.drafting || props.tool === 'polygon') {
        return [
            { text: 'Click to add points ·' },
            { key: 'Enter' },
            { text: 'closes ·' },
            { key: 'Esc' },
            { text: 'cancels' },
        ]
    }
    switch (props.tool) {
        case 'rectangle':
            return [{ text: 'Drag to draw a box' }]
        case 'delete':
            return [{ text: 'Click a shape to remove it, or a polygon point to remove that point' }]
        default:
            return props.selectedCount
                ? [
                      { text: `${props.selectedCount} shape selected ·` },
                      { key: '1-9' },
                      { text: 'reclass ·' },
                      { key: 'Del' },
                      { text: 'removes' },
                  ]
                : [{ text: 'Drag to pan · click a shape to select it, or an edge to add a point' }]
    }
})
</script>

<template>
    <div
        class="tw:pointer-events-none tw:absolute tw:bottom-3 tw:left-3 tw:z-10 tw:flex tw:max-w-[52%] tw:items-center tw:gap-1.5 tw:rounded-[10px] tw:border tw:border-white/[0.09] tw:bg-an-overlay/95 tw:backdrop-blur tw:px-2.5 tw:py-1.5 tw:text-[11.5px] tw:text-an-d-text"
    >
        <!-- A live dot: the bar changes with the tool, and the dot is what says it is reacting to
             you rather than sitting there as a legend. -->
        <span class="tw:h-1.5 tw:w-1.5 tw:shrink-0 tw:rounded-full tw:bg-an-accent"></span>
        <template v-for="(part, index) in parts" :key="index">
            <kbd
                v-if="'key' in part"
                class="tw:rounded tw:border tw:border-white/15 tw:bg-white/10 tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none tw:text-white"
            >
                {{ part.key }}
            </kbd>
            <span v-else class="tw:whitespace-nowrap">{{ part.text }}</span>
        </template>
    </div>
</template>
