import { z } from 'zod'

const submissionViewSchema = z.object({
    id: z.number(),
    assignment_id: z.number(),
    student_id: z.string(),
    status: z.enum(['submitted', 'graded']),
    score: z.number().nullable(),
    submitted_at: z.string(),
    student: z
        .object({
            student_id: z.string(),
            user: z.object({
                firstname: z.string(),
                lastname: z.string(),
            }),
        })
        .nullable(),
    assignment: z
        .object({
            id: z.number(),
            name: z.string(),
            due_date: z.string().nullable(),
            class: z.object({ id: z.number(), name: z.string() }).nullable(),
        })
        .nullable(),
})

export type SubmissionView = z.infer<typeof submissionViewSchema>

export const submissionService = {
    async listByAssignment(assignmentId: number): Promise<SubmissionView[]> {
        const { $api } = useNuxtApp()
        const response = await $api(`/submissions?assignment_id=${assignmentId}`)
        return z.array(submissionViewSchema).parse(response)
    },
}
