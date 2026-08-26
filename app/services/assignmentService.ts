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

/**
 * The image-bearing half of a question (BE-ADR-034), present ONLY on `image_detection`,
 * `slide_identification` and `detection_review`, and null on the other types.
 *
 * Five fields that used to be scattered at two different grains collapse here: `model` and the
 * curated image came off the question, while the slide collection and the confidence threshold came
 * off the ASSIGNMENT. That is why an assignment no longer has a `slide_collection_id` at all.
 *
 * The last three are staff-only and absent entirely from a student's read, the same way
 * `model_verdict` always was.
 */
const imageQuestionSchema = z.object({
    image_id: z.number().nullable(),
    slide_collection_id: z.number().nullable(),
    model: z.string().nullable(),
    detection_confidence_threshold: z.number().nullable(),
    detection: z.unknown().nullable(),
    detection_id: z.number().nullable().optional(),
    model_verdict: z.enum(['correct', 'incorrect', 'partial']).nullable().optional(),
    verdict_note: z.string().nullable().optional(),
})

const questionSchema = z.object({
    id: z.number(),
    // `exercise_id` until v0.7. The table is `assignment_sections` and the FK keeps the qualifier
    // even though the route and the payload key do not (BE-ADR-033).
    assignment_section_id: z.number(),
    type: z.enum([
        'multiple_choice',
        'multiple_select',
        'fill_in',
        'image_detection',
        // Exam mode: the student self-reports a slide number, writes a diagnosis and attaches
        // a FOV photo. Carries no options or key of its own - the key lives on the slide.
        'slide_identification',
    ]),
    prompt: z.string(),
    position: z.number(),
    points: z.number().nullable().optional(),
    options: z.array(z.string()),
    accepted_answers: z.array(z.string()).optional(),
    image_question: imageQuestionSchema.nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
})

const sectionSchema = z.object({
    id: z.number(),
    assignment_id: z.number(),
    title: z.string(),
    instructions: z.string().nullable(),
    position: z.number(),
    // While unreleased, students never see this section at all (backend omits it from
    // their read entirely), and its own content is locked against edits server-side;
    // release/un-release is the one action always allowed regardless of this flag.
    released: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
    questions: z.array(questionSchema),
})

// Exam authoring reuses the section/question tree wholesale, so these are exported for
// examService to extend rather than re-declare.
export { sectionSchema, attachmentSchema, imageQuestionSchema }
export type ImageQuestion = z.infer<typeof imageQuestionSchema>
export type Question = z.infer<typeof questionSchema>

/** What authoring may SEND. Narrower than the read shape: the verdict fields are staff-set on a
 *  detection_review question, which this client does not author. */
export interface ImageQuestionInput {
    image_id?: number | null
    slide_collection_id?: number | null
    model?: string | null
    detection_confidence_threshold?: number | null
}
export type Attachment = z.infer<typeof attachmentSchema>

// Returned by GET /assignments (list): scalars only, no tree. `is_exam` is present because
// the endpoint returns raw rows and does NOT filter exams out - the client separates them.
export const assignmentListItemSchema = z.object({
    id: z.number(),
    class_id: z.number(),
    name: z.string(),
    description: z.string().nullable(),
    instructions: z.string().nullable(),
    due_date: z.string().nullable(),
    points: z.number().nullable(),
    status: z.enum(['active', 'closed']),
    is_exam: z.boolean().optional().default(false),
    // The submission window, and NO LONGER exam-only (BE-ADR-033). `exam_opens_at`/`exam_closes_at`
    // until v0.7. Separating `closes_at` from `due_date` is what makes late submission expressible:
    // `due_date < closes_at` is a grace period, and a null `closes_at` is unlimited-but-late.
    //
    // `slide_collection_id` and `exam_confidence_threshold` used to sit here too; both moved onto
    // the question's `image_question` (BE-ADR-034), so an assignment no longer carries either.
    opens_at: z.string().nullable().optional(),
    closes_at: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
})

// Returned by GET /assignments/:id: full tree via toAssignmentView
export const assignmentSchema = assignmentListItemSchema.extend({
    attachments: z.array(attachmentSchema),
    sections: z.array(sectionSchema),
})

export type AssignmentListItem = z.infer<typeof assignmentListItemSchema>
export type Assignment = z.infer<typeof assignmentSchema>

// The only source of truth for "how many points is this assignment worth": the backend's
// own computeScore() sums per-answer points the same way, never reading assignments.points
// (a disconnected, manually-typed field that's easy to leave stale once questions are added
// or edited after the fact).
export const assignmentTotalPoints = (assignment: Assignment): number =>
    assignment.sections.flatMap((s) => s.questions).reduce((sum, q) => sum + (q.points ?? 0), 0)

