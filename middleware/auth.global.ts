export default defineNuxtRouteMiddleware(async (to, from) => {
    const staffStore = useStaff()
    const breadcrumb = useBreadcrumb()
    const accessToken = staffStore.userToken?.accessToken

    // Check if user has a valid token (not empty string)
    const hasValidToken = accessToken && accessToken.trim() !== ''

    // If user has token and trying to access login, redirect to dashboard
    if (hasValidToken && to.path === '/login') {
        return navigateTo('/', { replace: true })
    }

    // If user doesn't have token and trying to access protected route, redirect to login
    if (!hasValidToken && to.path !== '/login') {
        return navigateTo('/login', { replace: true })
    }

    if (to.fullPath !== from.fullPath) {
        breadcrumb.clearBreadcrumbs()
    }

    if (!staffStore.isLoggedIn) {
        return
    }

    if (!staffStore.userConfig) {
        await staffStore.handleFetchConfig()
    }
    const hasPermission = staffStore.hasPermissionPath(to.path)

    if (!hasPermission) {
        return navigateTo('/', { replace: true })
    }

    return
})
