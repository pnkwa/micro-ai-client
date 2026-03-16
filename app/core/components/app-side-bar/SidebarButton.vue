<script setup lang="ts">
import { SidebarMenuButton } from '@/core/components/ui/sidebar'
import type { SidebarMenuButtonProps } from '@/core/components/ui/sidebar/SidebarMenuButtonChild.vue'
import type { FunctionalComponent } from 'vue'

type SidebarButtonProps = SidebarMenuButtonProps & {
    icon?: FunctionalComponent
    title: string
}

const props = withDefaults(defineProps<SidebarButtonProps>(), {})
const emit = defineEmits<{
    click: [event: MouseEvent]
}>()

const handleClick = (event: MouseEvent) => {
    emit('click', event)
}
</script>

<template>
    <SidebarMenuButton v-bind="props" :tooltip="props.title" @click="handleClick">
        <component :is="props.icon" class="tw:w-5! tw:h-5! tw:shrink-0" />
        <span class="tw:group-data-[collapsible=icon]:hidden tw:text-base">
            {{ props.title }}
        </span>
    </SidebarMenuButton>
</template>
