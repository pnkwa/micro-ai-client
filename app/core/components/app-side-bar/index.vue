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
import { useDetectionAvailability } from '~/core/composables/detectionAvailability'
import SidebarItem from './SidebarItem.vue'
import { Microscope, LogIn, LogOut, User } from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuth()
const { open, isMobile } = useSidebar()

const isInstructor = computed(() => authStore.user?.user_type === 'staff')

// Name over email, falling back to the email only when the profile has no name to show.
const displayName = computed(() => {
    const user = authStore.user
    if (!user) return ''
    const full = `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim()
    return full || user.email
})

// Students get their ID on the second line - it is what they are asked for, and it distinguishes
// two students who share a name. Staff keep the plain role label.
const roleLabel = computed(() => {
    const user = authStore.user
    if (isInstructor.value) return 'Instructor'
    return user?.student_id ? `Student · ${user.student_id}` : 'Student'
})

// Disables Image Detection for a student sitting an exam (request 5.2). Cosmetic by design: the
// page turns them away and POST /detections 403s them regardless, because a greyed-out nav item
// is not a control.
//
// Shown-and-disabled rather than hidden: an item that vanishes reads as a bug or a lost permission,
// and a student who used the tool yesterday has no way to find out where it went. Disabled with a
// reason answers that in place.
//
// RE-CHECKED, not checked once. This component mounts once around NuxtPage for the whole signed-in
// session, so a single onMounted call would answer at sign-in and never again — a student who
// entered mid-exam would keep the item disabled after submitting, until a full reload. That fails in
// the direction that locks someone out of a tool they are entitled to.
//
// Three triggers, all cheap, plus the exam form forcing one the instant a student submits.
const {
    available: aiAvailable,
    message: aiUnavailableMessage,
    refresh: refreshAiAvailability,
} = useDetectionAvailability()

onMounted(() => void refreshAiAvailability())

// afterEach returns its own unregister; the component outlives the session, but leaving a stray
// global hook behind on teardown is the kind of thing that only shows up under tests.
const stopAfterEach = router.afterEach(() => void refreshAiAvailability())
onBeforeUnmount(stopAfterEach)

// Covers finishing an exam in another tab, and an exam closing while they were away.
useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshAiAvailability()
})

// And polling, for the one case no event covers: an exam CLOSING while the student sits on a
// focused page without navigating. Nothing happens in the app at that moment - the change is
// purely the clock passing - so there is nothing to hang a trigger off.
//
// Self-limiting by design: it only asks while the student is blocked, which is exactly the state
// they are waiting to leave. The moment the exam closes, the answer flips and the polling stops
// asking. A student who is not blocked never issues one of these, so the steady state for
// everybody else is a timer that does nothing.
//
// The interval is longer than the composable's throttle, so a tick is never swallowed by it.
const AVAILABILITY_POLL_MS = 30_000
useIntervalFn(() => {
    if (document.visibilityState !== 'visible') return
    if (aiAvailable.value) return
    void refreshAiAvailability()
}, AVAILABILITY_POLL_MS)

const filteredMenuItems = computed(() => {
    const forRole = isInstructor.value
        ? menuItems.filter((item) => item.role === 'instructor' || item.role === 'all')
        : menuItems.filter((item) => item.role === 'student' || item.role === 'all')

    return forRole.map((item) => ({
        item,
        disabled: !aiAvailable.value && item.url === '/image-detection',
    }))
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
                        <SidebarMenuItem v-for="entry in filteredMenuItems" :key="entry.item.title">
                            <SidebarItem
                                :item="entry.item"
                                :disabled="entry.disabled"
                                :disabled-reason="aiUnavailableMessage ?? undefined"
                            />
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
                            <span class="user-name">{{ displayName }}</span>
                            <span class="user-role">
                                {{ roleLabel }}
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
