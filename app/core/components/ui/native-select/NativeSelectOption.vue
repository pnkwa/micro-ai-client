<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/core/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
    <option
        data-slot="native-select-option"
        :class="cn('tw:bg-popover tw:text-popover-foreground', props.class)"
    >
        <slot />
    </option>
</template>
