<script setup lang="ts">
import type { SelectLabelProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { SelectLabel } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<SelectLabelProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
    <SelectLabel
        data-slot="select-label"
        :class="cn('tw:px-2 tw:py-1.5 tw:text-base tw:font-medium', props.class)"
    >
        <slot />
    </SelectLabel>
</template>
