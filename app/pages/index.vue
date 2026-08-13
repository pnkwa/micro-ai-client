<script setup lang="ts">
import { ChartPie, GraduationCap, View, LogIn } from '@lucide/vue'
import LandingPageSvg from '~/assets/svg/landing-page.svg?component'
import { useBreadcrumb } from '#imports'

const router = useRouter()
const breadcrumb = useBreadcrumb()
const auth = useAuth()
const { $dayjs } = useNuxtApp()

breadcrumb.setBreadcrumbs([{ label: 'Welcome' }])

const greeting = computed(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
})
const today = computed(() => $dayjs().format('dddd, MMMM D'))

const isInstructor = computed(() => auth.user?.user_type === 'staff')
const userName = computed(() =>
    auth.user
        ? auth.user.firstname
            ? `${auth.user.firstname} ${auth.user.lastname ?? ''}`.trim()
            : auth.user.email
        : 'User',
)

// The name still falls back to the email above, so only show the email as a separate line when it
// is not already standing in for the name - otherwise it prints twice.
const showEmailLine = computed(() => !!auth.user?.firstname)
const isSignedIn = computed(() => !!auth.user)

const instructorActions = [
    {
        label: 'Dashboard',
        icon: ChartPie,
        to: '/dashboard',
        description: 'Statistics & progress',
    },
    {
        label: 'Classes',
        icon: GraduationCap,
        to: '/classes',
        description: 'Manage classes',
    },
    {
        label: 'Image Detection',
        icon: View,
        to: '/image-detection',
        description: 'AI image analysis',
    },
]

const studentActions = [
    {
        label: 'My Classes',
        icon: GraduationCap,
        to: '/classes',
        description: 'Classes & assignments',
    },
    {
        label: 'Image Detection',
        icon: View,
        to: '/image-detection',
        description: 'AI image analysis',
    },
]
</script>

<template>
    <div
        class="tw:min-h-[calc(100vh-80px)] tw:flex tw:items-center tw:px-4 md:tw:px-6 tw:py-8 md:tw:py-12"
    >
        <div
            class="tw:max-w-6xl tw:mx-auto tw:w-full tw:flex tw:flex-col tw:md:flex-row tw:gap-10 md:tw:gap-12 tw:items-center"
        >
            <div
                class="tw:flex tw:px-6 tw:md:px-12 tw:flex-col tw:gap-5 tw:w-full md:tw:flex-1 tw:min-w-0"
            >
                <McBadge
                    :class="
                        isInstructor
                            ? 'tw:bg-primary-disable-bg tw:text-primary tw:border-primary/30'
                            : 'tw:bg-blue-50 tw:text-blue-600 tw:border-blue-200'
                    "
                    class="tw:w-fit tw:px-4 tw:py-1.5 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wider tw:border tw:rounded-full"
                >
                    {{ isInstructor ? 'Instructor' : 'Student' }}
                </McBadge>

                <div class="tw:flex tw:flex-col tw:gap-1">
                    <p class="tw:text-sm tw:font-medium tw:text-navy-50">{{ today }}</p>
                    <h1
                        class="tw:text-3xl md:tw:text-4xl lg:tw:text-5xl tw:font-extrabold tw:text-navy tw:leading-tight"
                    >
                        {{ greeting }},
                        <span class="tw:text-primary tw:block">{{ userName }}</span>
                    </h1>

                    <!--
                        Student ID first: it is the identifier the faculty actually uses on rosters
                        and answer sheets, and the one a student is asked for. tabular-nums so a
                        column of digits does not jitter.
                    -->
                    <p
                        v-if="isSignedIn && (auth.user?.student_id || showEmailLine)"
                        class="tw:text-sm tw:text-navy-60 tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-1 tw:mt-1"
                    >
                        <span v-if="auth.user?.student_id" class="tw:font-medium tw:text-navy-90">
                            Student ID
                            <span class="tw:tabular-nums">{{ auth.user.student_id }}</span>
                        </span>
                        <span v-if="auth.user?.student_id && showEmailLine" class="tw:text-navy-30">
                            •
                        </span>
                        <span v-if="showEmailLine">{{ auth.user?.email }}</span>
                    </p>
                </div>

                <p class="tw:text-base lg:tw:text-lg tw:text-navy-60 tw:max-w-lg">
                    {{
                        isInstructor
                            ? 'Manage classes, monitor student progress, and leverage AI image detection.'
                            : 'Submit assignments and explore AI microscope analysis.'
                    }}
                </p>

                <template v-if="isSignedIn">
                    <div>
                        <p
                            class="tw:text-xs tw:font-semibold tw:uppercase tw:tracking-widest tw:text-navy-60 tw:mb-3"
                        >
                            Quick Access
                        </p>
                        <div class="tw:grid tw:grid-cols-2 sm:tw:grid-cols-3 tw:gap-2.5">
                            <button
                                v-for="action in isInstructor ? instructorActions : studentActions"
                                :key="action.to"
                                class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:bg-white tw:border tw:border-navy-10 tw:rounded-xl tw:cursor-pointer tw:transition-all tw:duration-150 tw:text-left tw:hover:border-primary tw:hover:[box-shadow:0_4px_12px_rgba(36,148,134,0.12)] tw:hover:-translate-y-0.5"
                                @click="router.push(action.to)"
                            >
                                <div
                                    class="tw:flex tw:items-center tw:justify-center tw:w-9 tw:h-9 tw:bg-primary-disable-bg tw:rounded-lg tw:text-primary tw:shrink-0"
                                >
                                    <component :is="action.icon" class="tw:w-5 tw:h-5" />
                                </div>
                                <div>
                                    <p
                                        class="tw:text-sm tw:font-semibold tw:text-navy tw:leading-tight"
                                    >
                                        {{ action.label }}
                                    </p>
                                    <p
                                        class="tw:text-[11px] tw:text-navy-60 tw:leading-snug tw:mt-0.5"
                                    >
                                        {{ action.description }}
                                    </p>
                                </div>
                            </button>
                        </div>
                    </div>
                </template>

                <template v-else>
                    <div class="tw:flex tw:flex-col tw:gap-3 tw:w-full tw:max-w-sm">
                        <p class="tw:text-sm tw:font-medium tw:text-navy-60">
                            Sign in with your faculty account to see your classes and assignments.
                        </p>
                        <McButton
                            size="lg"
                            class="tw:gap-2 tw:self-start"
                            @click="router.push('/sign-in')"
                        >
                            <LogIn class="tw:w-5 tw:h-5" />
                            Sign in
                        </McButton>
                    </div>
                </template>
            </div>

            <LandingPageSvg class="tw:w-90 tw:md:w-225 tw:drop-shadow-xl" />
        </div>
    </div>
</template>
