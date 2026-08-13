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

    // Role gate. Pages opt in with `definePageMeta({ role: 'instructor' })` (or 'admin' /
    // 'student'). Hiding a link in the sidebar never stopped anyone typing the URL, and pages
    // like the dashboard render class-wide data no student should be looking at.
    //
    // This is UX, not a security boundary: the API is what actually enforces access, and
    // must keep doing so. Read the role from the JWT rather than the stored profile: both
    // live in localStorage, but the token is what the API will judge the request on, so the
    // two cannot drift apart. 'admin' additionally checks the staff `role` claim — the same
    // claim the backend's RolesGuard reads on the admin-only routes.
    const requiredRole = to.meta.role
    if (requiredRole && auth.isSignedIn) {
        const userType = auth.jwtUserInfo?.user_type ?? auth.user?.user_type
        const role = auth.jwtUserInfo?.role ?? auth.user?.role
        const isStaff = userType === 'staff'
        const allowed =
            requiredRole === 'admin'
                ? isStaff && role === 'admin'
                : requiredRole === 'instructor'
                  ? isStaff
                  : !isStaff
        if (!allowed) {
            return navigateTo('/', { replace: true })
        }
    }
})
