import { z } from 'zod'
import { authRoutes } from './routes/authRoutes'

const loginResponseSchema = z.object({
    access_token: z.string(),
})

const profileSchema = z.object({
    id: z.number(),
    email: z.string(),
    firstname: z.string(),
    lastname: z.string(),
    user_type: z.enum(['staff', 'student']),
    role: z.enum(['admin', 'instructor', 'ta']).nullable().optional(),
})

export type UserProfile = z.infer<typeof profileSchema>

export const authService = {
    async login(credentials: { username: string; password: string }): Promise<string> {
        const { $api } = useNuxtApp()
        const response = await $api(authRoutes.login, {
            method: 'POST',
            body: credentials,
        })
        return loginResponseSchema.parse(response).access_token
    },

    async getProfile(): Promise<UserProfile> {
        const { $api } = useNuxtApp()
        const response = await $api(authRoutes.profile)
        return profileSchema.parse(response)
    },
}
