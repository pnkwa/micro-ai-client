import z from 'zod'
import type { FIELD_PROMPT_TYPES } from '~/services/annotationAssignmentService'

// The vee-validate-backed SCALAR fields of the create form (BE-ADR-039). The album, the class list
// and the per-image prompts are edited as their own reactive rows in the dialog (color swatches,
// selects and switches don't map cleanly onto name-bound fields) and validated on submit.
export const createAnnotationAssignmentFormSchema = z.object({
    name: z
        .string()
        .min(1, 'Assignment name is required')
        .max(100, 'Assignment name is too long'),
    description: z.string().optional(),
    instructions: z.string().optional(),
    dueDate: z.string().optional(),
})

export type CreateAnnotationAssignmentFormData = z.infer<
    typeof createAnnotationAssignmentFormSchema
>

// One editable class row (label + 6-hex colour, no leading #).
export interface LabelClassRow {
    label: string
    color: string
}

// One editable per-image form slot.
export interface FieldPromptRow {
    key: string
    label: string
    type: (typeof FIELD_PROMPT_TYPES)[number]
    required: boolean
}
