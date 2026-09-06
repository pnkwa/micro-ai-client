<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Menu, PanelLeft } from '@lucide/vue'
import { cn } from '@/core/lib/utils'
import { Button } from '@/core/components/ui/button'
import { useSidebar } from './utils'

const props = defineProps<{
    class?: HTMLAttributes['class']
}>()

// Below 1280 the sidebar opens as a Sheet, so the trigger is a hamburger - the ordinary "menu"
// affordance on a phone or tablet. On the desktop it collapses the docked rail, where `PanelLeft`
// (a panel with a spine) reads as exactly that.
const { toggleSidebar, isMobile } = useSidebar()
</script>

<template>
    <Button
        data-sidebar="trigger"
        data-slot="sidebar-trigger"
        variant="ghost"
        size="icon"
        :class="cn('tw:h-7 tw:w-7', props.class)"
        @click="toggleSidebar"
    >
        <Menu v-if="isMobile" />
        <PanelLeft v-else />
        <span class="tw:sr-only">Toggle Sidebar</span>
    </Button>
</template>
