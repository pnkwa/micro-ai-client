<script setup lang="ts">
import { ChevronDown, HelpCircle, PanelLeft, Save, Sparkles } from '@lucide/vue'

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
    /** The queue's scope, shown after "Image Library /". Not a stored batch. */
    scopeLabel: string
    count: number
    unsavedEdits: number
    canSave: boolean
    saving: boolean
    canSeed: boolean
    /** The last model seeded from, in mono, or null before anything has been. */
    lastRun: string | null
}>()

const emit = defineEmits<{
    seed: []
    save: []
    shortcuts: []
    'toggle-nav': []
}>()
</script>

<template>
    <!-- The app sidebar's own toggle, reproduced because this route hides the bar that normally
         carries it. -->
    <McButton
        variant="ghost"
        size="icon-sm"
        aria-label="Toggle the navigation sidebar"
        title="Toggle the navigation sidebar"
        @click="emit('toggle-nav')"
    >
        <PanelLeft class="tw:h-4 tw:w-4" />
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
                    {{ scopeLabel }}
                </McBreadcrumbPage>
            </McBreadcrumbItem>
        </McBreadcrumbList>
    </McBreadcrumb>
    <!-- Mono pill with a hairline border, "N images" - the mockup's, not a bare number. -->
    <span
        class="tw:rounded-[5px] tw:border tw:border-an-n-150 tw:bg-an-n-50 tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-faint"
    >
        {{ count }} images
    </span>

    <div class="tw:flex-1"></div>

    <McButton
        variant="outline"
        size="sm"
        :disabled="!canSeed"
        title="Run a model over this image and seed its boxes"
        @click="emit('seed')"
    >
        <Sparkles class="tw:h-4 tw:w-4" />
        Seed from run
        <span
            v-if="lastRun"
            class="tw:ml-1 tw:max-w-28 tw:truncate tw:font-mono tw:text-[11px] tw:text-an-faint"
        >
            {{ lastRun }}
        </span>
        <ChevronDown class="tw:h-3.5 tw:w-3.5 tw:text-an-faint" />
    </McButton>

    <div class="tw:mx-1 tw:h-5 tw:w-px tw:bg-an-divider"></div>

    <!-- A count, not a boolean. "2 unsaved edits" says how much would be lost; a dot says only
         that something would be. -->
    <span
        v-if="unsavedEdits > 0"
        class="tw:flex tw:items-center tw:gap-1.5 tw:text-[12px] tw:text-an-muted"
    >
        <span class="tw:h-1.5 tw:w-1.5 tw:rounded-full tw:bg-an-warn"></span>
        <span class="tw:font-mono tw:tabular-nums">{{ unsavedEdits }}</span>
        unsaved edit{{ unsavedEdits === 1 ? '' : 's' }}
    </span>

    <McButton size="sm" :disabled="!canSave" :loading="saving" @click="emit('save')">
        <Save class="tw:h-4 tw:w-4" />
        Save
        <kbd
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
