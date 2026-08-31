<script setup lang="ts">
import type { ComboboxItemEmits, ComboboxItemProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { CheckIcon } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { ComboboxItem, ComboboxItemIndicator, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<ComboboxItemProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<ComboboxItemEmits>()

const forwarded = useForwardPropsEmits(reactiveOmit(props, 'class'), emits)
</script>

<template>
    <ComboboxItem
        data-slot="combobox-item"
        v-bind="forwarded"
        :class="
            cn(
                'tw:relative tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:justify-between tw:gap-2 tw:rounded-sm tw:py-1.5 tw:pr-2 tw:pl-2 tw:text-sm tw:outline-hidden tw:select-none',
                'tw:data-[highlighted]:bg-primary-hover-cursor tw:data-[state=checked]:text-primary-clicked',
                'tw:data-[disabled]:pointer-events-none tw:data-[disabled]:opacity-50',
                props.class,
            )
        "
    >
        <slot />
        <ComboboxItemIndicator>
            <CheckIcon class="tw:size-4 tw:shrink-0" aria-hidden="true" />
        </ComboboxItemIndicator>
    </ComboboxItem>
</template>
