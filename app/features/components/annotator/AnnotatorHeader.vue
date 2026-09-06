<script setup lang="ts">
import { HelpCircle, Images, Menu, PanelLeft, Save } from '@lucide/vue'

/**
 * The annotator's own 48px toolbar - the page brings its own and the app bar is hidden under it.
 *
 * Teleporting these controls into the app bar was tried and reverted: that bar is
 * `justify-between` with teleport targets only at its two ends, so the count badge that belongs
 * beside the breadcrumb landed over by Save. A page that needs a toolbar of its own is better off
 * owning one, and hiding the bar it would otherwise duplicate.
 *
 * It leads with the APP sidebar toggle - the one the app bar carries on every other page. This
 * route hides that bar (it brings its own toolbar), so the control has to be reproduced here or the
 * app nav becomes uncollapsible while the annotator is open. It uses the sidebar's own `PanelLeft`,
 * because it IS the app sidebar's control; the queue's collapse is a different icon on the queue's
 * own header, so the two never read as the same button.
 *
 * Focus mode (F) is the separate gesture that clears both annotator panels.
 */
defineProps<{
    /** This page's name, the crumb shown after "Image Library /" (e.g. "Image Annotator"). */
    pageLabel: string
    count: number
    unsavedEdits: number
    canSave: boolean
    saving: boolean
    /**
     * Show the queue-open button. True only in the medium layout, where the queue is a drawer with
     * no docked column of its own: in full it is docked (opened from its own rail) and on the
     * stacked layouts the compact header carries the control instead, so this button would double it.
     */
    showQueueToggle?: boolean
}>()

/**
 * Save after every change, off by default.
 *
 * Beside Save rather than in a menu, because it changes what that button means: with it on, the
 * button is a "now" rather than the only way work reaches the server. Off by default because the
 * write is REPLACE-ALL - an auto-save part way through redrawing a region persists the half of it
 * that exists at that moment, which is not what someone mid-edit has asked for.
 */
const autoSave = defineModel<boolean>('autoSave', { required: true })

const emit = defineEmits<{
    save: []
    shortcuts: []
    'toggle-nav': []
    'open-queue': []
}>()
</script>

<template>
    <!-- The app sidebar's own toggle, reproduced because this route hides the bar that normally
         carries it. It stays on EVERY layout: on the desktop it collapses the docked sidebar (its
         own `PanelLeft`); below Full it is the only way off this page (it opens the app-nav sheet),
         and there it is a HAMBURGER - the ordinary "menu" affordance on a phone or tablet, and
         distinct from the image queue's icon beside it. -->
    <McButton
        variant="ghost"
        size="icon-sm"
        :aria-label="showQueueToggle ? 'Open the navigation menu' : 'Toggle the navigation sidebar'"
        :title="showQueueToggle ? 'Open the navigation menu' : 'Toggle the navigation sidebar'"
        @click="emit('toggle-nav')"
    >
        <Menu v-if="showQueueToggle" class="tw:h-4 tw:w-4" />
        <PanelLeft v-else class="tw:h-4 tw:w-4" />
    </McButton>

    <!-- In the medium layout the queue is a drawer, not a docked column, so it needs a way open from
         the toolbar. An IMAGES icon, not a panel one, so it reads as the image picker rather than a
         second sidebar next to the navigation menu. -->
    <McButton
        v-if="showQueueToggle"
        variant="ghost"
        size="icon-sm"
        aria-label="Show the image queue"
        title="Show the image queue"
        @click="emit('open-queue')"
    >
        <Images class="tw:h-4 tw:w-4" />
    </McButton>

    <!--
        The same breadcrumb the app bar renders everywhere else - McBreadcrumb, a RouterLink root
        and a chevron separator - rather than a hand-rolled nav with a slash. This route hides the
        app bar (it brings its own toolbar), so it has to reproduce the breadcrumb rather than
        inherit it, and reproducing means using the same components, not lookalike markup.
    -->
    <McBreadcrumb class="tw:min-w-0">
        <McBreadcrumbList class="tw:flex-nowrap">
            <McBreadcrumbItem class="tw:shrink-0">
                <McBreadcrumbLink as-child>
                    <RouterLink to="/image-library">Image Library</RouterLink>
                </McBreadcrumbLink>
            </McBreadcrumbItem>
            <McBreadcrumbSeparator />
            <McBreadcrumbItem class="tw:min-w-0">
                <McBreadcrumbPage class="tw:truncate tw:font-medium">
                    {{ pageLabel }}
                </McBreadcrumbPage>
            </McBreadcrumbItem>
        </McBreadcrumbList>
    </McBreadcrumb>
    <span
        class="tw:rounded-[5px] tw:border tw:border-an-n-150 tw:bg-an-n-50 tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-faint"
    >
        {{ count }} images
    </span>

    <div class="tw:flex-1"></div>

    <!-- Page-local actions (e.g. the library annotator's import/export/seed menu). Empty on pages
         that pass nothing, so the student annotator's header is unchanged. -->
    <slot name="actions" />

    <span
        v-if="unsavedEdits > 0"
        class="tw:flex tw:items-center tw:gap-1.5 tw:text-[12px] tw:text-an-muted"
    >
        <span class="tw:h-1.5 tw:w-1.5 tw:rounded-full tw:bg-an-warn"></span>
        {{ unsavedEdits }}
        unsaved edit{{ unsavedEdits === 1 ? '' : 's' }}
    </span>

    <label
        class="tw:flex tw:shrink-0 tw:cursor-pointer tw:items-center tw:gap-1.5 tw:text-[12px] tw:text-an-muted tw:select-none"
        title="Save automatically a moment after each change"
    >
        <input v-model="autoSave" type="checkbox" class="tw:h-3.5 tw:w-3.5 tw:accent-an-accent" />
        Auto-save
    </label>

    <McButton size="sm" :disabled="!canSave" :loading="saving" class="tw:m-2" @click="emit('save')">
        <Save class="tw:h-4 tw:w-4" />
        Save
        <!-- No keycap below Full: `showQueueToggle` marks the medium (touch) layout, where there is
             no physical keyboard to press S. -->
        <kbd
            v-if="!showQueueToggle"
            class="tw:ml-1 tw:rounded tw:bg-white/20 tw:px-1 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none"
        >
            S
        </kbd>
    </McButton>

    <McButton
        variant="ghost"
        size="icon-sm"
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        @click="emit('shortcuts')"
    >
        <HelpCircle class="tw:h-4 tw:w-4" />
    </McButton>
</template>
