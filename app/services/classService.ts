import { z } from 'zod'
import { classRoutes } from './routes/classRoutes'

export const classSchema = z.object({
    id: z.number(),
    name: z.string(),
    semester: z.string(),
    code: z.string(),
    // The staff user who created the class (drives isClassOwner). Nullable: the server column is
    // nullable (older rows backfilled from class_staff), so a null must parse rather than throw.
    created_by: z.number().nullable(),
    // JSON has no Date type - the API sends an ISO string, so this must be z.string() (z.date()
    // expects a real Date and would throw on every class fetch). Matches every other _at schema.
    created_at: z.string(),
    // 'archived' is a soft-hidden class: absent from the lists, but a direct fetch (byId) can
    // still return one, so the schema must accept it.
    status: z.enum(['active', 'closed', 'archived']),
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

// A staff member on a class, flattened by the API for the Manage tab's staff table. `role` is
// derived server-side: 'owner' for the class creator, otherwise the staff's global role with
// 'admin' shown as 'instructor'. `added_at` is when they were linked to the class.
export const classStaffMemberSchema = z.object({
    staff_id: z.number(),
    firstname: z.string(),
    lastname: z.string(),
    email: z.string(),
    role: z.enum(['owner', 'instructor', 'ta']),
    is_owner: z.boolean(),
    added_at: z.string(),
})

export type ClassItem = z.infer<typeof classSchema>
export type StudentRosterItem = z.infer<typeof studentRosterSchema>
export type StudentGrade = z.infer<typeof studentGradeSchema>
export type ClassStaffMember = z.infer<typeof classStaffMemberSchema>

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
    status?: 'active' | 'closed' | 'archived'
}

export const classService = {
    async list(): Promise<ClassItem[]> {
        const { $api } = useNuxtApp()
        const response = await $api(classRoutes.list)
        return z.array(classSchema).parse(response)
    },

    async listEnrolled(): Promise<ClassItem[]> {
        const all = await this.list()
        return all
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

    // The class's staff, flattened for the Manage tab (owner first). Any authed user can read.
    async getStaff(id: number): Promise<ClassStaffMember[]> {
        const { $api } = useNuxtApp()
        const response = await $api(classRoutes.staff(id))
        return z.array(classStaffMemberSchema).parse(response)
    },

    // Assign a staff member by email. The API resolves it (404 unknown / 400 non-staff / 409
    // already assigned) — the caller surfaces those via apiErrorMessage.
    async addStaff(id: number, email: string): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(classRoutes.staff(id), { method: 'POST', body: { email } })
    },
    async removeStaff(class_id: number, staff_id: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(classRoutes.removeStaff(class_id, staff_id), {
            method: 'DELETE',
            body: { staff_id },
        })
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

    // Archive (soft-hide) a class instead of deleting it - the server flips its status to
    // 'archived', dropping it from the class lists without the cascade-delete 409 that DELETE
    // hits once a class has students or assignments. Creator-only (or admin) server-side.
    async archive(id: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(classRoutes.archive(id), { method: 'PATCH' })
    },
}
