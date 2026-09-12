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

/**
 * The student annotator fills a `#worksheet` slot: ONE bottom sheet (Task / Label / Answer) instead
 * of the image annotator's separate zoom strip and tool / class / action bars. Detected by slot
 * presence rather than a prop, so the two callers stay decoupled — when this is filled, the compact
 * layout swaps to header / filmstrip / canvas / sheet and drops the bars, which stay for the
 * instructor annotator that fills them.
 */
const slots = useSlots()
const hasWorksheet = computed(() => Boolean(slots.worksheet))

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
    // The pager strip, the zoom strip and the bottom bars are rows of the grid rather than overlays,
    // so the canvas is sized around them and the picture never sits underneath a bar it cannot be
    // moved out from under. Row order: header, pager, canvas, zoom, tools, classes, actions. The
    // trailing `auto` rows collapse to nothing when their slot is empty (the image annotator fills no
    // `bottom-actions`; the assignment routes put their action / verdict bar there).
    // The student sheet is one `auto` row (its own 212px peek, lifted over the canvas by its own
    // negative margin); the image annotator keeps the four trailing `auto` rows for its zoom strip
    // and tool / class / action bars.
    if (stacked.value)
        return hasWorksheet.value
            ? '48px auto minmax(0, 1fr) auto'
            : '48px auto minmax(0, 1fr) auto auto auto auto'
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
    <!-- `touch-action: pan-x pan-y` blocks the browser's pinch- and double-tap zoom of the PAGE
         across every annotator surface (this shell is what all of them use), while leaving
         single-finger scrolling of the queue and panels intact. The canvas sets its own
         `touch-action: none` and does the image's zoom itself, so this is only about the stray
         gesture that used to zoom the whole page. Reliable where the viewport meta is not. -->
    <div
        class="tw:grid tw:h-dvh tw:overflow-hidden tw:[touch-action:pan-x_pan-y]"
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

        <!-- The pager strip, only on a stacked phone: its own row above the canvas so the filmstrip
             is beside the picture rather than floating over its top edge. On wider layouts the pager
             floats (there is the height to spare, and the picture is not full-bleed to the top). -->
        <div v-if="stacked && !focus" style="grid-column: 1 / -1">
            <slot name="pager" />
        </div>

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
        <!-- `touch-action` here too, not only on the shell: iOS Safari honours it on the touched
             element far more reliably than on an ancestor, and the floating tool/zoom overlays live
             in this cell OUTSIDE the canvas (which sets its own `touch-action: none`). -->
        <main
            class="tw:relative tw:min-h-0 tw:min-w-0 tw:overflow-hidden tw:bg-an-canvas tw:[touch-action:pan-x_pan-y]"
        >
            <slot name="canvas" />
        </main>

        <!-- The zoom strip, only on a stacked phone with the image annotator's docked controls: its
             own row below the canvas. The student sheet layout drops it (pinch, double-tap and the
             tappable readout on the canvas cover zoom), so it is gated off when a worksheet is used. -->
        <div v-if="stacked && !focus && !hasWorksheet" style="grid-column: 1 / -1">
            <slot name="zoom" />
        </div>

        <!-- The student's one bottom sheet: Task / Label / Answer. Its own row, but the sheet lifts
             16px over the canvas via its own negative margin, so the picture fades into it rather
             than stopping at a hard line. Replaces the zoom strip and the three bottom bars below. -->
        <div v-if="stacked && !focus && hasWorksheet" style="grid-column: 1 / -1">
            <slot name="worksheet" />
        </div>

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
            class="tw:flex tw:min-h-0 tw:flex-col tw:overflow-hidden tw:border-l tw:border-an-border tw:[touch-action:pan-x_pan-y]"
            :class="rightOpen ? 'tw:bg-an-panel' : 'tw:bg-an-chrome'"
        >
            <slot v-if="rightOpen" name="labels" />
            <slot v-else name="labels-rail" />
        </aside>

        <!-- Bottom bars, only in the stacked layouts that use them (the image annotator). Grid rows,
             so the canvas is sized around them rather than hidden beneath them. The student sheet
             carries the tool / class / action rows inside itself, so these are off when it is used. -->
        <template v-if="stacked && !focus && !hasWorksheet">
            <div style="grid-column: 1 / -1"><slot name="bottom-tools" /></div>
            <div style="grid-column: 1 / -1"><slot name="bottom-classes" /></div>
            <!-- The action / verdict bar: the student's Mark done + Skip (with a labels summary) and
                 the instructor's Approve / Flag / Incorrect. The row is empty (and collapses) on the
                 image annotator. -->
            <div style="grid-column: 1 / -1"><slot name="bottom-actions" /></div>
        </template>

        <!-- The queue and the shape list, as surfaces you summon. -->
        <slot name="sheets" />
    </div>
</template>
