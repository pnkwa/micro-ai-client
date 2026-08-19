<script setup lang="ts">
import type { ModelSpec } from '~/services/detectionService'
import type { HistoryRecord } from '~/core/helpers/detectionHistory'

/**
 * Everything `/image-detection` renders OVER itself: the model sheet, and past runs as a bottom
 * sheet on a phone or a modal on a desktop.
 *
 * Split out because it is the page's most detachable third - three surfaces that share no state
 * with the stage below them beyond what arrives as props - and because a page carrying its scanner,
 * its results and its dialogs in one file is a file nobody wants to be the second person to edit.
 *
 * The model pickers here are the SAME choice the page's own column offers, not a copy of it: both
 * write the two v-models, so changing the model in the sheet changes it everywhere.
 */
const modelSettingsOpen = defineModel<boolean>('modelSettingsOpen', { required: true })
const historyOpen = defineModel<boolean>('historyOpen', { required: true })
const primary = defineModel<string>('primaryModel', { required: true })
const segment = defineModel<string>('segmentModel', { required: true })

defineProps<{
    /** Phone or desktop - decides sheet versus modal, and the picker's shape. */
    compact: boolean
    /** The record open in the viewer, so the list can mark it. */
    activeRecordId: number | null
    primaryOptions: { value: string; label: string }[]
    segmentOptions: { value: string; label: string }[]
    primarySpec?: ModelSpec
    segmentSpec?: ModelSpec
    canChain: boolean
    /** A run is in flight: the model choice is settled until it finishes. */
    disabled: boolean
}>()

const emit = defineEmits<{
    select: [record: HistoryRecord]
    /**
     * Hands the mounted list up so the page can refresh it after a run.
     *
     * v-if/v-else means exactly ONE McDetectionHistory exists, so there is one ref to hand over and
     * its thumbnail fetches are never doubled.
     */
    historyReady: [instance: { refresh: () => void } | null]
}>()

const historyRef = useTemplateRef<{ refresh: () => void }>('historyRef')
watchEffect(() => emit('historyReady', historyRef.value))

/** Both overlays close on a pick: the record loads behind them, so staying open hides it. */
const pick = (record: HistoryRecord) => {
    historyOpen.value = false
    emit('select', record)
}
</script>

<template>
    <div>
        <!--
        Phone only, and full screen: it still rises from the bottom, but it takes the whole
        viewport rather than a slice of it.

        h-dvh overrides the bottom variant's own h-auto through tailwind-merge, and rounded-none
        drops the sheet's top corners - a panel covering the screen with rounded shoulders reads
        as a card that overflowed rather than as a screen.
    -->
        <McSheet v-model:open="modelSettingsOpen">
            <McSheetContent
                side="bottom"
                class="mc-slide-up tw:h-dvh tw:overflow-y-auto tw:rounded-none tw:lg:hidden"
            >
                <McSheetHeader>
                    <McSheetTitle>Model</McSheetTitle>
                    <McSheetDescription>
                        Which models run when you tap Start detection.
                    </McSheetDescription>
                </McSheetHeader>

                <div class="tw:px-4 tw:pb-6">
                    <McDetectionModelPicker
                        v-model:primary="primary"
                        v-model:segment="segment"
                        :primary-options="primaryOptions"
                        :segment-options="segmentOptions"
                        :primary-spec="primarySpec"
                        :segment-spec="segmentSpec"
                        :can-chain="canChain"
                        :disabled="disabled"
                    />
                </div>
            </McSheetContent>
        </McSheet>

        <!--
        Past runs, in the idiom each pointer expects: a bottom sheet under a thumb, a centred
        modal under a mouse. A sheet on a desktop viewport anchors the list to the bottom edge,
        about 700px from the button at the top of the stage that opened it, and it is a phone
        convention borrowed for no reason - a mouse has no reach to accommodate.

        v-if/v-else, so exactly ONE McDetectionHistory is mounted and the single `history` ref
        and its thumbnail fetches are never doubled. Both close on a pick: the record loads
        behind them, so staying open would hide the thing the click asked for.
    -->
        <McSheet v-if="compact" v-model:open="historyOpen">
            <McSheetContent
                side="bottom"
                class="mc-slide-up tw:flex tw:h-dvh tw:flex-col tw:overflow-hidden tw:rounded-none"
            >
                <!-- Present for the dialog's accessible name, not shown: the panel below carries
                 its own "Recent analyses" heading, and rendering both put the same words on
                 screen twice with the sheet's copy adding nothing the list does not say. -->
                <McSheetHeader class="tw:sr-only">
                    <McSheetTitle>Recent analyses</McSheetTitle>
                    <McSheetDescription>
                        Past runs. Pick one to load it back into the viewer.
                    </McSheetDescription>
                </McSheetHeader>

                <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:px-4 tw:pt-4 tw:pb-6">
                    <McDetectionHistory
                        ref="historyRef"
                        :active-id="activeRecordId"
                        @select="pick"
                    />
                </div>
            </McSheetContent>
        </McSheet>

        <McDialog v-else v-model:open="historyOpen">
            <!--
            Full screen here too, not a centred box. This is a list of every run there has ever
            been, and a 672px dialog showed five of two hundred - the browsing is the task, so
            the surface should be the screen.

            Content rather than ScrollContent: ScrollContent scrolls the OVERLAY and lets the
            dialog grow, which is the opposite of what a fixed full-screen panel wants. The
            overrides beat DialogContent's own centred-box defaults through tailwind-merge -
            inset-0 with translate-none over the top/left 50% centring, rounded-none over
            rounded-lg, and BOTH max-w-none and sm:max-w-none - tailwind-merge treats a
            responsive variant as its own group, so the base one alone left sm:max-w-lg
            standing and the panel came out 512px wide.

            It rises rather than appearing, matching the phone's sheet - see `.mc-slide-up` in
            main.css. The components' own `animate-in` / `slide-in-from-bottom` utilities are
            inert in this project (no animation plugin, no keyframes), so the keyframes are
            defined there rather than relied on here.
        -->
            <McDialogContent
                class="mc-slide-up tw:inset-0 tw:top-0 tw:left-0 tw:h-dvh tw:w-screen tw:max-w-none tw:sm:max-w-none tw:translate-x-0 tw:translate-y-0 tw:flex tw:flex-col tw:overflow-hidden tw:rounded-none tw:border-0"
            >
                <McDialogHeader class="tw:sr-only">
                    <McDialogTitle>Recent analyses</McDialogTitle>
                    <McDialogDescription>
                        Past runs. Pick one to load it back into the viewer.
                    </McDialogDescription>
                </McDialogHeader>

                <McDetectionHistory
                    ref="historyRef"
                    class="tw:min-h-0 tw:flex-1"
                    :active-id="activeRecordId"
                    @select="pick"
                />
            </McDialogContent>
        </McDialog>
    </div>
</template>
