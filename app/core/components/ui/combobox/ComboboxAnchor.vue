<script setup lang="ts">
import type { ComboboxAnchorProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ComboboxAnchor, useForwardProps } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<ComboboxAnchorProps & { class?: HTMLAttributes['class'] }>()

const forwarded = useForwardProps(reactiveOmit(props, 'class'))
</script>

<template>
    <ComboboxAnchor
        data-slot="combobox-anchor"
        v-bind="forwarded"
        :class="cn('tw:w-full', props.class)"
    >
        <slot />
    </ComboboxAnchor>
</template>
