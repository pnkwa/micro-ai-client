<script setup lang="ts">
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarHeader,
} from '@/core/components/ui/sidebar'
import { menuItems } from '~/core/configs/navbar'
import SidebarItem from './SidebarItem.vue'
import { Microscope } from 'lucide-vue-next'

const { open, isMobile } = useSidebar()

const isCollapsed = computed(() => !open.value && !isMobile.value)
</script>

<template>
    <Sidebar collapsible="icon">
        <SidebarHeader>
            <div class="logo" :class="{ 'is-collapsed': isCollapsed }">
                <div class="logo-icon-wrapper">
                    <Microscope class="logo-icon" />
                </div>
                <span v-if="!isCollapsed" class="logo-text">MicroAI</span>
            </div>
        </SidebarHeader>
        <SidebarContent>
            <SidebarGroup>
                <SidebarGroupContent>
                    <SidebarMenu>
                        <SidebarMenuItem v-for="item in menuItems" :key="item.title">
                            <SidebarItem :item="item" />
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
        </SidebarContent>
    </Sidebar>
</template>

<style scoped lang="scss">
.logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 56px;
    padding: 0.5rem;
    transition: all 0.2s ease;

    .logo-icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background: var(--color-primary);
        border-radius: 10px;
        flex-shrink: 0;
    }

    .logo-icon {
        width: 24px;
        height: 24px;
        color: white;
    }

    .logo-text {
        font-size: 1.5rem;
        font-weight: 800;
        letter-spacing: -0.025em;
        white-space: nowrap;
        background: linear-gradient(90deg, var(--color-primary), var(--color-primary-hover));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    &.is-collapsed {
        justify-content: center;
        padding: 0.5rem 0;
    }
}
</style>
