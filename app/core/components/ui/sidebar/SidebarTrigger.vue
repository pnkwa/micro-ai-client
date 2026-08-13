<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { PanelLeft } from '@lucide/vue'
import { cn } from '@/core/lib/utils'
import { Button } from '@/core/components/ui/button'
import { useSidebar } from './utils'

const props = defineProps<{
    class?: HTMLAttributes['class']
}>()

const { toggleSidebar } = useSidebar()
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
        <PanelLeft />
        <span class="tw:sr-only">Toggle Sidebar</span>
    </Button>
</template>
