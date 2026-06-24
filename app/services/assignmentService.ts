import { z } from 'zod'
import { assignmentRoutes } from './routes/assignmentRoutes'
import type { CreateAssignmentFormData } from '~/features/types/forms/assignment'

const attachmentSchema = z.object({
    id: z.number(),
    assignment_id: z.number(),
    filename: z.string(),
    path: z.string(),
    created_at: z.string(),
})

const questionSchema = z.object({
    id: z.number(),
    exercise_id: z.number(),
    type: z.enum(['multiple_choice', 'multiple_select', 'fill_in', 'image_detection']),
    prompt: z.string(),
    position: z.number(),
    points: z.number().nullable().optional(),
    options: z.array(z.string()),
    accepted_answers: z.array(z.string()).optional(),
    created_at: z.string(),
    updated_at: z.string(),
})

const exerciseSchema = z.object({
    id: z.number(),
    assignment_id: z.number(),
    title: z.string(),
    instructions: z.string().nullable(),
    position: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
    questions: z.array(questionSchema),
})

// Returned by GET /assignments (list) — scalars only, no tree
const assignmentListItemSchema = z.object({
    id: z.number(),
    class_id: z.number(),
    name: z.string(),
    description: z.string().nullable(),
    instructions: z.string().nullable(),
    due_date: z.string(),
    points: z.number().nullable(),
    status: z.enum(['active', 'closed']),
    created_at: z.string(),
    updated_at: z.string(),
})

// Returned by GET /assignments/:id — full tree via toAssignmentView
const assignmentSchema = assignmentListItemSchema.extend({
    attachments: z.array(attachmentSchema),
    exercises: z.array(exerciseSchema),
})

export type AssignmentListItem = z.infer<typeof assignmentListItemSchema>
export type Assignment = z.infer<typeof assignmentSchema>

export const assignmentService = {
    async list(): Promise<AssignmentListItem[]> {
        const { $api } = useNuxtApp()
        const response = await $api(assignmentRoutes.list)
        return z.array(assignmentListItemSchema).parse(response)
    },

    async listByClass(classId: number): Promise<AssignmentListItem[]> {
        const { $api } = useNuxtApp()
        const response = await $api(`${assignmentRoutes.list}?class_id=${classId}`)
        return z.array(assignmentListItemSchema).parse(response)
    },

    async getById(id: number): Promise<Assignment> {
        const { $api } = useNuxtApp()
        const response = await $api(assignmentRoutes.byId(id))
        return assignmentSchema.parse(response)
    },

    async create(payload: CreateAssignmentFormData): Promise<Assignment> {
        const { $api } = useNuxtApp()
        const response = await $api(assignmentRoutes.list, {
            method: 'POST',
            body: {
                class_id: payload.classId,
                name: payload.name,
                due_date: payload.dueDate,
                status: payload.status,
                description: payload.description,
                instructions: payload.instructions,
                points: payload.points,
                attachments: payload.attachments,
            },
        })
        return assignmentSchema.parse(response)
    },

    async update(
        id: number,
        payload: Partial<Omit<CreateAssignmentFormData, 'classId'>>,
    ): Promise<Assignment> {
        const { $api } = useNuxtApp()
        const body: Record<string, unknown> = {}
        if (payload.name !== undefined) body.name = payload.name
        if (payload.dueDate !== undefined) body.due_date = payload.dueDate
        if (payload.status !== undefined) body.status = payload.status
        if (payload.description !== undefined) body.description = payload.description
        if (payload.instructions !== undefined) body.instructions = payload.instructions
        if (payload.points !== undefined) body.points = payload.points
        const response = await $api(assignmentRoutes.byId(id), { method: 'PATCH', body })
        return assignmentSchema.parse(response)
    },

    async remove(id: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.byId(id), { method: 'DELETE' })
    },

    // ---- exercises ----

    async addExercise(
        assignmentId: number,
        payload: { title: string; instructions?: string },
    ): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.exercises(assignmentId), { method: 'POST', body: payload })
    },

    async updateExercise(
        exerciseId: number,
        payload: { title?: string; instructions?: string },
    ): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.exerciseById(exerciseId), { method: 'PATCH', body: payload })
    },

    async removeExercise(exerciseId: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.exerciseById(exerciseId), { method: 'DELETE' })
    },

    // ---- questions ----

    async addQuestion(
        exerciseId: number,
        payload: {
            type: string
            prompt: string
            options?: string[]
            accepted_answers?: string[]
            points?: number
        },
    ): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.questions(exerciseId), { method: 'POST', body: payload })
    },

    async updateQuestion(
        questionId: number,
        payload: {
            prompt?: string
            options?: string[]
            accepted_answers?: string[]
            points?: number
        },
    ): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.questionById(questionId), { method: 'PATCH', body: payload })
    },

    async removeQuestion(questionId: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.questionById(questionId), { method: 'DELETE' })
    },
}
