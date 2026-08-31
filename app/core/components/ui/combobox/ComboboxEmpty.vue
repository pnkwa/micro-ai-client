<script setup lang="ts">
import type { ComboboxEmptyProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ComboboxEmpty, useForwardProps } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<ComboboxEmptyProps & { class?: HTMLAttributes['class'] }>()

const forwarded = useForwardProps(reactiveOmit(props, 'class'))
</script>

<template>
    <ComboboxEmpty
        data-slot="combobox-empty"
        v-bind="forwarded"
        :class="cn('tw:text-muted-foreground tw:py-4 tw:text-center tw:text-sm', props.class)"
    >
        <slot />
    </ComboboxEmpty>
</template>
