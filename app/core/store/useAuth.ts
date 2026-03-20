import { useStorage } from '@vueuse/core'
import { useJwt } from '@vueuse/integrations/useJwt'

type UserRole = 'instructor' | 'student'

interface User {
    classId?: number[]
    userId: number
    name: string
    username: string
    role: UserRole
}

export const useAuth = defineStore('auth', () => {
    const userToken = useStorage('userToken', {
        accessToken: '',
        refreshToken: '',
    })
    const user = useStorage<User | null>('authUser', null)

    const jwtUserInfo = computed(() => {
        if (!userToken.value.accessToken) return null

        const accessToken = userToken.value.accessToken
        const { payload } = useJwt<User>(accessToken)
        return payload
    })

    const isLoggedIn = computed(() => {
        return userToken.value.accessToken && userToken.value.accessToken.trim() !== ''
    })

    const login = (credentials: { username: string; password: string }) => {
        const { username, password } = credentials

        // Mock credentials:
        // - Instructor: admin@microai.com / 123456
        // - Student:   student@microai.com / 123456
        const isInstructor = username === 'admin@microai.com' && password === '123456'
        const isStudentUser = username === 'student@microai.com' && password === '123456'

        if (!isInstructor && !isStudentUser) {
            return false
        }

        // Mock JWT tokens
        const mockAccessToken = 'mock_access_token_' + Date.now()
        const mockRefreshToken = 'mock_refresh_token_' + Date.now()

        userToken.value = {
            accessToken: mockAccessToken,
            refreshToken: mockRefreshToken,
        }

        if (isInstructor) {
            user.value = {
                userId: 1,
                name: 'Instructor',
                username: 'admin@microai.com',
                role: 'instructor',
            }
        } else {
            user.value = {
                userId: 2,
                name: 'Student',
                username: 'student@microai.com',
                role: 'student',
            }
        }

        return true
    }
    const logout = () => {
        user.value = null
        userToken.value = {
            accessToken: '',
            refreshToken: '',
        }
    }

    return {
        user,
        login,
        logout,
        jwtUserInfo,
        isLoggedIn,
    }
})
