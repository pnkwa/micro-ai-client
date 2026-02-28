<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/core/lib/utils'

const props = defineProps<{
    class?: HTMLAttributes['class']
}>()
</script>

<template>
    <ul
        data-slot="sidebar-menu"
        data-sidebar="menu"
        :class="cn('tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:gap-2', props.class)"
    >
        <slot />
    </ul>
</template>
