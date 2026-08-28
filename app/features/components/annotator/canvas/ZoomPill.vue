<script setup lang="ts">
import { Eye, EyeOff, Maximize2, ZoomIn, ZoomOut } from '@lucide/vue'

/**
 * The zoom controls, bottom-centre.
 *
 * The readout says `Fit 13%` while the zoom equals fit and plain `140%` once it does not, which is
 * the fix for the complaint that started this rebuild: fit for a 4000px camera photo in a 700px
 * column genuinely IS 13%, and a bare "13%" reads as a bug rather than as the whole picture.
 * Clicking it returns to fit.
 */
defineProps<{ percent: number; atFit: boolean; enabled: boolean; allHidden: boolean }>()

const emit = defineEmits<{
    'zoom-in': []
    'zoom-out': []
    fit: []
    'toggle-visibility': []
}>()
</script>

<template>
    <div
        class="tw:absolute tw:bottom-3 tw:left-1/2 tw:z-10 tw:flex tw:-translate-x-1/2 tw:items-center tw:gap-0.5 tw:rounded-xl tw:border tw:border-white/[0.09] tw:bg-an-overlay/95 tw:backdrop-blur tw:p-1"
    >
        <button
            type="button"
            class="tw:flex tw:h-7 tw:w-7 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-30"
            :disabled="!enabled"
            title="Zoom out"
            aria-label="Zoom out"
            @click="emit('zoom-out')"
        >
            <ZoomOut class="tw:h-3.5 tw:w-3.5" />
        </button>

        <button
            type="button"
            class="tw:min-w-[68px] tw:rounded-lg tw:px-2 tw:py-1 tw:font-mono tw:text-[11.5px] tw:tabular-nums tw:text-an-d-text tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-30"
            :disabled="!enabled"
            title="Fit to viewport (0)"
            @click="emit('fit')"
        >
            <span v-if="atFit" class="tw:text-an-d-rail-icon">Fit</span>
            {{ percent }}%
        </button>

        <button
            type="button"
            class="tw:flex tw:h-7 tw:w-7 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-30"
            :disabled="!enabled"
            title="Zoom in"
            aria-label="Zoom in"
            @click="emit('zoom-in')"
        >
            <ZoomIn class="tw:h-3.5 tw:w-3.5" />
        </button>

        <div class="tw:mx-1 tw:h-4 tw:w-px tw:bg-white/10"></div>

        <button
            type="button"
            class="tw:flex tw:h-7 tw:w-7 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-30"
            :disabled="!enabled"
            title="Fit to viewport (0)"
            aria-label="Fit to viewport"
            @click="emit('fit')"
        >
            <Maximize2 class="tw:h-3.5 tw:w-3.5" />
        </button>
        <button
            type="button"
            class="tw:flex tw:h-7 tw:w-7 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-30"
            :disabled="!enabled"
            :title="allHidden ? 'Show all shapes (H)' : 'Hide all shapes (H)'"
            :aria-label="allHidden ? 'Show all shapes' : 'Hide all shapes'"
            @click="emit('toggle-visibility')"
        >
            <EyeOff v-if="allHidden" class="tw:h-3.5 tw:w-3.5" />
            <Eye v-else class="tw:h-3.5 tw:w-3.5" />
        </button>
    </div>
</template>
