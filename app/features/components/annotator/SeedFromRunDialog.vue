<script setup lang="ts">
import { Wand2 } from '@lucide/vue'
import { useDetectionModels } from '~/core/composables/detectionModels'

/**
 * Run a model over this image and seed its boxes in as editable annotations.
 *
 * It RUNS rather than offering the runs that already exist, and that is cheaper than it sounds:
 * re-running the same image under the same model pair reuses the stored result and skips the worker
 * entirely (BE-ADR-024). So "pick a model and go" reaches a colleague's earlier pass anyway, and it
 * spares someone reading a list of runs to work out which one they wanted.
 *
 * Seeding is where the value is (BE-ADR-030): correcting the model's own boxes says WHERE it was
 * wrong, which a fresh label never does.
 */
/**
 * CONTENT ONLY - the page owns the dialog, as CreateClass.vue does.
 *
 * NOT on vee-validate, deliberately, and this is the one place in the feature where that is the
 * right call. The two selects are owned by `useDetectionModels`, the existing composable the
 * detection page shares, and bound through `McDetectionModelPicker`'s own `primary`/`segment`
 * models. Putting them behind vee-validate would mean either rewriting that shared component or
 * keeping two sources of truth for one choice - and there is nothing to validate: the Run button is
 * disabled until a model is picked, and the manifest is the only thing that decides which are
 * valid (FE-ADR-007).
 */
defineProps<{
    /** Seeding refuses to merge into an existing set, so this is said before the click. */
    hasAnnotations: boolean
    running?: boolean
}>()

const emit = defineEmits<{
    close: []
    seed: [payload: { model: string; segmentModel?: string | null }]
}>()

const {
    selectedModel,
    selectedSegmentModel,
    primaryModelOptions,
    segmentModelOptions,
    selectedModelSpec,
    selectedSegmentSpec,
    canChain,
    segmentModelToSend,
    load,
} = useDetectionModels()

// Loaded on mount rather than watched on an `open` prop: this component only exists while the
// dialog is open, so mounting IS opening.
onMounted(() => {
    if (!primaryModelOptions.value.length) void load()
})

const run = () => {
    if (!selectedModel.value) return
    emit('seed', { model: selectedModel.value, segmentModel: segmentModelToSend.value })
}
</script>

<template>
    <McDialogHeader>
        <McDialogTitle>Seed from a model run</McDialogTitle>
        <McDialogDescription>
            Runs the model over this image and copies its boxes in as editable annotations. If it
            has been run before with the same models, the stored result comes straight back.
        </McDialogDescription>
    </McDialogHeader>

    <!-- The server refuses to merge two sets rather than combining them silently, so this
         is stated before the click rather than surfaced as a 409 after it. -->
    <p
        v-if="hasAnnotations"
        class="tw:rounded-md tw:bg-warning/10 tw:px-3 tw:py-2 tw:text-xs tw:text-navy-80"
    >
        This image already has annotations. Seeding is refused until they are cleared, so delete
        them first if you want to start from the model's output.
    </p>

    <div class="tw:py-1">
        <McDetectionModelPicker
            v-model:primary="selectedModel"
            v-model:segment="selectedSegmentModel"
            :primary-options="primaryModelOptions"
            :segment-options="segmentModelOptions"
            :primary-spec="selectedModelSpec"
            :segment-spec="selectedSegmentSpec"
            :can-chain="canChain"
            :disabled="running || hasAnnotations"
        />
    </div>

    <McDialogFooter>
        <McButton variant="outline" :disabled="running" @click="emit('close')">Cancel</McButton>
        <McButton :disabled="!selectedModel || hasAnnotations" :loading="running" @click="run">
            <Wand2 class="tw:h-4 tw:w-4" />
            Run and seed
        </McButton>
    </McDialogFooter>
</template>
