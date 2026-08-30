<script setup lang="ts">
import { Shapes } from '@lucide/vue'
import type { DetectionWithSubmitter } from '~/services/detectionService'
import { modelLabel } from '~/core/helpers/modelLabel'
import { formatDay } from '~/core/helpers/dateFormat'

/**
 * Every model run over this image, newest first.
 *
 * A run is not an annotation: nothing here is on the picture until someone seeds it and passes over
 * each box. `Seed annotator` therefore leaves for the annotator rather than writing anything from
 * the library, because accepting or rejecting the model's guesses is the whole point of BE-ADR-030
 * and it needs the canvas.
 *
 * The box count is summed across STEPS, since a detector chains a segmenter behind it (ML-ADR-003)
 * and each step carries its own boxes.
 */
defineProps<{ runs: DetectionWithSubmitter[]; loading?: boolean }>()

const emit = defineEmits<{ seed: [runId: number] }>()

const boxCount = (run: DetectionWithSubmitter) =>
    run.steps.reduce((total, step) => total + step.boxes.length, 0)
</script>

<template>
    <div class="tw:flex tw:flex-col tw:gap-1.5">
        <McSkeleton v-if="loading && !runs.length" class="tw:h-11 tw:w-full tw:rounded-[7px]" />

        <div
            v-for="run in runs"
            :key="run.id"
            class="tw:flex tw:items-center tw:gap-2.5 tw:rounded-[7px] tw:border tw:border-an-divider tw:bg-an-n-50 tw:p-2"
        >
            <span
                class="tw:flex tw:h-5 tw:min-w-5 tw:items-center tw:justify-center tw:gap-1 tw:rounded-[5px] tw:bg-an-warn-tint tw:px-1.5 tw:font-mono tw:text-[11px] tw:font-medium tw:text-an-warn tw:tabular-nums"
            >
                <Shapes class="tw:h-3 tw:w-3" />
                {{ boxCount(run) }}
            </span>
            <span class="tw:min-w-0 tw:flex-1">
                <span class="tw:block tw:truncate tw:text-[12px] tw:font-medium tw:text-an-text">
                    {{ modelLabel(run.model) }}
                </span>
                <span class="tw:block tw:font-mono tw:text-[10.5px] tw:text-an-n-400">
                    {{ formatDay(run.created_at) }}
                </span>
            </span>
            <McButton
                size="sm"
                variant="outline"
                class="tw:h-6.5 tw:text-[11.5px]"
                @click="emit('seed', run.id)"
            >
                Seed annotator
            </McButton>
        </div>
    </div>
</template>
