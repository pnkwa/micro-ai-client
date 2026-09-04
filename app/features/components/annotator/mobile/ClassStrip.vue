<script setup lang="ts">
import { Plus } from '@lucide/vue'
import type { AnnotationClass } from '~/core/helpers/annotationClasses'

/**
 * The class picker as a horizontally scrolling bottom strip.
 *
 * No number keycaps here: there is no keyboard, and a key hint on a surface that cannot receive one
 * is noise. Picking is the tap itself, which is why every chip is 44px tall.
 */
defineProps<{
    classes: AnnotationClass[]
    active: number | null
    /**
     * A fixed vocabulary: the list cannot be added to, so the "+" is hidden. Used by an annotation
     * assignment whose `label_set` the instructor authored (mirrors ClassPicker's `fixed`).
     */
    fixed?: boolean
}>()

const emit = defineEmits<{ pick: [labelId: number]; create: [] }>()
</script>

<template>
    <div
        class="tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:gap-1.5 tw:overflow-x-auto tw:border-t tw:border-an-border tw:bg-an-panel tw:px-2"
    >
        <button
            v-for="klass in classes"
            :key="klass.id"
            type="button"
            class="tw:flex tw:h-11 tw:shrink-0 tw:items-center tw:gap-2 tw:rounded-xl tw:px-3 tw:transition-colors"
            :class="klass.id === active ? '' : 'tw:bg-an-n-100'"
            :style="
                klass.id === active
                    ? {
                          background: `${klass.color}1A`,
                          boxShadow: `inset 0 0 0 1.5px ${klass.color}`,
                      }
                    : undefined
            "
            @click="emit('pick', klass.id)"
        >
            <span
                class="tw:h-3 tw:w-3 tw:shrink-0 tw:rounded-[4px]"
                :style="{ background: klass.color }"
            ></span>
            <span class="tw:text-[13px] tw:font-medium tw:whitespace-nowrap tw:text-an-text">
                {{ klass.label }}
            </span>
        </button>

        <button
            v-if="!fixed"
            type="button"
            class="tw:flex tw:h-11 tw:w-11 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-xl tw:border tw:border-dashed tw:border-an-n-200 tw:text-an-faint"
            aria-label="New class"
            @click="emit('create')"
        >
            <Plus class="tw:h-5 tw:w-5" />
        </button>

        <p
            v-if="!classes.length"
            class="tw:px-2 tw:text-[12px] tw:whitespace-nowrap tw:text-an-faint"
        >
            No classes yet. Add one to start labelling.
        </p>
    </div>
</template>
