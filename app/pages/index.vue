<script setup lang="ts">
import { Microscope, ChartPie, GraduationCap, FileText, View, LogIn } from 'lucide-vue-next'
import { useBreadcrumb } from '#imports'
import classesData from '~/data/classes.json'
import studentsData from '~/data/students.json'

const router = useRouter()
const breadcrumb = useBreadcrumb()
const auth = useAuth()

breadcrumb.setBreadcrumbs([{ label: 'Welcome' }])

const isInstructor = computed(() => auth.user?.role === 'instructor')
const userName = computed(() => auth.user?.name ?? 'User')

// Check if student is enrolled in a class
const studentRecord = computed(() =>
    (studentsData.students as { id: number; classId?: number }[]).find(
        (s) => s.id === auth.user?.userId,
    ),
)
const hasClass = computed(() => isInstructor.value || !!studentRecord.value?.classId)

// Join class by code
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
        description: 'View overall statistics and progress',
    },
    {
        label: 'Classes',
        icon: GraduationCap,
        to: '/classes',
        description: 'Manage your classes and students',
    },
    {
        label: 'Image Detection',
        icon: View,
        to: '/image-detection',
        description: 'Analyze microscope images with AI',
    },
]

const studentActions = [
    {
        label: 'Assignments',
        icon: FileText,
        to: '/assignments',
        description: 'View and submit your assignments',
    },
    {
        label: 'Image Detection',
        icon: View,
        to: '/image-detection',
        description: 'Analyze microscope images with AI',
    },
]
</script>

