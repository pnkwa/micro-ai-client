<script setup lang="ts">
/**
 * The library's three columns: albums, grid, inspector.
 *
 * LAYOUT ONLY, composed through slots rather than props, the same posture `AnnotatorShell` takes and
 * for the same reason: the page owns every piece of state, and routing it through here would mean a
 * dozen pass-through props whose only job is to arrive somewhere else.
 *
 * NOTHING SCROLLS BUT THE COLUMNS. The root is a fixed height with `overflow: hidden` and every
 * column is `min-h-0`, so the album list and the grid scroll inside themselves and the page never
 * grows a second scrollbar. That is what keeps the toolbar and the header on screen while someone
 * works down two hundred tiles.
 *
 * THE INSPECTOR DOCKS, it does not cover. A takeover panel is why the old detail sheet could not be
 * left open: you lost the grid, so you closed it, so you never arrowed through a batch with it up.
 * Docked it shrinks the grid instead, and the columns reflow.
 */
const props = defineProps<{
    /** Whether the right column is rendered at all. The page decides, from its selection. */
    inspectorOpen?: boolean
    /**
     * Whether the album column is a COLUMN at all.
     *
     * Only at Full. Below that the albums live in a drawer over the grid, so the track collapses to
     * nothing and the page renders the sheet instead: a tablet cannot afford 240px of chrome beside
     * the thing it came to look at.
     */
    dockedAlbums?: boolean
}>()

const ALBUMS = '240px'
const INSPECTOR = '400px'

/**
 * THE INSPECTOR TRACK IS ALWAYS THERE, at 0px when the panel is closed.
 *
 * That is what makes the open smooth. `grid-template-columns` only interpolates between templates
 * with the SAME NUMBER OF TRACKS, so adding a fourth column on open is a jump no transition can
 * soften; keeping three and animating one from 0 to 400 is a slide. The column carries
 * `overflow: hidden`, so the panel is clipped as it narrows rather than squashed.
 */
const columns = computed(() =>
    [
        props.dockedAlbums ? ALBUMS : '0px',
        'minmax(0, 1fr)',
        props.inspectorOpen ? INSPECTOR : '0px',
    ].join(' '),
)
</script>

<template>
    <div
        class="tw:grid tw:h-full tw:min-h-0 tw:overflow-hidden tw:bg-an-chrome tw:transition-[grid-template-columns] tw:duration-200 tw:ease-out"
        :style="{ gridTemplateColumns: columns }"
    >
        <aside
            class="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:overflow-hidden tw:bg-an-panel"
            :class="dockedAlbums ? 'tw:border-r tw:border-an-border' : ''"
        >
            <slot v-if="dockedAlbums" name="albums" />
        </aside>

        <main class="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col">
            <slot />
        </main>

        <!--
            Rendered even when closed, so the track can animate. `min-w-0` plus the clip is what
            keeps the 400px of content from forcing the column open at 0.
        -->
        <aside
            class="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:overflow-hidden tw:bg-an-panel"
            :class="inspectorOpen ? 'tw:border-l tw:border-an-border' : ''"
        >
            <div class="tw:flex tw:h-full tw:w-[400px] tw:min-h-0 tw:flex-col">
                <slot name="inspector" />
            </div>
        </aside>
    </div>
</template>
