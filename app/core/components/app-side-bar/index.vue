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

const isInstructor = computed(() => authStore.user?.user_type === 'staff')

// Hides Image Detection from a student sitting an exam (request 5.2). Cosmetic by design: the
// page turns them away and POST /detections 403s them regardless, because a nav item nobody can
// see is not a control.
//
// RE-CHECKED, not checked once. This component mounts once around NuxtPage for the whole signed-in
// session, so a single onMounted call would answer at sign-in and never again — a student who
// entered mid-exam would keep the item hidden after submitting, until a full reload. That fails in
// the direction that locks someone out of a tool they are entitled to.
//
// Two triggers, both cheap: every navigation, and the tab regaining focus (which covers finishing
// an exam in another tab, and an exam simply closing while they were away). The composable
// throttles, so neither can turn into a request per click.
const { available: aiAvailable, refresh: refreshAiAvailability } = useDetectionAvailability()

onMounted(() => void refreshAiAvailability())

// afterEach returns its own unregister; the component outlives the session, but leaving a stray
// global hook behind on teardown is the kind of thing that only shows up under tests.
const stopAfterEach = router.afterEach(() => void refreshAiAvailability())

const onVisible = () => {
    if (document.visibilityState === 'visible') void refreshAiAvailability()
}
onMounted(() => document.addEventListener('visibilitychange', onVisible))
onBeforeUnmount(() => {
    stopAfterEach()
    document.removeEventListener('visibilitychange', onVisible)
})

const filteredMenuItems = computed(() => {
    const forRole = isInstructor.value
        ? menuItems.filter((item) => item.role === 'instructor' || item.role === 'all')
        : menuItems.filter((item) => item.role === 'student' || item.role === 'all')

    if (aiAvailable.value) return forRole
    return forRole.filter((item) => item.url !== '/image-detection')
})

const isCollapsed = computed(() => !open.value && !isMobile.value)

const handleSignIn = () => router.push('/sign-in')

const handleSignOut = () => {
    authStore.signOut()
    router.push('/sign-in')
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
                <SidebarMenuItem
                    v-if="authStore.isSignedIn"
                    class="tw:flex tw:flex-col tw:gap-1 tw:items-center"
                >
                    <div class="user-card" :class="{ 'is-collapsed': isCollapsed }">
                        <div class="user-avatar">
                            <User :size="16" :stroke-width="2" />
                        </div>
                        <div v-if="!isCollapsed" class="user-info">
                            <span class="user-name">{{ authStore.user?.email }}</span>
                            <span class="user-role">
                                {{
                                    authStore.user?.user_type === 'staff' ? 'Instructor' : 'Student'
                                }}
                            </span>
                        </div>
                    </div>
                    <SidebarMenuButton
                        tooltip="Sign out"
                        class="tw:text-navy-60 tw:hover:text-red-500 tw:hover:bg-red-50"
                        @click="handleSignOut"
                    >
                        <LogOut class="tw:w-4 tw:h-4 tw:shrink-0" />
                        <span class="tw:group-data-[collapsible=icon]:hidden">Sign out</span>
                    </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem v-else>
                    <SidebarMenuButton tooltip="Sign in" @click="handleSignIn">
                        <LogIn class="tw:w-4 tw:h-4 tw:shrink-0" />
                        <span class="tw:group-data-[collapsible=icon]:hidden">Sign in</span>
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
