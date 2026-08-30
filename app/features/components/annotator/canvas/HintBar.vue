<script setup lang="ts">
import type { Tool } from './AnnotationCanvas.vue'

/*
 * THE WIDTH CAP IS ABOUT THE ZOOM PILL, not about taste.
 *
 * Both sit on the bottom edge of the canvas: this one pinned left, the pill centred. At the old 52%
 * cap they ALWAYS collided, at any canvas width - this bar reaches 0.52W while the pill starts at
 * (W - 220) / 2, and 0.52W is past that for every W. It only looked fine on a wide canvas because
 * the text happened to be short enough never to reach the cap.
 *
 * `calc(50% - 132px)` stops short of the pill's half-width plus a gap, so the two cannot meet at
 * any size and the text truncates instead of sliding underneath. If the pill grows a control, this
 * number grows with it.
 */
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
    if (props.drafting) {
        return [
            { text: 'Click to add points ·' },
            { key: 'Enter' },
            { text: 'closes ·' },
            { key: 'Esc' },
            { text: 'cancels' },
        ]
    }
    // Armed but not yet drawing. The edge gesture is only reachable in this moment - once a ring is
    // open every click places a point - so this is the only place it can be said.
    if (props.tool === 'polygon') {
        return [{ text: 'Click to start a polygon, or click an edge to add a point to it' }]
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
                : [
                      { text: 'Drag or scroll to pan ·' },
                      { key: 'Ctrl' },
                      {
                          text: 'scroll zooms · click a shape to select it, or an edge to add a point',
                      },
                  ]
    }
})
</script>

<template>
    <div
        class="tw:pointer-events-none tw:absolute tw:bottom-3 tw:left-3 tw:z-10 tw:flex tw:max-w-[calc(50%-132px)] tw:items-center tw:gap-1.5 tw:overflow-hidden tw:rounded-[10px] tw:border tw:border-white/[0.09] tw:bg-an-overlay/95 tw:px-2.5 tw:py-1.5 tw:text-[11.5px] tw:text-an-d-text tw:backdrop-blur"
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
            <span v-else class="tw:truncate tw:whitespace-nowrap">{{ part.text }}</span>
        </template>
    </div>
</template>
