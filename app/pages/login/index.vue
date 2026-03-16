<script setup lang="ts">
import { Microscope, Mail, Lock } from 'lucide-vue-next'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'

definePageMeta({
    layout: false,
})

const router = useRouter()
const authStore = useAuth()

const loginSchema = toTypedSchema(
    z.object({
        email: z.string().email('Please enter a valid email'),
        password: z.string().min(6, 'Password must be at least 6 characters'),
    }),
)

const { handleSubmit, errors, defineField } = useForm({
    validationSchema: loginSchema,
})

const [email, emailAttrs] = defineField('email')
const [password, passwordAttrs] = defineField('password')

const isLoading = ref(false)
const loginError = ref('')

const onSubmit = handleSubmit(async (values) => {
    isLoading.value = true
    loginError.value = ''

    try {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 500))
        const success = authStore.login(values)

        if (success) {
            router.push('/dashboard')
        } else {
            loginError.value = 'Invalid credentials'
        }
    } catch {
        loginError.value = 'An error occurred. Please try again.'
    } finally {
        isLoading.value = false
    }
})
</script>

<template>
    <div class="login-page">
        <div class="login-container">
            <div class="login-card">
                <div class="login-header">
                    <div class="logo-wrapper">
                        <Microscope class="logo-icon" />
                    </div>
                    <h1 class="login-title">MicroAI</h1>
                    <p class="login-subtitle">Teacher Login</p>
                </div>

                <form class="login-form" @submit="onSubmit">
                    <div v-if="loginError" class="login-error">
                        {{ loginError }}
                    </div>

                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <div class="input-wrapper">
                            <Mail class="input-icon" />
                            <input
                                v-model="email"
                                v-bind="emailAttrs"
                                type="email"
                                placeholder="Enter your email"
                                class="form-input"
                            />
                        </div>
                        <span v-if="errors.email" class="form-error">{{ errors.email }}</span>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Password</label>
                        <div class="input-wrapper">
                            <Lock class="input-icon" />
                            <input
                                v-model="password"
                                v-bind="passwordAttrs"
                                type="password"
                                placeholder="Enter your password"
                                class="form-input"
                            />
                        </div>
                        <span v-if="errors.password" class="form-error">{{ errors.password }}</span>
                    </div>

                    <McButton type="submit" class="login-button" :disabled="isLoading">
                        {{ isLoading ? 'Signing in...' : 'Sign In' }}
                    </McButton>
                </form>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--color-primary-disable-bg) 0%, white 100%);
    padding: 1rem;
}

.login-container {
    width: 100%;
    max-width: 400px;
}

.login-card {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    box-shadow:
        0 4px 6px -1px rgb(0 0 0 / 0.1),
        0 2px 4px -2px rgb(0 0 0 / 0.1);
}

.login-header {
    text-align: center;
    margin-bottom: 2rem;
}

.logo-wrapper {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    background: var(--color-primary);
    border-radius: 16px;
    margin-bottom: 1rem;
}

.logo-icon {
    width: 36px;
    height: 36px;
    color: white;
}

.login-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-primary);
    margin-bottom: 0.25rem;
}

.login-subtitle {
    font-size: 0.875rem;
    color: var(--color-navy-60);
}

.login-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}

.login-error {
    padding: 0.75rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    color: #dc2626;
    font-size: 0.875rem;
    text-align: center;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-navy-80);
}

.input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}

.input-icon {
    position: absolute;
    left: 0.75rem;
    width: 18px;
    height: 18px;
    color: var(--color-navy-40);
}

.form-input {
    width: 100%;
    padding: 0.625rem 0.75rem 0.625rem 2.5rem;
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: 8px;
    font-size: 0.875rem;
    transition: border-color 0.15s ease;

    &:focus {
        outline: none;
        border-color: var(--color-primary);
    }

    &::placeholder {
        color: var(--color-gray-400);
    }
}

.form-error {
    font-size: 0.75rem;
    color: #dc2626;
}

.login-button {
    width: 100%;
    margin-top: 0.5rem;
}
</style>
