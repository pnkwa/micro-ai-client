export default defineNuxtRouteMiddleware(async (to, from) => {
    const config = useRuntimeConfig()
    const breadcrumb = useBreadcrumb()

    if (to.fullPath !== from.fullPath) {
        breadcrumb.clearBreadcrumbs()
    }

    if (config.public.authDisabled) {
        return
    }

    const auth = useAuth()

    if (auth.isSignedIn && to.path === '/sign-in') {
        return navigateTo('/', { replace: true })
    }

    if (!auth.isSignedIn && to.path !== '/sign-in') {
        return navigateTo('/sign-in', { replace: true })
    }
})
