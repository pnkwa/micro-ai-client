import { z } from 'zod'
import { detectionSchema } from './detectionService'

// Shared by the list view and the grading detail view below: same student/assignment header
// either way, the detail view just adds the answer tree.
const submissionBaseSchema = z.object({
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

const submissionViewSchema = submissionBaseSchema

export type SubmissionView = z.infer<typeof submissionViewSchema>

// ---- grading detail (GET /submissions/:id) -------------------------------------------

const gradingQuestionSchema = z.object({
    id: z.number(),
    exercise_id: z.number(),
    position: z.number(),
    type: z.enum(['multiple_choice', 'multiple_select', 'fill_in', 'image_detection']),
    prompt: z.string(),
    points: z.number(),
    options: z.array(z.string()),
    accepted_answers: z.array(z.string()).optional(),
})

const gradingAnswerSchema = z.object({
    question_id: z.number(),
    question: gradingQuestionSchema,
    response_text: z.string().nullable(),
    selected_options: z.array(z.string()),
    // image_detection only; null for every other question type.
    detection: detectionSchema.nullable(),
    // Autograder / detection suggestion: advisory, instructor confirms via is_correct/points_awarded.
    auto_is_correct: z.boolean().nullable(),
    auto_points: z.number().nullable(),
    needs_review: z.boolean(),
    is_correct: z.boolean().nullable(),
    points_awarded: z.number().nullable(),
    comment: z.string().nullable(),
})

const submissionDetailSchema = submissionBaseSchema.extend({
    answers: z.array(gradingAnswerSchema),
})

export type GradingQuestion = z.infer<typeof gradingQuestionSchema>
export type GradingAnswer = z.infer<typeof gradingAnswerSchema>
export type SubmissionDetail = z.infer<typeof submissionDetailSchema>

// Instructor override of one answer's final grade. `comment`: omit to leave an existing
// comment untouched, send explicit `null` to clear it; mirrors ReviewAnswerDto server-side.
export interface ReviewAnswerInput {
    is_correct?: boolean
    points_awarded?: number
    comment?: string | null
}

export const submissionService = {
    // Submit an assignment. Multipart: `assignment_id`, an `answers` JSON string, and one
    // `image_<questionId>` part per image_detection answer. One submission per student per
    // assignment; re-submitting replaces the previous one (BE-ADR-005).
    async create(payload: FormData): Promise<void> {
        const { $api } = useNuxtApp()
        await $api('/submissions', { method: 'POST', body: payload })
    },

    async list(): Promise<SubmissionView[]> {
        const { $api } = useNuxtApp()
        const response = await $api('/submissions')
        return z.array(submissionViewSchema).parse(response)
    },

    async listByAssignment(assignmentId: number): Promise<SubmissionView[]> {
        const { $api } = useNuxtApp()
        const response = await $api(`/submissions?assignment_id=${assignmentId}`)
        return z.array(submissionViewSchema).parse(response)
    },

    // Grading page read: the full answer tree (question, detection, boxes) behind one
    // submission. Staff-only in practice (a student hitting this gets their own, key-stripped).
    async getById(id: number): Promise<SubmissionDetail> {
        const { $api } = useNuxtApp()
        const response = await $api(`/submissions/${id}`)
        return submissionDetailSchema.parse(response)
    },

    async reviewAnswer(
        submissionId: number,
        questionId: number,
        dto: ReviewAnswerInput,
    ): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(`/submissions/${submissionId}/answers/${questionId}`, {
            method: 'PATCH',
            body: dto,
        })
    },

    // Locks in the total score and flips status to `graded`. Server rejects this while any
    // answer still needs_review; review every answer first.
    async finalize(submissionId: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(`/submissions/${submissionId}/finalize`, { method: 'PATCH' })
    },
}
