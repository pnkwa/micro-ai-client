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

    // Routes reachable without signing in. The standalone detection tool is opened to anonymous
    // callers by the `detections.allow_public` runtime switch (BE-ADR-013/021): the page itself
    // asks the API whether it may run (GET /detections/availability, anonymous-aware), and the
    // API is the real gate. Forcing sign-in here would make the switch unreachable from the UI.
    const publicPaths = ['/image-detection']
    const isPublic = publicPaths.some((p) => to.path === p || to.path.startsWith(`${p}/`))

    if (!auth.isSignedIn && to.path !== '/sign-in' && !isPublic) {
        return navigateTo('/sign-in', { replace: true })
    }

    // Role gate. Pages opt in with `definePageMeta({ role: 'instructor' })` (or 'admin' /
    // 'student'). Hiding a link in the sidebar never stopped anyone typing the URL, and pages
    // like the dashboard render class-wide data no student should be looking at.
    //
    // This is UX, not a security boundary: the API is what actually enforces access, and
    // must keep doing so. Read the role from the JWT rather than the stored profile: both
    // live in localStorage, but the token is what the API will judge the request on, so the
    // two cannot drift apart. 'admin' additionally checks the staff `role` claim - the same
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
