import { z } from 'zod'
import { annotationAssignmentRoutes } from './routes/annotationAssignmentRoutes'
import { assignmentSchema, assignmentListItemSchema } from './assignmentService'

// The annotation-assignment surface (BE-ADR-039). Authoring is a facade over /assignments, so an
// annotation assignment IS an assignment read plus an `annotation` config block and the album's
// images. The student-submit and instructor-review endpoints hang off the same base path.

export const FIELD_PROMPT_TYPES = ['text', 'textarea', 'number', 'select'] as const
export type FieldPromptType = (typeof FIELD_PROMPT_TYPES)[number]

// One class in the fixed vocabulary — a snapshot copied from the author's palette (color = 6 hex,
// no leading #). Empty label_set = free-text labels.
export const labelClassSchema = z.object({
    label: z.string(),
    color: z.string(),
})
export type LabelClass = z.infer<typeof labelClassSchema>

// One per-image form slot the student fills alongside the boxes.
export const fieldPromptSchema = z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(FIELD_PROMPT_TYPES),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
})
export type FieldPrompt = z.infer<typeof fieldPromptSchema>

export const annotationConfigSchema = z.object({
    album_id: z.number(),
    required_count: z.number().nullable(),
    allow_skip: z.boolean(),
    label_set: z.array(labelClassSchema),
    field_prompts: z.array(fieldPromptSchema),
})
export type AnnotationConfig = z.infer<typeof annotationConfigSchema>

// The album images the assignment read carries (from AlbumsService.listImages). Only image_id is
// load-bearing here; the nested image row is passed through for its metadata/thumbnail.
const annotationImageSchema = z.object({
    image_id: z.number(),
    image: z.object({ id: z.number() }).passthrough(),
})

// GET /annotation-assignments/:id — the assignment view, its annotation config, and the album images.
//
// `images` is OPTIONAL because the CREATE/UPDATE responses are the plain assignment view (no album
// images attached — only the `GET /:id` read fans them in). Requiring it made `create()`'s parse
// throw on an otherwise-successful 201, which left the create dialog open. Defaults to [].
export const annotationAssignmentSchema = assignmentSchema.extend({
    annotation: annotationConfigSchema,
    images: z.array(annotationImageSchema).optional().default([]),
})
export type AnnotationAssignment = z.infer<typeof annotationAssignmentSchema>
export type AnnotationAssignmentListItem = z.infer<typeof assignmentListItemSchema>

// ---- submissions ---------------------------------------------------------------------

export const annotationFieldStatusValues = ['pending', 'completed', 'skipped'] as const
export type AnnotationFieldStatus = (typeof annotationFieldStatusValues)[number]

export const annotationReviewStatusValues = ['unreviewed', 'approved', 'flagged'] as const
export type AnnotationReviewStatus = (typeof annotationReviewStatusValues)[number]

