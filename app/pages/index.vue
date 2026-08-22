<script setup lang="ts">
import { ChartPie, GraduationCap, View, LogIn, Lock, ClipboardCheck } from '@lucide/vue'
import LandingPageSvg from '~/assets/svg/landing-page.svg?component'
import { useBreadcrumb } from '#imports'
import { useDetectionAvailability } from '~/core/composables/detectionAvailability'
import { useBlockingExam } from '~/core/composables/blockingExam'

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

/**
 * Whether the AI tool is being withheld, answered here on the first screen of the session.
 *
 * The check itself already ran - the sidebar asks on mount, on every navigation and on refocus - and
 * it correctly greys Image Detection out. What was missing is that NOTHING SAID WHY unless you
 * hovered the padlock: a student with an exam open had to go and find the exam to discover that
 * submitting it was what the app wanted, and the quick-access tile below cheerfully invited them into
 * the page it had just locked. Both of those are fixed here rather than on the exam page, because the
 * point is to answer it before they go looking.
 *
 * The availability state is shared with the sidebar, so reading it costs no extra request; naming the
 * exam costs two, and only for a student who is actually blocked.
 */
const { available: aiAvailable, reason: aiReason, message: aiMessage } = useDetectionAvailability()
const {
    exam: blockingExam,
    path: blockingExamPath,
    closesAtText,
    releaseText,
    refresh: refreshBlockingExam,
    clear: clearBlockingExam,
} = useBlockingExam()

const isStudent = computed(() => isSignedIn.value && !isInstructor.value)
const aiWithheld = computed(() => isStudent.value && !aiAvailable.value)

// An effect, not derived state: naming the exam is a fetch. Runs when the answer arrives rather than
// on mount alone - `available` starts optimistically true and flips when the API replies, so a
// mounted-only call would ask before there was anything to ask about.
watchEffect(() => {
    if (aiWithheld.value && aiReason.value === 'exam_open') void refreshBlockingExam()
    else if (aiAvailable.value) clearBlockingExam()
})
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

                <!--
                    Why the tool below is locked, said on the way in.

                    Named and linked, not just stated: "you have an exam open" is not actionable for
                    someone enrolled in three classes, and the fix - submit it - is a page they have
                    to find. With the exam named this is one tap. When it cannot be named (the two
                    lists failed, or the window is a case the server counts and this does not) the
                    composable's own sentence still explains the lock; only the button goes.

                    Students only, and only while it is true. Staff are never withheld the tool, so
                    this is one more thing on their screen that could never fire.
                -->
                <div
                    v-if="aiWithheld"
                    class="tw:flex tw:flex-col tw:gap-3 tw:rounded-xl tw:border tw:border-amber-200 tw:bg-amber-50/70 tw:p-4 tw:max-w-lg"
                >
                    <div class="tw:flex tw:items-start tw:gap-3">
                        <div
                            class="tw:flex tw:size-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg tw:bg-amber-100 tw:text-amber-700"
                        >
                            <Lock class="tw:size-4.5" />
                        </div>
                        <div class="tw:min-w-0">
                            <p class="tw:text-sm tw:font-semibold tw:text-amber-900">
                                AI image detection is locked
                            </p>
                            <p class="tw:mt-1 tw:text-[13px] tw:leading-snug tw:text-amber-800">
                                <template v-if="blockingExam">
                                    <span class="tw:font-semibold">{{ blockingExam.name }}</span>
                                    <!-- ml-1, not a leading space: the formatter puts this span on
                                         its own line and Vue condenses the newline away, so the
                                         word ended up glued to the exam's name. The full stop
                                         lives inside the span for the same reason. -->
                                    <span class="tw:ml-1">{{ closesAtText ?? 'is open' }}.</span>
                                    {{ releaseText }}
                                </template>
                                <template v-else>{{ aiMessage }}</template>
                            </p>
                        </div>
                    </div>

                    <McButton
                        v-if="blockingExamPath"
                        size="sm"
                        class="tw:gap-2 tw:self-start"
                        @click="router.push(blockingExamPath)"
                    >
                        <ClipboardCheck class="tw:size-4" />
                        Go to exam
                    </McButton>
                </div>

                <template v-if="isSignedIn">
                    <div>
                        <p
                            class="tw:text-xs tw:font-semibold tw:uppercase tw:tracking-widest tw:text-navy-60 tw:mb-3"
                        >
                            Quick Access
                        </p>
                        <div class="tw:grid tw:grid-cols-2 sm:tw:grid-cols-3 tw:gap-2.5">
                            <!--
                                The detection tile locks with the sidebar item rather than staying
                                bright next to a padlocked menu entry and a notice saying it is
                                locked. Disabled and explained in its own line, not hidden: a tile
                                that disappears reads as a bug, and this one comes back.
                            -->
                            <button
                                v-for="action in isInstructor ? instructorActions : studentActions"
                                :key="action.to"
                                :disabled="aiWithheld && action.to === '/image-detection'"
                                :title="
                                    aiWithheld && action.to === '/image-detection'
                                        ? (aiMessage ?? undefined)
                                        : undefined
                                "
                                class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:bg-white tw:border tw:border-navy-10 tw:rounded-xl tw:transition-all tw:duration-150 tw:text-left tw:not-disabled:cursor-pointer tw:not-disabled:hover:border-primary tw:not-disabled:hover:[box-shadow:0_4px_12px_rgba(36,148,134,0.12)] tw:not-disabled:hover:-translate-y-0.5 tw:disabled:cursor-not-allowed tw:disabled:bg-navy-5 tw:disabled:opacity-60"
                                @click="router.push(action.to)"
                            >
                                <div
                                    class="tw:flex tw:items-center tw:justify-center tw:w-9 tw:h-9 tw:bg-primary-disable-bg tw:rounded-lg tw:text-primary tw:shrink-0"
                                >
                                    <component :is="action.icon" class="tw:w-5 tw:h-5" />
                                </div>
                                <div class="tw:min-w-0">
                                    <p
                                        class="tw:text-sm tw:font-semibold tw:text-navy tw:leading-tight tw:flex tw:items-center tw:gap-1.5"
                                    >
                                        {{ action.label }}
                                        <Lock
                                            v-if="aiWithheld && action.to === '/image-detection'"
                                            class="tw:size-3.5 tw:shrink-0 tw:text-navy-60"
                                        />
                                    </p>
                                    <p
                                        class="tw:text-[11px] tw:text-navy-60 tw:leading-snug tw:mt-0.5"
                                    >
                                        {{
                                            aiWithheld && action.to === '/image-detection'
                                                ? 'Locked during your exam'
                                                : action.description
                                        }}
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
