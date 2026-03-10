type UserRole = 'teacher' | 'student'

interface User {
    id: number
    name: string
    email: string
    avatar?: string
    role: UserRole
}

export const useAuth = defineStore('auth', () => {
    const user = ref<User | null>(null)
    const isAuthenticated = computed(() => !!user.value)
    const isTeacher = computed(() => user.value?.role === 'teacher')

    const login = (credentials: { email: string; password: string }) => {
        // Mock credentials for testing - teacher login only
        if (credentials.email === 'teacher@microai.com' && credentials.password === 'password123') {
            user.value = {
                id: 1,
                name: 'Teacher User',
                email: credentials.email,
                role: 'teacher',
            }
            return true
        }
        return false
    }
    const logout = () => {
        user.value = null
    }

    const getInitials = computed(() => {
        if (!user.value) return ''
        return user.value.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    })

    return {
        user,
        isAuthenticated,
        isTeacher,
        login,
        logout,
        getInitials,
    }
})
