<script setup lang="ts">
import type { ComboboxContentEmits, ComboboxContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ComboboxContent, ComboboxPortal, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/core/lib/utils'

defineOptions({
    inheritAttrs: false,
})

const props = withDefaults(
    defineProps<ComboboxContentProps & { class?: HTMLAttributes['class'] }>(),
    {
        position: 'popper',
        // Matches the width of the anchor, the way the Select's content does, so the list never
        // reads as a floating panel unrelated to the control that opened it.
        sideOffset: 4,
    },
)
const emits = defineEmits<ComboboxContentEmits>()

const forwarded = useForwardPropsEmits(reactiveOmit(props, 'class'), emits)
</script>

<template>
    <ComboboxPortal>
        <ComboboxContent
            data-slot="combobox-list"
            v-bind="{ ...forwarded, ...$attrs }"
            :class="
                cn(
                    'tw:bg-popover tw:text-popover-foreground tw:data-[state=open]:animate-in tw:data-[state=closed]:animate-out tw:data-[state=closed]:fade-out-0 tw:data-[state=open]:fade-in-0 tw:data-[state=closed]:zoom-out-95 tw:data-[state=open]:zoom-in-95 tw:relative tw:z-50 tw:max-h-72 tw:w-(--reka-combobox-trigger-width) tw:overflow-hidden tw:rounded-md tw:border tw:shadow-md',
                    props.class,
                )
            "
        >
            <slot />
        </ComboboxContent>
    </ComboboxPortal>
</template>