// One box the student drew (free-text label; geometry normalized [0,1]).
export const studentBoxSchema = z.object({
    id: z.number(),
    label: z.string().nullable(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    polygon: z.array(z.array(z.number())).nullable(),
})
export type StudentBox = z.infer<typeof studentBoxSchema>

// The instructor's expert key, present on staff reads only (mirrors the annotation overlay shape).
const expertBoxSchema = z.object({
    id: z.number(),
    label: z.string().nullable(),
    color: z.string().nullable(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    polygon: z.array(z.array(z.number())).nullable(),
    expert_curated: z.boolean(),
})

export const submissionFieldSchema = z.object({
    image_id: z.number(),
    status: z.enum(annotationFieldStatusValues),
    responses: z.record(z.string(), z.unknown()),
    review_status: z.enum(annotationReviewStatusValues),
    remark: z.string().nullable(),
    reviewed_at: z.string().nullable(),
    annotations: z.array(studentBoxSchema),
    // Staff reads only.
    expert: z.array(expertBoxSchema).optional(),
})
export type SubmissionField = z.infer<typeof submissionFieldSchema>

export const annotationSubmissionSchema = z.object({
    id: z.number(),
    assignment_id: z.number(),
    student_id: z.string(),
    status: z.enum(['submitted', 'graded', 'rejected']),
    submitted_at: z.string(),
    graded_at: z.string().nullable(),
    feedback: z.string().nullable(),
    rejection_reason: z.string().nullable(),
    fields: z.array(submissionFieldSchema),
})
export type AnnotationSubmission = z.infer<typeof annotationSubmissionSchema>

export const submissionListItemSchema = z.object({
    id: z.number(),
    student_id: z.string(),
    status: z.enum(['submitted', 'graded', 'rejected']),
    submitted_at: z.string(),
    graded_at: z.string().nullable(),
    annotated: z.number(),
    total: z.number(),
    reviewed: z.number(),
})
export type SubmissionListItem = z.infer<typeof submissionListItemSchema>

// ---- authoring / submit inputs -------------------------------------------------------

export interface AnnotationConfigInput {
    albumId: number
    requiredCount?: number | null
    allowSkip?: boolean
    labelSet?: LabelClass[]
    fieldPrompts?: FieldPrompt[]
}

export interface CreateAnnotationAssignmentInput extends AnnotationConfigInput {
    classId: number
    name: string
    description?: string
    instructions?: string
    dueDate?: string
}

export type UpdateAnnotationAssignmentInput = Partial<
    Omit<CreateAnnotationAssignmentInput, 'classId'>
>

// The student's outgoing work for one image.
export interface SubmitFieldInput {
    imageId: number
    status: AnnotationFieldStatus
    responses?: Record<string, unknown>
    annotations?: {
        label?: string | null
        x: number
        y: number
        w: number
        h: number
        polygon?: number[][]
    }[]
}

const configBody = (input: AnnotationConfigInput) => ({
    album_id: input.albumId,
    required_count: input.requiredCount ?? null,
    allow_skip: input.allowSkip ?? true,
    label_set: input.labelSet ?? [],
    field_prompts: input.fieldPrompts ?? [],
})

export const annotationAssignmentService = {
    async listByClass(classId: number): Promise<AnnotationAssignmentListItem[]> {
        const { $api } = useNuxtApp()
        const response = await $api(`${annotationAssignmentRoutes.list}?class_id=${classId}`)
        return z.array(assignmentListItemSchema).parse(response)
    },

    async getById(id: number): Promise<AnnotationAssignment> {
        const { $api } = useNuxtApp()
        const response = await $api(annotationAssignmentRoutes.byId(id))
        return annotationAssignmentSchema.parse(response)
    },

    async create(payload: CreateAnnotationAssignmentInput): Promise<AnnotationAssignment> {
        const { $api } = useNuxtApp()
        const response = await $api(annotationAssignmentRoutes.list, {
            method: 'POST',
            body: {
                class_id: payload.classId,
                name: payload.name,
                description: payload.description,
                instructions: payload.instructions,
                due_date: payload.dueDate,
                ...configBody(payload),
            },
        })
        return annotationAssignmentSchema.parse(response)
    },

    async update(
        id: number,
        payload: UpdateAnnotationAssignmentInput,
    ): Promise<AnnotationAssignment> {
        const { $api } = useNuxtApp()
        const body: Record<string, unknown> = {}
        if (payload.name !== undefined) body.name = payload.name
        if (payload.description !== undefined) body.description = payload.description
        if (payload.instructions !== undefined) body.instructions = payload.instructions
        if (payload.dueDate !== undefined) body.due_date = payload.dueDate
        // Sending album_id is how the server knows to replace the whole config (BE-ADR-039).
        if (payload.albumId !== undefined) Object.assign(body, configBody(payload as AnnotationConfigInput))
        const response = await $api(annotationAssignmentRoutes.byId(id), {
            method: 'PATCH',
            body,
        })
        return annotationAssignmentSchema.parse(response)
    },

    async remove(id: number, force = false): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(
            `${annotationAssignmentRoutes.byId(id)}${force ? '?force=true' : ''}`,
            { method: 'DELETE' },
        )
    },

    // ---- student ----

    async submit(id: number, fields: SubmitFieldInput[]): Promise<AnnotationSubmission> {
        const { $api } = useNuxtApp()
        const response = await $api(annotationAssignmentRoutes.submissions(id), {
            method: 'POST',
            body: {
                fields: fields.map((f) => ({
                    image_id: f.imageId,
                    status: f.status,
                    responses: f.responses,
                    annotations: f.annotations,
                })),
            },
        })
        return annotationSubmissionSchema.parse(response)
    },

    async getSubmission(submissionId: number): Promise<AnnotationSubmission> {
        const { $api } = useNuxtApp()
        const response = await $api(annotationAssignmentRoutes.submissionById(submissionId))
        return annotationSubmissionSchema.parse(response)
    },

    // ---- instructor review ----

    async listSubmissions(id: number): Promise<SubmissionListItem[]> {
        const { $api } = useNuxtApp()
        const response = await $api(annotationAssignmentRoutes.submissions(id))
        return z.array(submissionListItemSchema).parse(response)
    },

    async reviewField(
        submissionId: number,
        imageId: number,
        payload: { reviewStatus: AnnotationReviewStatus; remark?: string | null },
    ): Promise<AnnotationSubmission> {
        const { $api } = useNuxtApp()
        const response = await $api(
            annotationAssignmentRoutes.reviewField(submissionId, imageId),
            {
                method: 'PATCH',
                body: { review_status: payload.reviewStatus, remark: payload.remark },
            },
        )
        return annotationSubmissionSchema.parse(response)
    },

    async finalize(
        submissionId: number,
        feedback?: string | null,
    ): Promise<AnnotationSubmission> {
        const { $api } = useNuxtApp()
        const response = await $api(annotationAssignmentRoutes.finalize(submissionId), {
            method: 'PATCH',
            body: { feedback },
        })
        return annotationSubmissionSchema.parse(response)
    },

    async reject(submissionId: number, reason: string): Promise<AnnotationSubmission> {
        const { $api } = useNuxtApp()
        const response = await $api(annotationAssignmentRoutes.reject(submissionId), {
            method: 'PATCH',
            body: { reason },
        })
        return annotationSubmissionSchema.parse(response)
    },
}
