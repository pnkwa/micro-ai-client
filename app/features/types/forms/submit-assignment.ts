import z from 'zod'
import { FILE_MIME_TYPES, FILE_SIZE } from '~/core/constant/file'

export const submitAssignmentFormSchema = z.object({
    studentName: z.string().min(1, 'Full name is required'),
    studentEmail: z.string().email('Invalid email address'),
    studentIdNumber: z.string().min(1, 'Student ID is required'),
    classId: z.number().min(1, 'Class is required'),
    details: z.string().nullable().optional(),
    assignmentFile: z
        .file()
        .min(FILE_SIZE.MIN, { message: 'File is too small or empty' })
        .max(FILE_SIZE.MAX, { message: 'File must be less than 10MB' })
        .mime([...FILE_MIME_TYPES], { message: 'Only PDF or DOCX files are allowed' })
        .nullable()
        .optional(),
})

export type SubmitAssignmentFormData = z.infer<typeof submitAssignmentFormSchema>
