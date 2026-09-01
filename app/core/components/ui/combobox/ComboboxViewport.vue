<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { ComboboxViewport } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
    <ComboboxViewport
        data-slot="combobox-viewport"
        :class="cn('tw:max-h-60 tw:overflow-y-auto tw:overflow-x-hidden tw:p-1', props.class)"
    >
        <slot />
    </ComboboxViewport>
</template>
