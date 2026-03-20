<script setup lang="ts">
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarHeader,
    SidebarFooter,
} from '@/core/components/ui/sidebar'
import { menuItems } from '~/core/configs/navbar'
import SidebarItem from './SidebarItem.vue'
import { Microscope, LogIn, LogOut, User } from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuth()
const { open, isMobile } = useSidebar()

const filteredMenuItems = computed(() => {
    const role = authStore.user?.role
    if (role === 'instructor') {
        return menuItems.filter((item) => item.role === 'instructor' || item.role === 'all')
    }
    if (role === 'student') {
        return menuItems.filter((item) => item.role === 'student' || item.role === 'all')
    }
})

const isCollapsed = computed(() => !open.value && !isMobile.value)

const handleLogin = () => router.push('/login')

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
                        <SidebarMenuItem v-for="item in filteredMenuItems" :key="item.title">
                            <SidebarItem :item="item" />
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
            <SidebarMenu>
                <!-- Logged in: user card + logout -->
                <SidebarMenuItem
                    v-if="authStore.isLoggedIn"
                    class="tw:flex tw:flex-col tw:gap-1 tw:items-center"
                >
                    <div class="user-card" :class="{ 'is-collapsed': isCollapsed }">
                        <div class="user-avatar">
                            <User :size="16" :stroke-width="2" />
                        </div>
                        <div v-if="!isCollapsed" class="user-info">
                            <span class="user-name">{{ authStore.user?.username }}</span>
                            <span class="user-role">
                                {{
                                    authStore.user?.role === 'instructor' ? 'Instructor' : 'Student'
                                }}
                            </span>
                        </div>
                    </div>
                    <SidebarMenuButton
                        tooltip="Logout"
                        class="tw:text-navy-60 tw:hover:text-red-500 tw:hover:bg-red-50"
                        @click="handleLogout"
                    >
                        <LogOut class="tw:w-4 tw:h-4 tw:shrink-0" />
                        <span class="tw:group-data-[collapsible=icon]:hidden">Logout</span>
                    </SidebarMenuButton>
                </SidebarMenuItem>

                <!-- Not logged in: login button -->
                <SidebarMenuItem v-else>
                    <SidebarMenuButton tooltip="Login" @click="handleLogin">
                        <LogIn class="tw:w-4 tw:h-4 tw:shrink-0" />
                        <span class="tw:group-data-[collapsible=icon]:hidden">Login</span>
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

    &.is-collapsed {
        justify-content: center;
        padding: 0.5rem 0;
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
}

.user-card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.625rem 0.5rem;
    border-radius: 8px;
    background: color-mix(in srgb, var(--color-primary) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-primary) 15%, transparent);
    transition: background 0.15s ease;

    &.is-collapsed {
        justify-content: center;
        padding: 0.5rem;
    }
}

.user-avatar {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--color-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.user-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
}

.user-name {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-navy-100);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
}

.user-role {
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--color-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
}
</style>
