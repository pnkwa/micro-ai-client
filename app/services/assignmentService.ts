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
    // While unreleased, students never see this exercise at all (backend omits it from
    // their read entirely), and its own content is locked against edits server-side;
    // release/un-release is the one action always allowed regardless of this flag.
    released: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
    questions: z.array(questionSchema),
})

// Returned by GET /assignments (list): scalars only, no tree
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

// Returned by GET /assignments/:id: full tree via toAssignmentView
const assignmentSchema = assignmentListItemSchema.extend({
    attachments: z.array(attachmentSchema),
    exercises: z.array(exerciseSchema),
})

export type AssignmentListItem = z.infer<typeof assignmentListItemSchema>
export type Assignment = z.infer<typeof assignmentSchema>

// The only source of truth for "how many points is this assignment worth": the backend's
// own computeScore() sums per-answer points the same way, never reading assignments.points
// (a disconnected, manually-typed field that's easy to leave stale once questions are added
// or edited after the fact).
export const assignmentTotalPoints = (assignment: Assignment): number =>
    assignment.exercises.flatMap((ex) => ex.questions).reduce((sum, q) => sum + (q.points ?? 0), 0)

const deriveFilename = (url: string): string => {
    try {
        const { pathname, hostname } = new URL(url)
        const last = pathname.split('/').filter(Boolean).at(-1)
        return last ? decodeURIComponent(last) : hostname
    } catch {
        return url
    }
}

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
                attachments: payload.attachments?.map((a) => ({
                    filename: deriveFilename(a.path),
                    path: a.path,
                })),
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
        const response = await $api(assignmentRoutes.byId(id), { method: 'PATCH', body })
        return assignmentSchema.parse(response)
    },

    /**
     * Without `force`, the API refuses (409) an assignment that has submissions and reports
     * how many. `force` deletes those submissions and their grades along with it, so only
     * send it once the instructor has been told what they are destroying.
     */
    async remove(id: number, force = false): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(`${assignmentRoutes.byId(id)}${force ? '?force=true' : ''}`, {
            method: 'DELETE',
        })
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

    // Always allowed, even while the exercise's other content is locked for editing.
    async setExerciseReleased(exerciseId: number, released: boolean): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.exerciseRelease(exerciseId), {
            method: 'PATCH',
            body: { released },
        })
    },

    // Convenience bulk action: releases every exercise under the assignment in one go.
    async releaseAllExercises(assignmentId: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.releaseAllExercises(assignmentId), { method: 'PATCH' })
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
