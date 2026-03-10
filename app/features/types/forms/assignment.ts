import z from 'zod'

const baseAssignmentSchema = z.object({
    name: z.string().min(1, 'Assignment name is required').max(100, 'Assignment name is too long'),
    dueDate: z.string().min(1, 'Due date is required'),
    classId: z.number().min(1, 'Please select a class'),
    status: z.enum(['active', 'closed']),
    description: z.string().optional(),
    instructions: z.string().optional(),
    points: z.number().min(0).int().optional(),
})

export const createAssignmentFormSchema = baseAssignmentSchema

export const assignmentFormSchema = baseAssignmentSchema.extend({
    id: z.number(),
    submissions: z.number().min(0).int(),
})

export const submissionFormSchema = z.object({
    studentName: z.string().min(1, 'Student name is required'),
    studentEmail: z.string().email('Please enter a valid email'),
    studentIdNumber: z.string().min(1, 'Student ID is required'),
    classId: z.number().min(1, 'Please select a class'),
    assignmentId: z.number(),
    detail: z.string().optional(),
    fileName: z.string().optional(),
})

export type CreateAssignmentFormData = z.infer<typeof createAssignmentFormSchema>
export type AssignmentFormData = z.infer<typeof assignmentFormSchema>
export type SubmissionFormData = z.infer<typeof submissionFormSchema>
