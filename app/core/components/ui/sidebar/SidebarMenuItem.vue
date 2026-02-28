<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/core/lib/utils'

const props = defineProps<{
    class?: HTMLAttributes['class']
}>()
</script>

<template>
    <li
        data-slot="sidebar-menu-item"
        data-sidebar="menu-item"
        :class="cn('tw:group/menu-item tw:relative tw:group-data-[collapsible=icon]:flex tw:group-data-[collapsible=icon]:justify-center', props.class)"
    >
        <slot />
    </li>
</template>
