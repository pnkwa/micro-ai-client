import z from 'zod'

const baseClassSchema = z.object({
    name: z.string().min(1, 'Class name is required').max(100, 'Class name is too long'),
    semester: z.string().min(1, 'Semester is required'),
    code: z.string().min(1, 'Class code is required').max(20, 'Code is too long'),
    status: z.enum(['active', 'closed']),
})

// Create never produces an archived class - status stays active/closed.
export const createClassFormSchema = baseClassSchema

// Edit tolerates a loaded 'archived' class (set via the Archive action, not this dropdown, which
// still only offers active/closed) so its initial values satisfy the form type.
export const classFormSchema = baseClassSchema.extend({
    id: z.number(),
    status: z.enum(['active', 'closed', 'archived']),
})

export type ClassFormData = z.infer<typeof classFormSchema>
export type CreateClassFormData = z.infer<typeof createClassFormSchema>
export type EditClassFormData = z.infer<typeof classFormSchema>
