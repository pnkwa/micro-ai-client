import { z } from 'zod'
import { detectionSchema } from './detectionService'

// Shared by the list view and the grading detail view below: same student/assignment header
// either way, the detail view just adds the answer tree.
const submissionBaseSchema = z.object({
    id: z.number(),
    assignment_id: z.number(),
    student_id: z.string(),
    status: z.enum(['submitted', 'graded', 'rejected']),
    score: z.number().nullable(),
    // Total possible points (Σ question points), from the list read - lets a list surface show
    // "score / max_score" without loading the question tree. Absent on the detail read.
    max_score: z.number().nullable().optional(),
    submitted_at: z.string(),
    // Why staff returned this submission to the student to redo; set only when
    // status === 'rejected'. Present on the list read too (BE-ADR-019), which is what lets the
    // student's assignment and exam forms show the reason without fetching the detail.
    rejection_reason: z.string().nullable().optional(),
    // When it was returned. The detail read serializes the whole submission row so this is on
    // the wire beside the reason; the list read whitelists its fields and does not carry it,
    // hence optional. A student redoing work needs the date as much as the reason: their own
    // "Submitted <date>" is right above it, and without this the two cannot be told apart.
    rejected_at: z.string().nullable().optional(),
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
            // An exam is an assignment with is_exam set, and the two have different pages, so
            // anything navigating back to the parent from a submission has to know which one it
            // is. The server serializes the whole assignment relation, so this was on the wire
            // already and only the schema was dropping it.
            is_exam: z.boolean().optional().default(false),
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
    type: z.enum([
        'multiple_choice',
        'multiple_select',
        'fill_in',
        'image_detection',
        'slide_identification',
    ]),
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
    // Exam slide_identification: the slide label the student self-reported; null otherwise.
    // Text, matching slideCollectionService's slideSchema; a label may carry a letter code.
    slide_number: z.string().nullable().optional(),
    // What the student actually typed in the Slide field, before normalization. A label outside
    // the canonical pattern normalizes to null (BE-ADR-017 keeps it out of the way of the upload
    // rather than failing it), and the instructor grading that answer is exactly who needs to
    // read it. Optional: absent until the server stores it, which is why the card falls back to
    // the canonical form.
    slide_number_raw: z.string().nullable().optional(),
    // image_detection / slide_identification: the ML run on the attached image; null otherwise.
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

    // Return the submission to the student to redo, with a required reason (shown to them).
    // Only valid on a `submitted` submission; the server 400s a graded/already-rejected one.
    async reject(submissionId: number, reason: string): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(`/submissions/${submissionId}/reject`, {
            method: 'PATCH',
            body: { reason },
        })
    },
}
