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

// The roster read is paged: `total` counts what the search matched before paging, which is what
// a pager needs - the rows in `data` are only the requested page.
export const studentRosterPageSchema = z.object({
    data: z.array(studentRosterSchema),
    total: z.number(),
})

// Per-student running grade in a class: points earned over points possible, graded work only.
// Only students with at least one graded submission are returned (the roster fills the rest).
export const studentGradeSchema = z.object({
    student_id: z.string(),
    earned: z.number(),
    possible: z.number(),
})

export type ClassItem = z.infer<typeof classSchema>
export type StudentRosterItem = z.infer<typeof studentRosterSchema>
export type StudentGrade = z.infer<typeof studentGradeSchema>

export interface EnrollStudentInput {
    student_id: string
    email: string
    firstname: string
    lastname: string
}

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

    async listEnrolled(userId: number): Promise<ClassItem[]> {
        const all = await this.list()
        const rosters = await Promise.all(
            all.map((c) => this.getStudents(c.id).catch(() => ({ data: [], total: 0 }))),
        )
        return all.filter((_, i) => rosters[i]?.data.some((s) => s.userID === userId))
    },

    async getById(id: number): Promise<ClassItem> {
        const { $api } = useNuxtApp()
        const response = await $api(classRoutes.byId(id))
        return classSchema.parse(response)
    },

    /**
     * A class roster. `total` is what the search matched before paging, so a pager can be sized
     * from it; omit `perPage` and the whole roster comes back with `total` equal to its length.
     *
     * Search belongs to the query, not the caller: filtering a fetched page client-side would
     * only ever match the rows that page happened to hold.
     */
    async getStudents(
        id: number,
        params: { page?: number; perPage?: number; q?: string } = {},
    ): Promise<{ data: StudentRosterItem[]; total: number }> {
        const { $api } = useNuxtApp()
        const response = await $api(classRoutes.students(id), {
            query: {
                ...(params.page !== undefined && { page: params.page }),
                ...(params.perPage !== undefined && { per_page: params.perPage }),
                ...(params.q ? { q: params.q } : {}),
            },
        })
        return studentRosterPageSchema.parse(response)
    },

    // Staff-only: each student's running grade (earned/possible over graded work).
    async getGrades(id: number): Promise<StudentGrade[]> {
        const { $api } = useNuxtApp()
        const response = await $api(classRoutes.grades(id))
        return z.array(studentGradeSchema).parse(response)
    },

    async enroll(id: number, students: EnrollStudentInput[]): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(classRoutes.students(id), { method: 'POST', body: { students } })
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
