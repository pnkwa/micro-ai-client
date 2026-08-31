<script setup lang="ts">
import type { ComboboxTriggerProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { ChevronDownIcon } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { ComboboxTrigger, useForwardProps } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<ComboboxTriggerProps & { class?: HTMLAttributes['class'] }>()

const forwarded = useForwardProps(reactiveOmit(props, 'class'))
</script>

<template>
    <ComboboxTrigger
        data-slot="combobox-trigger"
        v-bind="forwarded"
        :class="
            cn(
                'tw:border-input tw:flex tw:h-9 tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:border tw:px-3 tw:py-2 tw:text-sm tw:shadow-xs tw:transition-[color,box-shadow] tw:outline-none tw:cursor-pointer',
                'tw:focus-visible:border-ring tw:focus-visible:ring-ring/50 tw:focus-visible:ring-3',
                'tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed tw:disabled:opacity-50',
                props.class,
            )
        "
    >
        <slot />
        <ChevronDownIcon class="tw:size-4 tw:shrink-0 tw:opacity-50" aria-hidden="true" />
    </ComboboxTrigger>
</template>
