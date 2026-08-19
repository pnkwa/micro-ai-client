import { z } from 'zod'
import { examRoutes } from './routes/examRoutes'
import { assignmentSchema, assignmentListItemSchema } from './assignmentService'

// An exam is an assignment (is_exam = true) with a slide collection, an open/close window and a
// confidence threshold. The tree (exercises + slide_identification questions) is authored via
// the ordinary /exercises + /questions endpoints, so examService only owns the exam scalars.
const examExtraFields = {
    is_exam: z.boolean(),
    slide_collection_id: z.number().nullable(),
    exam_opens_at: z.string().nullable(),
    exam_closes_at: z.string().nullable(),
    exam_confidence_threshold: z.number().nullable(),
}

// GET /exams/:id - the full tree plus exam scalars.
const examSchema = assignmentSchema.extend(examExtraFields)

// GET /exams - full rows, scalars only (no tree); still carries the exam window.
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
    slideCollectionId: number
    examOpensAt?: string
    examClosesAt?: string
    examConfidenceThreshold?: number
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
                exam_opens_at: payload.examOpensAt,
                exam_closes_at: payload.examClosesAt,
                exam_confidence_threshold: payload.examConfidenceThreshold,
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
        if (payload.examOpensAt !== undefined) body.exam_opens_at = payload.examOpensAt
        if (payload.examClosesAt !== undefined) body.exam_closes_at = payload.examClosesAt
        if (payload.examConfidenceThreshold !== undefined)
            body.exam_confidence_threshold = payload.examConfidenceThreshold
        const response = await $api(examRoutes.byId(id), { method: 'PATCH', body })
        return examSchema.parse(response)
    },

    // 409 with a submission count unless force; mirrors assignmentService.remove.
    async remove(id: number, force = false): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(`${examRoutes.byId(id)}${force ? '?force=true' : ''}`, { method: 'DELETE' })
    },
}
