import { useStorage, StorageSerializers } from '@vueuse/core'
import { useJwt } from '@vueuse/integrations/useJwt'
import { authService, type UserProfile } from '~/services/authService'

export const useAuth = defineStore('auth', () => {
    const userToken = useStorage('userToken', {
        accessToken: '',
        refreshToken: '',
    })
    const user = useStorage<UserProfile | null>('authUser', null, undefined, {
        serializer: StorageSerializers.object,
    })

    const jwtUserInfo = computed(() => {
        if (!userToken.value.accessToken) return null
        const { payload } = useJwt<{
            sub: number
            email: string
            user_type: string
            role?: string
        }>(userToken.value.accessToken)
        // .value, not the ref: useJwt hands back a ComputedRef, and returning it from a
        // computed leaves a ref nested inside a ref. Pinia unwraps only the outer one, so
        // consumers reading `auth.jwtUserInfo?.user_type` silently got undefined.
        return payload.value
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
