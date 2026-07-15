<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/core/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
    <optgroup
        data-slot="native-select-optgroup"
        :class="cn('tw:bg-popover tw:text-popover-foreground', props.class)"
    >
        <slot />
    </optgroup>
</template>
