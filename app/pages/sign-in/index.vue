<script setup lang="ts">
import SignIn from '~/features/components/forms/SignIn.vue'
import type { SignInFormData } from '~/features/types/forms/sign-in'

import { toast } from 'vue-sonner'
definePageMeta({
    layout: false,
})

const { signIn, signInWithCMU } = useAuth()
const router = useRouter()

const error = ref('')

const handleSignIn = (values: SignInFormData) => {
    error.value = ''
    const ok = signIn(values)
    if (ok) {
        router.push('/')
    } else {
        toast.error('Invalid username or password. Please try again.')
    }
}

const handleSignInWithCmu = () => {
    signInWithCMU()
    router.push('/')
}
</script>

<template>
    <div
        class="tw:min-h-screen tw:flex tw:flex-col tw:items-center tw:justify-center tw:bg-linear-to-br tw:from-primary/30 tw:via-primary/15 tw:to-primary/5 tw:p-4"
    >
        <div class="tw:flex tw:flex-col tw:items-center tw:mb-10">
            <h1 class="tw:text-2xl tw:md:text-4xl tw:font-bold tw:text-center tw:text-primary">
                Welcome
            </h1>
            <p class="tw:text-sm tw:text-slate-400 tw:mt-1">Sign in to your account</p>
        </div>

        <div class="tw:flex tw:items-center tw:gap-10 tw:w-full tw:h-full tw:max-w-4xl">
            <div class="tw:flex tw:gap-2 tw:w-full tw:items-center tw:justify-center">
                <div class="tw:w-full tw:max-w-sm">
                    <SignIn @sign-in="handleSignIn" @sign-in-with-cmu="handleSignInWithCmu" />
                </div>
            </div>
        </div>
    </div>
</template>
