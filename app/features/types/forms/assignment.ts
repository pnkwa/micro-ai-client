import z from 'zod'

export const attachmentSchema = z.object({
    path: z.string().url('Must be a valid URL'),
    /**
     * What the link is called where it is listed. Optional: left blank, the service falls back to
     * deriving one from the URL, which is what it always did. That fallback is fine for
     * `.../lab-guide.pdf` and useless for anything with an opaque path - a Google Doc derives to
     * "edit" - which is the whole reason this is authorable.
     */
    filename: z.string().max(100, 'Link name is too long').optional(),
})

const baseAssignmentSchema = z.object({
    name: z.string().min(1, 'Assignment name is required').max(100, 'Assignment name is too long'),
    dueDate: z.string().min(1, 'Due date is required'),
    classId: z.number().min(1, 'Please select a class'),
    status: z.enum(['active', 'closed']),
    description: z.string().optional(),
    instructions: z.string().optional(),
    attachments: z.array(attachmentSchema).optional(),
})

export const createAssignmentFormSchema = baseAssignmentSchema

export const assignmentFormSchema = baseAssignmentSchema.extend({
    id: z.number(),
    submissions: z.number().min(0).int(),
})

export type CreateAssignmentFormData = z.infer<typeof createAssignmentFormSchema>
export type AssignmentFormData = z.infer<typeof assignmentFormSchema>
