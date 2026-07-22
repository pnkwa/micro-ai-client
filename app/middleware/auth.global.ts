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

    // Role gate. Pages opt in with `definePageMeta({ role: 'instructor' })`. Hiding a link
    // in the sidebar never stopped anyone typing the URL, and pages like the dashboard
    // render class-wide data no student should be looking at.
    //
    // This is UX, not a security boundary: the API is what actually enforces access, and
    // must keep doing so. Read the role from the JWT rather than the stored profile: both
    // live in localStorage, but the token is what the API will judge the request on, so the
    // two cannot drift apart.
    const requiredRole = to.meta.role
    if (requiredRole && auth.isSignedIn) {
        const isInstructor = (auth.jwtUserInfo?.user_type ?? auth.user?.user_type) === 'staff'
        const allowed = requiredRole === 'instructor' ? isInstructor : !isInstructor
        if (!allowed) {
            return navigateTo('/', { replace: true })
        }
    }
})
