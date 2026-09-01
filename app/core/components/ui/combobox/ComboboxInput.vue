<script setup lang="ts">
import type { ComboboxInputEmits, ComboboxInputProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { SearchIcon } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { ComboboxInput, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/core/lib/utils'

// The wrapper is a div, so attrs (placeholder, aria-label) have to be aimed at the input inside
// it or they land on the border and do nothing.
defineOptions({
    inheritAttrs: false,
})

const props = defineProps<ComboboxInputProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<ComboboxInputEmits>()

const forwarded = useForwardPropsEmits(reactiveOmit(props, 'class'), emits)
</script>

<template>
    <div
        data-slot="combobox-input-wrapper"
        class="tw:flex tw:h-9 tw:items-center tw:gap-2 tw:border-b tw:px-3"
    >
        <SearchIcon class="tw:size-4 tw:shrink-0 tw:opacity-50" aria-hidden="true" />
        <ComboboxInput
            data-slot="combobox-input"
            v-bind="{ ...forwarded, ...$attrs }"
            :class="
                cn(
                    'tw:placeholder:text-muted-foreground tw:flex tw:h-9 tw:w-full tw:bg-transparent tw:text-sm tw:outline-hidden tw:disabled:cursor-not-allowed tw:disabled:opacity-50',
                    props.class,
                )
            "
        />
    </div>
</template>
