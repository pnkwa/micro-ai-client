import { toast } from 'vue-sonner'
import { detectionService, type ModelSpec } from '~/services/detectionService'
import { modelLabel } from '~/core/helpers/modelLabel'

/**
 * The model catalogue and what is picked from it (FE-ADR-007: never hardcode a model name).
 *
 * Split in two because chaining (ML-ADR-003) combines two independently-choosable models, not one:
 * a classify/detect model that runs first, and a segment model optionally chained behind it. The
 * segment choice is wired through for real (DetectionsService.buildJob's segmentModel override)
 * rather than just mirroring the server's automatic default.
 *
 * Lifted out of `/image-detection` because it is the page's most self-contained piece: a list, two
 * selections and the options derived from them, with no knowledge of stages, cameras or results.
 */

/** Multipart has no null, so "skip segmentation" travels as a sentinel and is mapped at the edge. */
export const NONE_SEGMENT = '__none__'

export function useDetectionModels() {
    const models = ref<ModelSpec[]>([])
    const selectedModel = ref('')
    const selectedSegmentModel = ref('')

    const primaryModelOptions = computed(() =>
        models.value
            .filter((m) => m.task === 'classify' || m.task === 'detect')
            .map((m) => ({ value: m.name, label: modelLabel(m.displayName) })),
    )

    const segmentModelOptions = computed(() => [
        { value: NONE_SEGMENT, label: 'None (skip segmentation)' },
        ...models.value
            .filter((m) => m.task === 'segment')
            .map((m) => ({ value: m.name, label: modelLabel(m.displayName) })),
    ])

    const selectedModelSpec = computed(() =>
        models.value.find((m) => m.name === selectedModel.value),
    )
    const selectedSegmentSpec = computed(() =>
        models.value.find((m) => m.name === selectedSegmentModel.value),
    )

    // Only a detector chains anything; the classifier and the segmenter itself run alone regardless
    // of what is picked in the second dropdown (DetectionsService.buildJob).
    const canChain = computed(() => selectedModelSpec.value?.task === 'detect')

    /** The model actually sent for the segment pass: the sentinel becomes the server's own null. */
    const segmentModelToSend = computed(() =>
        !canChain.value
            ? undefined
            : selectedSegmentModel.value === NONE_SEGMENT
              ? null
              : selectedSegmentModel.value,
    )

    /**
     * Loads the manifest and picks the defaults.
     *
     * A failure is a toast and an empty list, not a throw: the page still renders, and the run
     * button is disabled by the empty selection rather than by a special case.
     */
    const load = async () => {
        try {
            models.value = await detectionService.listModels()
            selectedModel.value =
                models.value.find((m) => m.name === 'best__rtdetr_v2')?.name ??
                models.value[0]?.name ??
                ''
            selectedSegmentModel.value =
                models.value.find((m) => m.task === 'segment')?.name ?? NONE_SEGMENT
        } catch {
            toast.error('Failed to load models')
        }
    }

    return {
        models,
        selectedModel,
        selectedSegmentModel,
        primaryModelOptions,
        segmentModelOptions,
        selectedModelSpec,
        selectedSegmentSpec,
        canChain,
        segmentModelToSend,
        load,
    }
}
