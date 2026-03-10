import z from 'zod'

const baseClassSchema = z.object({
    name: z.string().min(1, 'Class name is required').max(100, 'Class name is too long'),
    semester: z.string().min(1, 'Semester is required'),
    students: z.number().min(0, 'Students must be 0 or more').int('Must be a whole number'),
    status: z.enum(['active', 'closed']),
})

export const createClassFormSchema = baseClassSchema

export const classFormSchema = baseClassSchema.extend({
    id: z.number(),
})

export type ClassFormData = z.infer<typeof classFormSchema>
export type CreateClassFormData = z.infer<typeof createClassFormSchema>
export type EditClassFormData = z.infer<typeof classFormSchema>
