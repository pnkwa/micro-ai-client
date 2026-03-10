<script setup lang="ts">
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarHeader,
    SidebarFooter,
    SidebarMenuButton,
} from '@/core/components/ui/sidebar'
import { menuItems } from '~/core/configs/navbar'
import SidebarItem from './SidebarItem.vue'
import { Microscope, LogIn, LogOut } from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuth()
const { open, isMobile } = useSidebar()

const isCollapsed = computed(() => !open.value && !isMobile.value)

const handleLogin = () => {
    router.push('/login')
}

const handleLogout = () => {
    authStore.logout()
    router.push('/login')
}
</script>

<template>
    <Sidebar collapsible="icon">
        <SidebarHeader>
            <div class="logo" :class="{ 'is-collapsed': isCollapsed }" @click="router.push('/')">
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
        <SidebarFooter>
            <SidebarMenu>
                <SidebarMenuItem v-if="authStore.isAuthenticated">
                    <div class="user-section" :class="{ 'is-collapsed': isCollapsed }">
                        <div class="user-avatar">
                            {{ authStore.getInitials }}
                        </div>
                        <div v-if="!isCollapsed" class="user-info">
                            <span class="user-name">{{ authStore.user?.name }}</span>
                            <span class="user-email">{{ authStore.user?.email }}</span>
                        </div>
                    </div>
                    <SidebarMenuButton tooltip="Logout" @click="handleLogout">
                        <LogOut class="tw:w-3 tw:h-3 tw:shrink-0" />
                        <span class="tw:group-data-[collapsible=icon]:hidden tw:text-base">
                            Logout
                        </span>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem v-else>
                    <SidebarMenuButton tooltip="Login" @click="handleLogin">
                        <LogIn class="tw:w-3 tw:h-3 tw:shrink-0" />
                        <span class="tw:group-data-[collapsible=icon]:hidden tw:text-base">
                            Login
                        </span>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarFooter>
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
    cursor: pointer;

    &:hover {
        opacity: 0.85;
    }

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

.user-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0.5rem;
    margin-bottom: 0.5rem;

    &.is-collapsed {
        justify-content: center;
        padding: 0.5rem 0;
    }
}

.user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--color-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    flex-shrink: 0;
}

.user-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.user-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-navy-100);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.user-email {
    font-size: 0.75rem;
    color: var(--color-navy-60);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
