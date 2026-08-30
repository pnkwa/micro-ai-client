<script setup lang="ts">
/**
 * The annotator's three-column shell: queue, canvas, labels.
 *
 * LAYOUT ONLY, composed through slots rather than props. The page owns every piece of state, and
 * routing it through here would have meant a dozen pass-through props whose only job was to arrive
 * somewhere else - and a shell that has to change whenever a column gains a field is not a shell.
 *
 * NO HEADER ROW. The annotator's own controls are teleported into the app bar directly above this
 * (see AnnotatorHeader), because two bars stacked cost 48px of canvas and said overlapping things.
 *
 * Fixed height with no page scroll: each column scrolls itself. That is what keeps the canvas a
 * fixed viewport, which the pan/zoom arithmetic depends on - a canvas that grows with its content
 * has no "fit" to compute.
 *
 * A collapsed panel becomes a 52px rail rather than disappearing, so the way back is always on
 * screen. Focus mode collapses both at once; the header's toggle collapses the queue alone.
 */
import { useAnnotatorLayout } from '~/core/composables/useAnnotatorLayout'

const leftOpen = defineModel<boolean>('leftOpen', { required: true })
const rightOpen = defineModel<boolean>('rightOpen', { required: true })

const { layout, stacked } = useAnnotatorLayout()

const RAIL = '52px'
const QUEUE = '280px'
const LABELS = '320px'

/**
 * Focus mode is a DIFFERENT LAYOUT, not two collapsed panels.
 *
 * The toolbar goes, the light panels go, and what remains is the dark canvas with a thumbnail rail
 * and floating overlays. Collapsing the panels to light rails and keeping the bar - which is what
 * this did before - gives back some width and still reads as the same screen with less in it.
 */
const focus = computed(() => !leftOpen.value && !rightOpen.value)

const rows = computed(() => {
    if (focus.value) return 'minmax(0, 1fr)'
    // The bottom bars are rows of the grid rather than overlays, so the canvas is sized around them
    // and the picture never sits underneath a bar it cannot be moved out from under.
    if (stacked.value) return '48px minmax(0, 1fr) auto auto'
    return '48px minmax(0, 1fr)'
})

const columns = computed(() => {
    // One pane: the canvas is the whole width, and everything else is a bar or a summoned surface.
    if (stacked.value) return 'minmax(0, 1fr)'
    // Focus mode is a rail, the picture, and a rail. BOTH panels collapse rather than the labels
    // side vanishing: what those panels were doing floats over the canvas, but the way back to each
    // of them has to stay on screen, and a mode you cannot see the exit from is a trap.
    if (focus.value) return `${RAIL} minmax(0, 1fr) ${RAIL}`
    // Medium landscape docks the labels and turns the queue into a drawer, so the queue column is
    // not in the grid at all.
    if (layout.value === 'medium') {
        return `minmax(0, 1fr) ${rightOpen.value ? LABELS : RAIL}`
    }
    return `${leftOpen.value ? QUEUE : RAIL} minmax(0, 1fr) ${rightOpen.value ? LABELS : RAIL}`
})
</script>

<template>
    <!--
        The whole viewport: the app's bar is hidden on this route, so this owns the height outright.
        `dvh` rather than `vh` because on a phone `vh` is the LARGE viewport - the height you get
        once the browser chrome has scrolled away - which is always taller than what is on screen.
    -->
    <div
        class="tw:grid tw:h-dvh tw:overflow-hidden"
        :class="focus ? 'tw:bg-an-canvas' : 'tw:bg-an-chrome'"
        :style="{ gridTemplateColumns: columns, gridTemplateRows: rows }"
    >
        <!--
            The annotator's own toolbar. The app's bar is hidden under this route, so there is one
            bar rather than two saying overlapping things. Gone entirely in focus mode: that layout
            has no chrome bar at all, only floating overlays.
        -->
        <header
            v-if="!focus"
            class="tw:flex tw:min-w-0 tw:items-center tw:gap-2 tw:border-b tw:border-an-border tw:bg-an-panel tw:px-2"
            :style="{ gridColumn: `1 / -1` }"
        >
            <slot :name="stacked ? 'header-compact' : 'header'" />
        </header>

        <aside
            v-if="!stacked && layout !== 'medium'"
            class="tw:flex tw:min-h-0 tw:flex-col tw:overflow-hidden"
            :class="
                focus
                    ? ''
                    : leftOpen
                      ? 'tw:border-r tw:border-an-border tw:bg-an-panel'
                      : 'tw:border-r tw:border-an-border tw:bg-an-chrome'
            "
        >
            <slot v-if="focus" name="focus-rail" />
            <slot v-else-if="leftOpen" name="queue" />
            <slot v-else name="queue-rail" />
        </aside>

        <aside v-else-if="focus" class="tw:flex tw:min-h-0 tw:flex-col tw:overflow-hidden">
            <slot name="focus-rail" />
        </aside>

        <!-- No padding and no border: the canvas is the picture, and a frame around it is width
             taken from the thing this rebuild exists to make bigger. -->
        <main class="tw:relative tw:min-h-0 tw:min-w-0 tw:overflow-hidden tw:bg-an-canvas">
            <slot name="canvas" />
        </main>

        <!-- Focus mode's right rail. Dark like the canvas, not a collapsed light panel: in focus
             mode the chrome is gone, and a pale strip down the edge would be the one piece of the
             old screen still shouting. -->
        <aside
            v-if="focus && !stacked"
            class="tw:flex tw:min-h-0 tw:flex-col tw:overflow-hidden tw:border-l tw:border-white/5 tw:bg-an-rail"
        >
            <slot name="focus-rail-right" />
        </aside>

        <aside
            v-else-if="!stacked"
            class="tw:flex tw:min-h-0 tw:flex-col tw:overflow-hidden tw:border-l tw:border-an-border"
            :class="rightOpen ? 'tw:bg-an-panel' : 'tw:bg-an-chrome'"
        >
            <slot v-if="rightOpen" name="labels" />
            <slot v-else name="labels-rail" />
        </aside>

        <!-- Bottom bars, only in the stacked layouts. Grid rows, so the canvas is sized around
             them rather than hidden beneath them. -->
        <template v-if="stacked && !focus">
            <div style="grid-column: 1 / -1"><slot name="bottom-tools" /></div>
            <div style="grid-column: 1 / -1"><slot name="bottom-classes" /></div>
        </template>

        <!-- The queue and the shape list, as surfaces you summon. -->
        <slot name="sheets" />
    </div>
</template>