/** Fallback name for a link the instructor did not name: the last path segment, else the host. */
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
                // The form's due date carries a time ('YYYY-MM-DDTHH:mm' local); send an
                // unambiguous ISO instant.
                due_date: payload.dueDate ? new Date(payload.dueDate).toISOString() : undefined,
                status: payload.status,
                description: payload.description,
                instructions: payload.instructions,
                // The window, from the create form's Advanced section. Blank means no bound rather
                // than an empty string, which the server would reject as a bad date.
                opens_at: payload.opensAt ? new Date(payload.opensAt).toISOString() : undefined,
                closes_at: payload.closesAt ? new Date(payload.closesAt).toISOString() : undefined,
                // One section, created with the assignment. The server accepts the tree inline, so
                // the alternative was a second request that could half-fail: an assignment with no
                // section, which is a state the authoring UI would then have to explain.
                sections: payload.firstSectionTitle?.trim()
                    ? [{ title: payload.firstSectionTitle.trim() }]
                    : undefined,
                attachments: payload.attachments?.map((a) => ({
                    // What the instructor typed, else the old derived-from-URL name. The server
                    // requires a filename, so this is never blank.
                    filename: a.filename?.trim() || deriveFilename(a.path),
                    path: a.path,
                })),
            },
        })
        return assignmentSchema.parse(response)
    },

    async update(
        id: number,
        // The window is omitted from the form shape and redeclared, because the two disagree about
        // blank on purpose: the create form has no way to express "clear this", so it types them as
        // string, while an edit must be able to remove a bound it set by mistake. Null clears here;
        // undefined leaves it untouched.
        payload: Partial<
            Omit<CreateAssignmentFormData, 'classId' | 'opensAt' | 'closesAt' | 'dueDate'>
        > & {
            dueDate?: string | null
            opensAt?: string | null
            closesAt?: string | null
        },
    ): Promise<Assignment> {
        const { $api } = useNuxtApp()
        const body: Record<string, unknown> = {}
        if (payload.name !== undefined) body.name = payload.name
        // Empty clears the deadline rather than leaving it alone, matching the window bounds.
        if (payload.dueDate !== undefined)
            body.due_date = payload.dueDate ? new Date(payload.dueDate).toISOString() : null
        if (payload.status !== undefined) body.status = payload.status
        if (payload.description !== undefined) body.description = payload.description
        if (payload.instructions !== undefined) body.instructions = payload.instructions
        // Null clears the bound, so these check for undefined rather than truthiness. Sent as an
        // unambiguous instant, like due_date; the picker holds local wall-clock time.
        if (payload.opensAt !== undefined)
            body.opens_at = payload.opensAt ? new Date(payload.opensAt).toISOString() : null
        if (payload.closesAt !== undefined)
            body.closes_at = payload.closesAt ? new Date(payload.closesAt).toISOString() : null
        const response = await $api(assignmentRoutes.byId(id), { method: 'PATCH', body })
        return assignmentSchema.parse(response)
    },

    // ---- attachments -------------------------------------------------------------------
    //
    // Links, not uploads (BE-ADR-007). `filename` is what a student sees in the Attachments list,
    // so it is the field worth fixing after the fact: it used to be frozen at creation, derived
    // from the URL when the instructor left it blank, and a Google Doc derives to "edit".

    async addAttachment(
        assignmentId: number,
        input: { path: string; filename?: string },
    ): Promise<Attachment> {
        const { $api } = useNuxtApp()
        const response = await $api(assignmentRoutes.attachments(assignmentId), {
            method: 'POST',
            body: {
                filename: input.filename?.trim() || deriveFilename(input.path),
                path: input.path,
            },
        })
        return attachmentSchema.parse(response)
    },

    /** Rename a link, or repoint it. Whichever field is sent is the one that changes. */
    async updateAttachment(
        assignmentId: number,
        attachmentId: number,
        input: { filename?: string; path?: string },
    ): Promise<Attachment> {
        const { $api } = useNuxtApp()
        const body: Record<string, unknown> = {}
        if (input.filename !== undefined) body.filename = input.filename.trim()
        if (input.path !== undefined) body.path = input.path
        const response = await $api(assignmentRoutes.attachmentById(assignmentId, attachmentId), {
            method: 'PATCH',
            body,
        })
        return attachmentSchema.parse(response)
    },

    async removeAttachment(assignmentId: number, attachmentId: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.attachmentById(assignmentId, attachmentId), {
            method: 'DELETE',
        })
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

    // ---- sections ----

    async addSection(
        assignmentId: number,
        payload: { title: string; instructions?: string },
    ): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.sections(assignmentId), { method: 'POST', body: payload })
    },

    async updateSection(
        sectionId: number,
        payload: { title?: string; instructions?: string },
    ): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.sectionById(sectionId), { method: 'PATCH', body: payload })
    },

    async removeSection(sectionId: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.sectionById(sectionId), { method: 'DELETE' })
    },

    // Always allowed, even while the section's other content is locked for editing.
    async setSectionReleased(sectionId: number, released: boolean): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.sectionRelease(sectionId), {
            method: 'PATCH',
            body: { released },
        })
    },

    // Convenience bulk action: releases every section under the assignment in one go.
    async releaseAllSections(assignmentId: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.releaseAllSections(assignmentId), { method: 'PATCH' })
    },

    // ---- questions ----

    /**
     * `image_question` is the subtype row for the image-bearing types (BE-ADR-034). The server
     * enforces a per-type matrix and 400s naming the offending field, so send it only for the
     * types that may carry one: a slide question needs `slide_collection_id` and rejects the rest,
     * an image_detection question may set `model` and the threshold and rejects a collection.
     */
    async addQuestion(
        sectionId: number,
        payload: {
            type: string
            prompt: string
            options?: string[]
            accepted_answers?: string[]
            points?: number
            image_question?: ImageQuestionInput | null
        },
    ): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(assignmentRoutes.questions(sectionId), { method: 'POST', body: payload })
    },

    /**
     * PATCH reads `image_question` three ways: absent leaves the subtype row alone, `null` deletes
     * it, and an object replaces it wholesale. That is why changing a question's type away from an
     * image type has to send an explicit null rather than simply omitting the field.
     */
    async updateQuestion(
        questionId: number,
        payload: {
            prompt?: string
            options?: string[]
            accepted_answers?: string[]
            points?: number
            image_question?: ImageQuestionInput | null
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
