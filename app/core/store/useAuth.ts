import { useStorage } from '@vueuse/core'
import { useJwt } from '@vueuse/integrations/useJwt'
import { authService, type UserProfile } from '~/services/authService'

export const useAuth = defineStore('auth', () => {
    const userToken = useStorage('userToken', {
        accessToken: '',
        refreshToken: '',
    })
    const user = useStorage<UserProfile | null>('authUser', null)

    const jwtUserInfo = computed(() => {
        if (!userToken.value.accessToken) return null
        const { payload } = useJwt<{
            sub: number
            email: string
            user_type: string
            role?: string
        }>(userToken.value.accessToken)
        return payload
    })

    const isSignedIn = computed(() => !!userToken.value.accessToken.trim())

    const signIn = async (credentials: {
        username: string
        password: string
    }): Promise<boolean> => {
        try {
            const token = await authService.login(credentials)
            userToken.value = { accessToken: token, refreshToken: '' }
            const profile = await authService.getProfile()
            user.value = profile
            return true
        } catch {
            return false
        }
    }

    const signInWithCMU = () => {
        const mockAccessToken = 'mock_cmu_access_token_' + Date.now()

        userToken.value = { accessToken: mockAccessToken, refreshToken: '' }

        user.value = {
            id: 3,
            email: 'cmu@cmu.ac.th',
            firstname: 'CMU',
            lastname: 'User',
            user_type: 'staff',
            role: 'instructor',
        }
    }

    const signOut = () => {
        user.value = null
        userToken.value = { accessToken: '', refreshToken: '' }
    }

    return {
        user,
        userToken,
        signIn,
        signInWithCMU,
        signOut,
        jwtUserInfo,
        isSignedIn,
    }
})
