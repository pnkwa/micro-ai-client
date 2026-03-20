<script setup lang="ts">
import { signInSchema, type SignInFormData } from '~/features/types/forms/sign-in'
import { Microscope } from 'lucide-vue-next'
import CmuLogo from '~/assets/images/CMU-logo.png'

const emit = defineEmits<{
    signIn: [values: SignInFormData]
    signInWithCmu: []
}>()

const { handleSubmit } = useForm<SignInFormData>({
    validationSchema: toTypedSchema(signInSchema),
    initialValues: {
        username: '',
        password: '',
    },
})

const onSignIn = handleSubmit((values) => {
    emit('signIn', values)
})

const onSignInWithCmu = () => {
    emit('signInWithCmu')
}
</script>

<template>
    <div class="tw:relative tw:w-full tw:max-w-sm tw:mx-auto">
        <div
            class="tw:absolute tw:-top-5 tw:left-1/2 tw:-translate-x-1/2 tw:z-10 tw:flex tw:flex-col tw:items-center"
        >
            <div
                class="tw:w-14 tw:h-7 tw:rounded-t-full tw:border-[3px] tw:border-slate-400 tw:bg-slate-300"
            />
            <div class="tw:w-8 tw:h-3 tw:bg-slate-400 tw:rounded-sm tw:-mt-1" />
        </div>

        <div class="tw:bg-primary tw:rounded-xl tw:p-2 tw:pt-6 tw:shadow-xl">
            <div class="tw:bg-white tw:rounded-lg tw:p-7 tw:shadow-inner">
                <div class="tw:flex tw:items-center tw:gap-3 tw:mb-5">
                    <div
                        class="tw:w-10 tw:h-10 tw:bg-primary/10 tw:rounded-xl tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:border tw:border-primary/20"
                    >
                        <Microscope :size="20" class="tw:text-primary" />
                    </div>
                    <div>
                        <h1 class="tw:text-lg tw:font-bold tw:text-slate-700 tw:leading-none">
                            MicroAI
                        </h1>
                        <p
                            class="tw:text-[11px] tw:uppercase tw:tracking-widest tw:text-slate-400 tw:font-medium tw:mt-0.5"
                        >
                            For instructors and students
                        </p>
                    </div>
                </div>

                <div class="tw:flex tw:gap-1 tw:mb-5">
                    <div class="tw:h-px tw:flex-1 tw:bg-blue-200/70 tw:self-center" />
                    <div class="tw:h-px tw:flex-1 tw:bg-blue-200/70 tw:self-center" />
                </div>

                <McButton
                    class="tw:w-full tw:flex tw:items-center tw:justify-center tw:gap-3 tw:border tw:border-[#6868AC] tw:p-6 tw:bg-white tw:hover:bg-slate-50 tw:cursor-pointer tw:group"
                    @click="onSignInWithCmu"
                >
                    <img :src="CmuLogo" alt="CMU" class="tw:h-6 tw:w-auto tw:object-contain" />
                    <span
                        class="tw:text-sm tw:font-semibold tw:text-slate-600 tw:group-hover:text-slate-800 tw:transition-colors"
                    >
                        Sign in with CMU
                    </span>
                </McButton>

                <div class="tw:flex tw:items-center tw:gap-3 tw:my-5">
                    <div class="tw:flex-1 tw:h-px tw:bg-slate-200" />
                    <span
                        class="tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-widest tw:text-slate-400"
                    >
                        or
                    </span>
                    <div class="tw:flex-1 tw:h-px tw:bg-slate-200" />
                </div>

                <form class="tw:space-y-4" @submit.prevent="onSignIn">
                    <div>
                        <label
                            class="tw:block tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-wider tw:text-slate-400 tw:mb-1.5"
                        >
                            Username
                        </label>
                        <McInput name="username" placeholder="you@institution.edu" />
                    </div>
                    <div>
                        <label
                            class="tw:block tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-wider tw:text-slate-400 tw:mb-1.5"
                        >
                            Password
                        </label>
                        <McInput name="password" type="password" placeholder="••••••" />
                    </div>

                    <McButton type="submit" class="tw:w-full tw:mt-2" @click="onSignIn">
                        Sign in
                    </McButton>
                </form>

                <div class="tw:flex tw:gap-1 tw:mt-6">
                    <div class="tw:h-px tw:flex-1 tw:bg-blue-200/70" />
                    <div class="tw:h-px tw:flex-1 tw:bg-blue-200/70" />
                    <div class="tw:h-px tw:flex-1 tw:bg-blue-200/70" />
                </div>

                <p class="tw:text-center tw:text-[11px] tw:text-slate-300 tw:mt-4 tw:tracking-wide">
                    secured · encrypted session
                </p>
            </div>
        </div>
    </div>
</template>
