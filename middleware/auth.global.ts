export default defineNuxtRouteMiddleware((to) => {
    const authStore = useAuth()
    const role = authStore.user?.role
    const accessToken = authStore.userToken?.accessToken
    const hasValidToken = accessToken && accessToken.trim() !== ''

    if (hasValidToken && to.path === '/login') {
        if (role === 'instructor') {
            return navigateTo('/dashboard', { replace: true })
        }
        return navigateTo('/assignments', { replace: true })
    }

    if (!hasValidToken) {
        const isAssignments = to.path.startsWith('/assignments')
        const isImageDetection = to.path.startsWith('/image-detection')
        const isRoot = to.path === '/' || to.path === '/login'

        if (isAssignments || isImageDetection || isRoot) {
            return
        }

        return navigateTo('/assignments', { replace: true })
    }

    if (role === 'instructor') {
        return
    }

    const isAssignments = to.path.startsWith('/assignments')
    const isImageDetection = to.path.startsWith('/image-detection')

    if (!isAssignments && !isImageDetection) {
        return navigateTo('/assignments', { replace: true })
    }

    return
})
