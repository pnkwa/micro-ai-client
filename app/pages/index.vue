<script setup lang="ts">
import { ChartPie, GraduationCap, FileText, View, LogIn } from 'lucide-vue-next'
import LandingPageSvg from '~/assets/svg/landing-page.svg?component'
import { useBreadcrumb } from '#imports'
import classesData from '~/data/classes.json'

const router = useRouter()
const breadcrumb = useBreadcrumb()
const auth = useAuth()

breadcrumb.setBreadcrumbs([{ label: 'Welcome' }])

const isInstructor = computed(() => auth.user?.user_type === 'staff')
const userName = computed(() =>
    auth.user ? `${auth.user.firstname} ${auth.user.lastname}` : 'User',
)
const hasClass = computed(() => !!auth.user)

const joinCode = ref('')
const joinError = ref('')
const joinSuccess = ref<{ name: string; semester: string } | null>(null)

const handleJoin = () => {
    joinError.value = ''
    const code = joinCode.value.trim().toUpperCase()
    const matched = (
        classesData.classes as {
            id: number
            name: string
            semester: string
            status: string
            code: string
        }[]
    ).find((c) => c.code === code)
    if (!matched) {
        joinError.value = 'Invalid class code. Please try again.'
        return
    }
    if (matched.status === 'closed') {
        joinError.value = 'This class is no longer accepting new students.'
        return
    }
    joinSuccess.value = { name: matched.name, semester: matched.semester }
}

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
        label: 'Assignments',
        icon: FileText,
        to: '/assignments',
        description: 'View & submit work',
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
        class="tw:min-h-[calc(100vh-80px)] tw:flex tw:items-center tw:px-4 md:tw:px-6 tw:py-8 md:tw:py-12 tw:bg-linear-to-r tw:from-primary-disable-bg tw:to-white"
    >
        <div
            class="tw:max-w-6xl tw:mx-auto tw:w-full tw:flex tw:flex-col tw:md:flex-row tw:gap-10 md:tw:gap-12 tw:items-center"
        >
            <div class="tw:flex tw:flex-col tw:gap-5 tw:w-full md:tw:flex-1 tw:min-w-0">
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

                <h1
                    class="tw:text-3xl md:tw:text-4xl lg:tw:text-5xl tw:font-extrabold tw:text-navy tw:leading-tight"
                >
                    Welcome back,
                    <span class="tw:text-primary tw:block">{{ userName }}</span>
                </h1>

                <p class="tw:text-base lg:tw:text-lg tw:text-navy-60 tw:max-w-lg">
                    {{
                        isInstructor
                            ? 'Manage classes, monitor student progress, and leverage AI-powered image detection.'
                            : 'Submit assignments, join classes, and explore AI-powered microscope analysis.'
                    }}
                </p>

                <template v-if="hasClass && !joinSuccess">
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

                <template v-else-if="!hasClass && !joinSuccess">
                    <div class="tw:flex tw:flex-col tw:gap-3 tw:w-full tw:max-w-sm">
                        <p class="tw:text-sm tw:font-medium tw:text-navy-60">
                            Enter the class code provided by your instructor to get started.
                        </p>
                        <input
                            v-model="joinCode"
                            class="tw:px-5 tw:py-3 tw:text-lg tw:font-bold tw:text-center tw:tracking-widest tw:uppercase tw:border-2 tw:border-navy-10 tw:rounded-xl tw:bg-white tw:outline-none tw:transition-[border-color] tw:duration-200 tw:focus:border-primary tw:focus:[box-shadow:0_0_0_3px_rgba(36,148,134,0.15)] tw:placeholder:font-normal tw:placeholder:tracking-normal tw:placeholder:normal-case tw:placeholder:text-navy-60"
                            placeholder="e.g. MICRO01"
                            maxlength="10"
                            autocomplete="off"
                            spellcheck="false"
                            @keydown.enter="handleJoin"
                        />
                        <p v-if="joinError" class="tw:text-sm tw:text-red-500">
                            {{ joinError }}
                        </p>
                        <McButton size="lg" class="tw:gap-2" @click="handleJoin">
                            <LogIn class="tw:w-5 tw:h-5" />
                            Join Class
                        </McButton>
                    </div>
                </template>

                <template v-else>
                    <div
                        class="tw:flex tw:flex-col tw:gap-2 tw:p-5 tw:bg-white tw:border tw:border-primary/20 tw:rounded-2xl tw:max-w-sm"
                    >
                        <p class="tw:text-lg tw:font-bold tw:text-primary">You're enrolled!</p>
                        <p class="tw:text-sm tw:font-medium tw:text-navy">
                            {{ joinSuccess?.name }}
                        </p>
                        <p class="tw:text-sm tw:text-navy-60">{{ joinSuccess?.semester }}</p>
                        <McButton
                            class="tw:mt-2 tw:self-start"
                            @click="router.push('/assignments')"
                        >
                            Go to Assignments
                        </McButton>
                    </div>
                </template>
            </div>

            <LandingPageSvg class="tw:w-90 tw:md:w-225 tw:drop-shadow-xl" />
        </div>
    </div>
</template>
