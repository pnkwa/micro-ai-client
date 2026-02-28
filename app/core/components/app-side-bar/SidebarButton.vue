<script setup lang="ts">
import { SidebarMenuButton } from '@/core/components/ui/sidebar'
import type { SidebarMenuButtonProps } from '@/core/components/ui/sidebar/SidebarMenuButtonChild.vue'
import type { FunctionalComponent } from 'vue'
type SidebarButtonProps = SidebarMenuButtonProps & {
    icon?: FunctionalComponent
    title: string
}

const props = withDefaults(defineProps<SidebarButtonProps>(), {})
</script>

<template>
    <SidebarMenuButton v-bind="{ ...props }" :tooltip="props.title">
        <component :is="props.icon" class="tw:w-7! tw:h-7! tw:shrink-0" />
        <span class="tw:group-data-[collapsible=icon]:hidden tw:text-base">
            {{ props.title }}
        </span>
    </SidebarMenuButton>
</template>
