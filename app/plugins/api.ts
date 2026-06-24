export default defineNuxtPlugin(() => {
    const config = useRuntimeConfig()

    const api = $fetch.create({
        baseURL: config.public.apiBaseUrl as string,

        onRequest({ options }) {
            const auth = useAuth()
            const token = auth.userToken?.accessToken
            if (token) {
                options.headers = new Headers(options.headers)
                options.headers.set('Authorization', `Bearer ${token}`)
            }
        },

        async onResponseError({ response }) {
            if (response.status === 401) {
                const auth = useAuth()
                auth.signOut()
                await navigateTo('/sign-in')
            }
        },
    })

    return {
        provide: { api },
    }
})
