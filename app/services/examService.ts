import { z } from 'zod'
import { examRoutes } from './routes/examRoutes'
import { assignmentSchema, assignmentListItemSchema } from './assignmentService'

// An exam is an assignment with `is_exam` set. The tree (sections + slide_identification questions)
// is authored via the ordinary /sections + /questions endpoints, so examService only owns the flag.
//
// Everything else that used to live here moved in v0.7. The window became `opens_at`/`closes_at` on
// every assignment (BE-ADR-033), so it is inherited from the assignment schemas rather than
// redeclared. `slide_collection_id` and `exam_confidence_threshold` moved onto the question's
// `image_question` (BE-ADR-034) and are no longer on an exam read at all - `POST /exams` still
// ACCEPTS a top-level `slide_collection_id` and fans it out onto every question, which is why
// authoring below still sends one.
const examExtraFields = {
    is_exam: z.boolean(),
}

// GET /exams/:id - the full tree plus exam scalars.
const examSchema = assignmentSchema.extend(examExtraFields)

// GET /exams - full rows, scalars only (no tree); the window rides on the assignment fields.
const examListItemSchema = assignmentListItemSchema.extend(examExtraFields)

export type Exam = z.infer<typeof examSchema>
export type ExamListItem = z.infer<typeof examListItemSchema>

export interface CreateExamInput {
    classId: number
    name: string
    dueDate: string
    status: 'active' | 'closed'
    description?: string
    instructions?: string
    /**
     * Sent at the top level on create and update, where the server fans it out onto every
     * question's `image_question` (BE-ADR-034). It is NOT on an exam read any more: to display
     * which collection is in use, read it off a question.
     */
    slideCollectionId: number
    /** The window, renamed off `exam_*` in v0.7 and now shared with regular assignments. */
    opensAt?: string
    closesAt?: string
}

export type UpdateExamInput = Partial<Omit<CreateExamInput, 'classId'>>

export const examService = {
    /**
     * Every exam the caller can see, across classes - for a student that is their enrolled classes'
     * exams, scoped by the API. Used to name the exam that is withholding the AI tool, which is a
     * question about the student and not about one class.
     */
    async listMine(): Promise<ExamListItem[]> {
        const { $api } = useNuxtApp()
        const response = await $api(examRoutes.list)
        return z.array(examListItemSchema).parse(response)
    },

    async listByClass(classId: number): Promise<ExamListItem[]> {
        const { $api } = useNuxtApp()
        const response = await $api(`${examRoutes.list}?class_id=${classId}`)
        return z.array(examListItemSchema).parse(response)
    },

    async getById(id: number): Promise<Exam> {
        const { $api } = useNuxtApp()
        const response = await $api(examRoutes.byId(id))
        return examSchema.parse(response)
    },

    async create(payload: CreateExamInput): Promise<Exam> {
        const { $api } = useNuxtApp()
        const response = await $api(examRoutes.list, {
            method: 'POST',
            body: {
                class_id: payload.classId,
                name: payload.name,
                due_date: payload.dueDate,
                status: payload.status,
                description: payload.description,
                instructions: payload.instructions,
                slide_collection_id: payload.slideCollectionId,
                opens_at: payload.opensAt,
                closes_at: payload.closesAt,
            },
        })
        return examSchema.parse(response)
    },

    async update(id: number, payload: UpdateExamInput): Promise<Exam> {
        const { $api } = useNuxtApp()
        const body: Record<string, unknown> = {}
        if (payload.name !== undefined) body.name = payload.name
        if (payload.dueDate !== undefined) body.due_date = payload.dueDate
        if (payload.status !== undefined) body.status = payload.status
        if (payload.description !== undefined) body.description = payload.description
        if (payload.instructions !== undefined) body.instructions = payload.instructions
        if (payload.slideCollectionId !== undefined)
            body.slide_collection_id = payload.slideCollectionId
        if (payload.opensAt !== undefined) body.opens_at = payload.opensAt
        if (payload.closesAt !== undefined) body.closes_at = payload.closesAt
        const response = await $api(examRoutes.byId(id), { method: 'PATCH', body })
        return examSchema.parse(response)
    },

    // 409 with a submission count unless force; mirrors assignmentService.remove.
    async remove(id: number, force = false): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(`${examRoutes.byId(id)}${force ? '?force=true' : ''}`, { method: 'DELETE' })
    },
}
