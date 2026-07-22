import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { DetectionBox } from '~/services/detectionService'

export interface DetectionStepLike {
    id: number
    step: string
    boxes: DetectionBox[]
}

export interface DetectionFilters {
    steps: ComputedRef<DetectionStepLike[]>
    minConfidence: Ref<number>
    hiddenSteps: Ref<Set<number>>
    toggleStep: (id: number) => void
    /** Boxes actually drawn: visible steps, above the threshold. */
    visibleBoxes: ComputedRef<DetectionBox[]>
    /** Step-toggle-aware but NOT confidence-filtered, so "N / M shown" has a stable M. */
    shownableBoxCount: ComputedRef<number>
    totalBoxCount: ComputedRef<number>
}

/**
 * Shared by McAnnotatedImage (which draws) and McDetectionFilters (which controls), so
 * the two can sit in different parts of a page's layout (the controls live in a
 * right-hand panel while the overlay is in the main column) without either page having
 * to own and thread the state itself.
 *
 * Provided per McDetectionFilterScope instance, which is what gives a page rendering
 * several overlays (the grading page, one per image answer) independent filters for each
 * without keeping a keyed record of them.
 */
export const detectionFiltersKey: InjectionKey<DetectionFilters> = Symbol('detectionFilters')

export function createDetectionFilters(getSteps: () => DetectionStepLike[]): DetectionFilters {
    const steps = computed(getSteps)
    const minConfidence = ref(0)
    // All layers start visible: a detect+segment chain (ML-ADR-003) draws from two steps
    // with different label vocabularies, and the toggle is what makes that legible as two
    // layers instead of one undifferentiated pile of boxes.
    const hiddenSteps = ref(new Set<number>())

    const toggleStep = (id: number) => {
        const next = new Set(hiddenSteps.value)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        hiddenSteps.value = next
    }

    // A new detection is a new set of boxes, so a threshold or a hidden layer carried over
    // from the previous one would silently hide results the user just asked for.
    watch(steps, () => {
        minConfidence.value = 0
        hiddenSteps.value = new Set()
    })

    const visibleBoxes = computed(() =>
        steps.value
            .filter((s) => !hiddenSteps.value.has(s.id))
            .flatMap((s) => s.boxes)
            .filter((b) => b.confidence >= minConfidence.value),
    )

    const shownableBoxCount = computed(() =>
        steps.value
            .filter((s) => !hiddenSteps.value.has(s.id))
            .reduce((n, s) => n + s.boxes.length, 0),
    )

    const totalBoxCount = computed(() => steps.value.reduce((n, s) => n + s.boxes.length, 0))

    return {
        steps,
        minConfidence,
        hiddenSteps,
        toggleStep,
        visibleBoxes,
        shownableBoxCount,
        totalBoxCount,
    }
}

export function useDetectionFilters(): DetectionFilters {
    const filters = inject(detectionFiltersKey, null)
    if (!filters) {
        throw new Error(
            'useDetectionFilters() needs a <McDetectionFilterScope> ancestor. It is what ' +
                'lets the overlay and its controls live in different parts of the layout.',
        )
    }
    return filters
}
