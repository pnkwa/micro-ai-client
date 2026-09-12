<script setup lang="ts">
/**
 * The class chips — the bottom half of the Label tab body.
 *
 * A horizontally scrolling row of the classes the assignment defines: colour square + name +
 * count-when-used. The picked chip is tinted in its OWN colour with a 1.5px ring, so which class
 * the next box takes is legible at a glance.
 *
 * NO "+ New class" chip, unlike the shared instructor `ClassStrip`: students pick from the fixed
 * vocabulary the instructor authored — class creation is instructor-only. Picking the active chip
 * again clears it (the page toggles `activeLabelId` to null), so a box can be left unlabelled.
 */
import type { AnnotationClass } from '~/core/helpers/annotationClasses'

defineProps<{
    classes: AnnotationClass[]
    /** The class new boxes take, highlighted. Null when nothing is armed. */
    active: number | null
}>()

const emit = defineEmits<{ pick: [id: number] }>()
</script>

<template>
    <!-- `pan-x` keeps the strip swipeable while the shell blocks page pinch/zoom. -->
    <div
        class="tw:flex tw:h-11 tw:items-center tw:gap-2 tw:overflow-x-auto tw:[touch-action:pan-x]"
    >
        <button
            v-for="klass in classes"
            :key="klass.id"
            type="button"
            class="tw:flex tw:h-11 tw:shrink-0 tw:items-center tw:gap-2 tw:rounded-[10px] tw:border tw:px-[13px] tw:text-[13.5px] tw:font-medium tw:transition-colors"
            :class="
                klass.id === active
                    ? 'tw:border-[1.5px] tw:text-an-text'
                    : 'tw:border-an-n-200 tw:bg-an-panel tw:text-an-n-700'
            "
            :style="
                klass.id === active
                    ? { borderColor: klass.color, background: `${klass.color}14` }
                    : undefined
            "
            :aria-pressed="klass.id === active"
            @click="emit('pick', klass.id)"
        >
            <span
                class="tw:size-[11px] tw:shrink-0 tw:rounded-[3px]"
                :style="{ background: klass.color }"
            />
            {{ klass.label }}
            <span
                v-if="klass.count > 0"
                class="tw:font-mono tw:text-[11.5px] tw:font-medium tw:text-an-muted"
            >
                {{ klass.count }}
            </span>
        </button>
    </div>
</template>
