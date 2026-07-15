<script setup lang="ts">
import SignIn from '~/features/components/forms/SignIn.vue'
import type { SignInFormData } from '~/features/types/forms/sign-in'
import labBackground from '~/assets/images/sign-in-img.png'

import { toast } from 'vue-sonner'
definePageMeta({
    layout: false,
})

const { signIn, signInWithCMU } = useAuth()
const router = useRouter()

const error = ref('')
const loading = ref(false)

const handleSignIn = async (values: SignInFormData) => {
    error.value = ''
    loading.value = true
    try {
        const ok = await signIn(values)
        if (ok) {
            router.push('/dashboard')
        } else {
            toast.error('Invalid username or password. Please try again.')
        }
    } finally {
        loading.value = false
    }
}

const handleSignInWithCmu = () => {
    signInWithCMU()
    router.push('/')
}
</script>

<template>
    <div
        class="tw:relative tw:min-h-screen tw:overflow-hidden tw:bg-linear-to-br tw:from-primary/30 tw:via-primary/15 tw:to-primary/5"
    >
        <img
            :src="labBackground"
            alt=""
            aria-hidden="true"
            class="tw:pointer-events-none tw:absolute tw:-bottom-[14vw] tw:left-0 tw:w-full tw:h-auto tw:opacity-50"
        />

        <div
            class="tw:relative tw:min-h-screen tw:mx-auto tw:max-w-6xl tw:px-6 tw:py-12 tw:grid tw:content-center tw:gap-12 tw:lg:grid-cols-2"
        >
            <div class="tw:text-center tw:lg:text-left">
                <p
                    class="tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-[0.2em] tw:text-primary/60"
                >
                    MicroAI Laboratory
                </p>
                <h1
                    class="tw:mt-3 tw:text-6xl tw:lg:text-6xl tw:font-bold tw:text-primary tw:leading-tight"
                >
                    Welcome to MicroAI
                </h1>
                <p
                    class="tw:mt-4 tw:text-sm tw:lg:text-base tw:text-slate-500 tw:max-w-md tw:mx-auto tw:lg:mx-0"
                >
                    Sign in to review assignments, run detections, and track your classes.
                </p>
            </div>

            <div class="tw:flex tw:justify-center tw:lg:justify-end">
                <SignIn
                    :loading="loading"
                    @sign-in="handleSignIn"
                    @sign-in-with-cmu="handleSignInWithCmu"
                />
            </div>
        </div>
    </div>
</template>
