<script setup lang="ts">
import { Plus, Save } from '@lucide/vue'
import type { AnnotationClass } from '~/core/helpers/annotationClasses'
import type { Shape } from '~/core/helpers/annotationShapes'
import { colorForShape } from '~/core/helpers/annotationClasses'

/**
 * Everything the two side panels were doing, as dark overlays over the canvas.
 *
 * Focus mode is not the same screen with less in it: the light chrome is gone and what survives is
 * the two things you reach for while drawing - which class, and what have I drawn. Both float on
 * the canvas's own ground so the picture keeps the full width.
 */
const props = defineProps<{
    name: string
    unsavedEdits: number
    canSave: boolean
    saving: boolean
    classes: AnnotationClass[]
    activeClass: string | null
    shapes: Shape[]
    classLabels: string[]
    selectedShapeId: string | null
    /** Shape id to model confidence, for the ones seeded and not yet judged. */
    seeded: Record<string, number>
}>()

/**
 * The one fact per row that is worth 40px of a floating card.
 *
 * A seeded shape shows what the model thought, because that is the number you are about to agree or
 * disagree with. Anything else shows its point count, which is the only way to tell two shapes of
 * the same class apart in a list with no thumbnails.
 */
const metaFor = (shape: Shape): string => {
    const confidence = props.seeded[shape.id]
    if (confidence !== undefined) return confidence.toFixed(2)
    return shape.polygon ? `${shape.polygon.length} pts` : 'rect'
}

const emit = defineEmits<{
    save: []
    'pick-class': [label: string]
    'select-shape': [id: string]
    'new-class': []
}>()
</script>

<template>
    <!-- Where you are and what is at stake, as plain text: a bar for two facts would be chrome. -->
    <div class="tw:absolute tw:top-3.5 tw:left-4 tw:z-10 tw:flex tw:items-center tw:gap-2.5">
        <span class="tw:font-mono tw:text-[12px] tw:text-an-d-rail-icon">{{ name }}</span>
        <template v-if="unsavedEdits > 0">
            <span class="tw:h-1.5 tw:w-1.5 tw:rounded-full tw:bg-an-warn"></span>
            <span class="tw:text-[11.5px] tw:text-an-d-disabled">{{ unsavedEdits }} unsaved</span>
        </template>
    </div>

    <div class="tw:absolute tw:top-3 tw:right-4 tw:z-10 tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-[11.5px] tw:text-an-d-disabled">Focus mode</span>
        <kbd
            class="tw:rounded tw:border tw:border-white/15 tw:bg-white/10 tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none tw:text-an-d-text"
        >
            F
        </kbd>
        <McButton size="sm" :disabled="!canSave" :loading="saving" @click="emit('save')">
            <Save class="tw:h-3.5 tw:w-3.5" />
            Save
            <kbd
                class="tw:ml-1 tw:rounded tw:bg-white/20 tw:px-1 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none"
            >
                S
            </kbd>
        </McButton>
    </div>

    <!-- The class palette. Bottom-centre, because picking a class is the gesture that precedes
         every shape, and the number keys beside each name are the faster route to the same thing. -->
    <div
        class="tw:absolute tw:bottom-4 tw:left-1/2 tw:z-10 tw:flex tw:-translate-x-1/2 tw:items-center tw:gap-1 tw:rounded-xl tw:border tw:border-white/[0.09] tw:bg-an-overlay/95 tw:p-1.5 tw:shadow-lg tw:backdrop-blur"
    >
        <button
            v-for="klass in classes.slice(0, 9)"
            :key="klass.label"
            type="button"
            class="tw:flex tw:h-8 tw:items-center tw:gap-[7px] tw:rounded-lg tw:px-2.5 tw:transition-colors"
            :class="klass.label === activeClass ? '' : 'tw:hover:bg-white/8'"
            :style="klass.label === activeClass ? { background: `${klass.color}33` } : undefined"
            @click="emit('pick-class', klass.label)"
        >
            <span
                class="tw:h-[9px] tw:w-[9px] tw:shrink-0 tw:rounded-[3px]"
                :style="{ background: klass.color }"
            ></span>
            <span
                class="tw:text-[12px] tw:font-medium"
                :class="klass.label === activeClass ? 'tw:text-white' : 'tw:text-an-d-soft'"
            >
                {{ klass.label }}
            </span>
            <kbd
                class="tw:rounded tw:border tw:border-white/15 tw:bg-white/10 tw:px-1 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none tw:text-an-d-rail-icon"
            >
                {{ klass.index + 1 }}
            </kbd>
        </button>

        <div class="tw:mx-1 tw:h-5 tw:w-px tw:bg-white/10"></div>
        <button
            type="button"
            class="tw:flex tw:h-8 tw:w-8 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-rail-icon tw:hover:bg-white/10 tw:hover:text-white"
            aria-label="New class"
            title="New class"
            @click="emit('new-class')"
        >
            <Plus class="tw:h-4 tw:w-4" />
        </button>
    </div>

    <!-- What is on the picture. Bottom-right, out of the way of the palette and the dock. -->
    <div
        v-if="shapes.length"
        class="tw:absolute tw:right-4 tw:bottom-4 tw:z-10 tw:flex tw:max-h-[45%] tw:w-52 tw:flex-col tw:gap-0.5 tw:rounded-xl tw:border tw:border-white/[0.09] tw:bg-an-overlay/[0.92] tw:p-1.5 tw:backdrop-blur"
    >
        <div class="tw:flex tw:items-center tw:px-1.5 tw:pt-0.5 tw:pb-1.5">
            <span
                class="tw:text-[11px] tw:font-semibold tw:tracking-wide tw:text-an-d-rail-icon tw:uppercase"
            >
                Shapes
            </span>
            <div class="tw:flex-1"></div>
            <span class="tw:font-mono tw:text-[10.5px] tw:text-an-d-disabled">
                {{ shapes.length }}
            </span>
        </div>

        <div class="tw:min-h-0 tw:overflow-y-auto">
            <button
                v-for="shape in shapes"
                :key="shape.id"
                type="button"
                class="tw:flex tw:h-7 tw:w-full tw:items-center tw:gap-2 tw:rounded-[7px] tw:px-1.5 tw:text-left"
                :class="shape.id === selectedShapeId ? 'tw:bg-white/6' : 'tw:hover:bg-white/8'"
                @click="emit('select-shape', shape.id)"
            >
                <span
                    class="tw:h-[15px] tw:w-[3px] tw:shrink-0 tw:rounded-[2px]"
                    :style="{ background: colorForShape(classLabels, shape) ?? '#D97706' }"
                ></span>
                <span class="tw:truncate tw:text-[11.5px] tw:text-an-d-strong">
                    {{ shape.label || 'Unlabelled' }}
                </span>
                <div class="tw:flex-1"></div>
                <span class="tw:shrink-0 tw:font-mono tw:text-[10px] tw:text-an-d-disabled">
                    {{ metaFor(shape) }}
                </span>
            </button>
        </div>
    </div>
</template>
