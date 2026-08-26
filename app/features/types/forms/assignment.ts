import z from 'zod'

export const attachmentSchema = z.object({
    path: z.string().url('Must be a valid URL'),
    /**
     * What the link is called where it is listed. Optional: left blank, the service falls back to
     * deriving one from the URL, which is what it always did. That fallback is fine for
     * `.../lab-guide.pdf` and useless for anything with an opaque path - a Google Doc derives to
     * "edit" - which is the whole reason this is authorable.
     */
    filename: z.string().max(100, 'Link name is too long').optional(),
})

const baseAssignmentSchema = z.object({
    name: z.string().min(1, 'Assignment name is required').max(100, 'Assignment name is too long'),
    /**
     * Optional: not every assignment has a deadline. Blank means nothing can be late for it,
     * because lateness is derived from `submitted_at > due_date` and there is nothing to compare
     * against. Distinct from the window below, which decides whether submitting is possible at all.
     */
    dueDate: z.string().optional(),
    /**
     * The submission window, behind the form's Advanced disclosure.
     *
     * Optional and separate from `dueDate` on purpose. A due date is when work is EXPECTED; the
     * window is when the door is open. A gap between the due date and the close is a grace period
     * in which a submission still lands and is marked late (BE-ADR-033), and leaving both blank is
     * the ordinary case: no gate at all, hand in whenever, late after the due date.
     */
    opensAt: z.string().optional(),
    closesAt: z.string().optional(),
    classId: z.number().min(1, 'Please select a class'),
    status: z.enum(['active', 'closed']),
    description: z.string().optional(),
    instructions: z.string().optional(),
    attachments: z.array(attachmentSchema).optional(),
    /**
     * The first section, created WITH the assignment in one request.
     *
     * Every assignment needs at least one section before a question can exist, so creating one and
     * then immediately clicking "Add section" was a step with no decision in it. The server takes
     * sections inline on POST /assignments, so this costs no extra round trip.
     *
     * A title only. Pre-filled and editable rather than hidden, because a section that appears out
     * of nowhere is harder to understand than one you were shown being made.
     */
    firstSectionTitle: z.string().max(100, 'Section title is too long').optional(),
})

export const createAssignmentFormSchema = baseAssignmentSchema

export const assignmentFormSchema = baseAssignmentSchema.extend({
    id: z.number(),
    submissions: z.number().min(0).int(),
})

export type CreateAssignmentFormData = z.infer<typeof createAssignmentFormSchema>
export type AssignmentFormData = z.infer<typeof assignmentFormSchema>
