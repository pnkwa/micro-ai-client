<script setup lang="ts">
import { ToastAction } from 'reka-ui'
import Login from '~/features/components/forms/Login.vue'
import type { LoginFormData } from '~/features/types/forms/login'

definePageMeta({
    layout: false,
})

const { login } = useAuth()
const router = useRouter()

const loading = ref(false)

const handleLogin = async (values: LoginFormData) => {
    loading.value = true

    try {
        await login(values)
        router.push('/')
    } catch (err) {
        ToastAction.show({
            title: 'Login failed',
            description: 'Please check your credentials and try again.',
            err,
            variant: 'destructive',
        })
    }
}
</script>

<template>
    <div
        class="tw:min-h-screen tw:flex tw:flex-col tw:items-center tw:justify-center tw:bg-linear-to-br tw:from-primary/10 tw:to-white tw:p-4"
    >
        <div class="tw:flex tw:flex-col tw:mb-8">
            <h1 class="tw:text-2xl tw:font-bold tw:text-center tw:text-primary">Welcome</h1>
            <p class="tw:text-sm tw:text-navy-50">Sign in to access your dashboard</p>
        </div>
        <div class="tw:w-full tw:max-w-sm">
            <Login @login="handleLogin" />
        </div>
    </div>
</template>
