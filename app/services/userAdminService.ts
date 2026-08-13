import { z } from 'zod'
import { userAdminRoutes } from './routes/userAdminRoutes'

export const staffRoles = ['admin', 'instructor', 'ta'] as const
export type StaffRole = (typeof staffRoles)[number]

// An account row as the admin endpoints report it. `role` is present for staff, `student_id` for
// students; both are nullable/optional so the same schema parses the list rows, the enriched
// single read, and the leaner create responses. The password hash is never sent by the API.
export const adminUserSchema = z.object({
    userID: z.number(),
    user_type: z.enum(['staff', 'student']),
    email: z.string(),
    firstname: z.string(),
    lastname: z.string(),
    auth_provider: z.enum(['azure', 'local']).optional(),
    // Present on the admin list so the SSO table can show whether JIT-linking has happened yet.
    azure_oid: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
    role: z.enum(staffRoles).nullable().optional(),
    student_id: z.string().nullable().optional(),
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
})

export type AdminUser = z.infer<typeof adminUserSchema>

export interface ListUsersFilters {
    user_type?: 'staff' | 'student'
    role?: StaffRole
    q?: string
}

export interface CreateStaffInput {
    email: string
    firstname: string
    lastname: string
    role: StaffRole
    // Omit both for an SSO-only account; set auth_provider 'local' + a password for a local login.
    auth_provider?: 'azure' | 'local'
    password?: string
}

export interface CreateStudentInput {
    email: string
    firstname: string
    lastname: string
    student_id: string
    auth_provider?: 'azure' | 'local'
    password?: string
    class_id?: number
}

export interface UpdateUserInput {
    firstname?: string
    lastname?: string
    email?: string
    is_active?: boolean
}

export const userAdminService = {
    async list(filters: ListUsersFilters = {}): Promise<AdminUser[]> {
        const { $api } = useNuxtApp()
        const response = await $api(userAdminRoutes.list, {
            query: {
                ...(filters.user_type ? { user_type: filters.user_type } : {}),
                ...(filters.role ? { role: filters.role } : {}),
                ...(filters.q ? { q: filters.q } : {}),
            },
        })
        return z.array(adminUserSchema).parse(response)
    },

    async get(id: number): Promise<AdminUser> {
        const { $api } = useNuxtApp()
        const response = await $api(userAdminRoutes.byId(id))
        return adminUserSchema.parse(response)
    },

    async createStaff(input: CreateStaffInput): Promise<AdminUser> {
        const { $api } = useNuxtApp()
        const response = await $api(userAdminRoutes.staff, {
            method: 'POST',
            body: input,
        })
        return adminUserSchema.parse(response)
    },

    async createStudent(input: CreateStudentInput): Promise<AdminUser> {
        const { $api } = useNuxtApp()
        const response = await $api(userAdminRoutes.student, {
            method: 'POST',
            body: input,
        })
        return adminUserSchema.parse(response)
    },

    async update(id: number, input: UpdateUserInput): Promise<AdminUser> {
        const { $api } = useNuxtApp()
        const response = await $api(userAdminRoutes.byId(id), {
            method: 'PATCH',
            body: input,
        })
        return adminUserSchema.parse(response)
    },

    // Promote/demote a staff member. The backend rejects demoting yourself or the last admin.
    async setRole(id: number, role: StaffRole): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(userAdminRoutes.role(id), {
            method: 'PATCH',
            body: { role },
        })
    },

    async remove(id: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(userAdminRoutes.byId(id), { method: 'DELETE' })
    },
}
