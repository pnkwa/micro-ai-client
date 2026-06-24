import { z } from 'zod'
import { classRoutes } from './routes/classRoutes'

export const classSchema = z.object({
    id: z.number(),
    name: z.string(),
    semester: z.string(),
    code: z.string(),
    status: z.enum(['active', 'closed']),
})

export const studentRosterSchema = z.object({
    student_id: z.string(),
    userID: z.number(),
    user: z.object({
        email: z.string(),
        firstname: z.string(),
        lastname: z.string(),
    }),
})

export type ClassItem = z.infer<typeof classSchema>
export type StudentRosterItem = z.infer<typeof studentRosterSchema>

export interface CreateClassPayload {
    name: string
    semester: string
    code: string
    status?: 'active' | 'closed'
}

export interface UpdateClassPayload {
    name?: string
    semester?: string
    code?: string
    status?: 'active' | 'closed'
}

export const classService = {
    async list(): Promise<ClassItem[]> {
        const { $api } = useNuxtApp()
        const response = await $api(classRoutes.list)
        return z.array(classSchema).parse(response)
    },

    async getById(id: number): Promise<ClassItem> {
        const { $api } = useNuxtApp()
        const response = await $api(classRoutes.byId(id))
        return classSchema.parse(response)
    },

    async getStudents(id: number): Promise<StudentRosterItem[]> {
        const { $api } = useNuxtApp()
        const response = await $api(classRoutes.students(id))
        return z.array(studentRosterSchema).parse(response)
    },

    async create(payload: CreateClassPayload): Promise<ClassItem> {
        const { $api } = useNuxtApp()
        const response = await $api(classRoutes.list, { method: 'POST', body: payload })
        return classSchema.parse(response)
    },

    async update(id: number, payload: UpdateClassPayload): Promise<ClassItem> {
        const { $api } = useNuxtApp()
        const response = await $api(classRoutes.byId(id), { method: 'PATCH', body: payload })
        return classSchema.parse(response)
    },

    async remove(id: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(classRoutes.byId(id), { method: 'DELETE' })
    },
}