<template>
    <div class="tw:h-[calc(100vh-100px)] tw:flex tw:flex-col tw:overflow-auto">
        <div
            class="tw:flex-1 tw:flex tw:items-center tw:justify-center tw:px-6 tw:py-12 tw:bg-linear-to-r tw:from-primary-disable-bg tw:to-white tw:rounded-md"
        >
            <!-- Normal view: instructor or enrolled student -->
            <div
                v-if="hasClass && !joinSuccess"
                class="tw:text-center tw:max-w-2xl tw:w-full"
            >
                <div
                    class="tw:inline-flex tw:items-center tw:justify-center tw:w-20 tw:h-20 tw:bg-primary tw:rounded-[20px] tw:mb-4 tw:[box-shadow:0_10px_40px_rgba(36,148,134,0.3)]"
                >
                    <Microscope class="tw:w-12 tw:h-12 tw:text-white" />
                </div>

                <div class="tw:mb-3">
                    <McBadge
                        :class="
                            isInstructor
                                ? 'tw:bg-[rgba(36,148,134,0.12)] tw:text-primary tw:border tw:border-[rgba(36,148,134,0.3)]'
                                : 'tw:bg-[rgba(59,130,246,0.1)] tw:text-blue-600 tw:border tw:border-[rgba(59,130,246,0.25)]'
                        "
                        class="tw:inline-block tw:px-3.5 tw:py-1 tw:rounded-full tw:text-xs tw:font-semibold tw:tracking-[0.05em] tw:uppercase"
                    >
                        {{ isInstructor ? 'Instructor' : 'Student' }}
                    </McBadge>
                </div>

                <h1
                    class="tw:text-3xl tw:font-extrabold tw:text-primary tw:mb-3 tw:tracking-tight"
                >
                    Welcome back, {{ userName }}
                </h1>
                <p class="tw:text-base tw:text-navy-60 tw:mb-8 tw:leading-relaxed">
                    {{
                        isInstructor
                            ? 'Manage your classes, track student progress, and analyze microscope images.'
                            : 'View your assignments, submit work, and explore microscope image analysis.'
                    }}
                </p>

                <div class="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] tw:gap-4">
                    <button
                        v-for="action in isInstructor ? instructorActions : studentActions"
                        :key="action.to"
                        class="tw:flex tw:items-start tw:gap-3.5 tw:p-4 tw:bg-white tw:border tw:border-navy-10 tw:rounded-xl tw:cursor-pointer tw:transition-all tw:duration-200 tw:text-left tw:w-full tw:hover:border-primary tw:hover:[box-shadow:0_4px_16px_rgba(36,148,134,0.15)] tw:hover:-translate-y-0.5"
                        @click="router.push(action.to)"
                    >
                        <div
                            class="tw:flex tw:items-center tw:justify-center tw:w-10 tw:h-10 tw:bg-primary-disable-bg tw:rounded-[10px] tw:text-primary tw:shrink-0"
                        >
                            <component :is="action.icon" class="tw:w-6 tw:h-6" />
                        </div>
                        <div class="tw:flex tw:flex-col tw:gap-0.5">
                            <span class="tw:text-[0.9rem] tw:font-semibold tw:text-navy">
                                {{ action.label }}
                            </span>
                            <span class="tw:text-xs tw:text-navy-60 tw:leading-snug">
                                {{ action.description }}
                            </span>
                        </div>
                    </button>
                </div>
            </div>

            <!-- Join class view: student without a class -->
            <div
                v-else-if="!hasClass && !joinSuccess"
                class="tw:text-center tw:max-w-2xl tw:w-full"
            >
                <div
                    class="tw:inline-flex tw:items-center tw:justify-center tw:w-20 tw:h-20 tw:bg-primary tw:rounded-[20px] tw:mb-4 tw:[box-shadow:0_10px_40px_rgba(36,148,134,0.3)]"
                >
                    <Microscope class="tw:w-12 tw:h-12 tw:text-white" />
                </div>
                <h1
                    class="tw:text-3xl tw:font-extrabold tw:text-primary tw:mb-2 tw:tracking-tight"
                >
                    Join a Class
                </h1>
                <p class="tw:text-base tw:text-navy-60 tw:leading-relaxed">
                    Enter the class code provided by your instructor
                </p>

                <div class="tw:mt-8 tw:flex tw:flex-col tw:items-center tw:gap-3.5">
                    <input
                        v-model="joinCode"
                        class="tw:w-full tw:max-w-xs tw:px-5 tw:py-4 tw:text-2xl tw:font-bold tw:text-center tw:tracking-[0.15em] tw:uppercase tw:border-2 tw:border-navy-10 tw:rounded-[14px] tw:bg-white tw:text-navy tw:outline-none tw:transition-[border-color] tw:duration-200 tw:focus:border-primary tw:focus:[box-shadow:0_0_0_3px_rgba(36,148,134,0.15)] tw:placeholder:text-navy-60 tw:placeholder:font-normal tw:placeholder:tracking-[0.05em] tw:placeholder:normal-case"
                        placeholder="e.g. MICRO01"
                        maxlength="10"
                        autocomplete="off"
                        spellcheck="false"
                        @keydown.enter="handleJoin"
                    />
                    <p v-if="joinError" class="tw:text-sm tw:text-red-500 tw:m-0">
                        {{ joinError }}
                    </p>
                    <McButton size="lg" class="tw:min-w-40 tw:gap-2" @click="handleJoin">
                        <LogIn class="tw:w-5 tw:h-5" />
                        Enter
                    </McButton>
                </div>
            </div>

            <!-- Success view after joining -->
            <div v-else class="tw:text-center tw:max-w-2xl tw:w-full">
                <div
                    class="tw:inline-flex tw:items-center tw:justify-center tw:w-20 tw:h-20 tw:bg-primary tw:rounded-full tw:text-4xl tw:text-white tw:mb-4 tw:[box-shadow:0_10px_40px_rgba(36,148,134,0.3)]"
                >
                    ✓
                </div>
                <h1
                    class="tw:text-3xl tw:font-extrabold tw:text-primary tw:mb-2 tw:tracking-tight"
                >
                    You're enrolled!
                </h1>
                <p class="tw:text-base tw:font-medium tw:text-navy tw:mb-1">
                    {{ joinSuccess?.name }}
                </p>
                <p class="tw:text-base tw:text-navy-60">{{ joinSuccess?.semester }}</p>
                <McButton class="tw:mt-6" size="lg" @click="router.push('/assignments')">
                    Go to Assignments
                </McButton>
            </div>
        </div>
    </div>
</template>
