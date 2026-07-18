import z from 'zod'

export const enrollStudentFormSchema = z.object({
    student_id: z.string().trim().length(9, 'Student ID must be exactly 9 characters'),
    email: z.string().trim().email('Enter a valid email'),
    firstname: z.string().trim().min(1, 'First name is required'),
    lastname: z.string().trim().min(1, 'Last name is required'),
})

export type EnrollStudentFormData = z.infer<typeof enrollStudentFormSchema>
