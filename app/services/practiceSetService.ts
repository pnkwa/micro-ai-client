import { z } from 'zod'
import { practiceSetRoutes } from './routes/practiceSetRoutes'
import { detectionSchema } from './detectionService'

/**
 * Curated practice sets (client request 5.1): microscopy images students review before an exam.
 *
 * An item carries the whole detection, boxes and all. That is deliberate and specific to practice:
 * BE-ADR-012 says a student in practice sees the model's full reasoning, and withholding it here
 * would waste the models. The exam side is the opposite and is enforced server-side, so nothing
 * on this page needs to hide anything.
 */
const practiceSetItemSchema = z.object({
    id: z.number(),
    practice_set_id: z.number(),
    detection_id: z.number(),
    position: z.number(),
    caption: z.string().nullable().optional(),
    // Present on a single-set read, absent from the list read.
    detection: detectionSchema.optional(),
})

// Scalars only; the list reads omit the items.
const practiceSetSchema = z.object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable().optional(),
    /**
     * Students only ever receive published sets, so this is always true for them. It matters to
     * staff, for whom it is the switch that makes a set readable by students at all — see
     * requireVisible server-side.
     */
    published: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
})

const practiceSetDetailSchema = practiceSetSchema.extend({
    items: z.array(practiceSetItemSchema).default([]),
})

export type PracticeSet = z.infer<typeof practiceSetSchema>
export type PracticeSetDetail = z.infer<typeof practiceSetDetailSchema>
export type PracticeSetItem = z.infer<typeof practiceSetItemSchema>

export interface PracticeSetInput {
    name: string
    description?: string
    published?: boolean
}

export interface PracticeItemInput {
    detection_id: number
    position?: number
    caption?: string
}

export const practiceSetService = {
    /** Student-visible list: published sets only, server-side. */
    async listPublished(): Promise<PracticeSet[]> {
        const { $api } = useNuxtApp()
        const response = await $api(practiceSetRoutes.published)
        return z.array(practiceSetSchema).parse(response)
    },

    /** Staff list, drafts included. */
    async list(): Promise<PracticeSet[]> {
        const { $api } = useNuxtApp()
        const response = await $api(practiceSetRoutes.list)
        return z.array(practiceSetSchema).parse(response)
    },

    /** One set with its items in order. A student gets a 404 for an unpublished set. */
    async getById(id: number): Promise<PracticeSetDetail> {
        const { $api } = useNuxtApp()
        const response = await $api(practiceSetRoutes.byId(id))
        return practiceSetDetailSchema.parse(response)
    },

    async create(payload: PracticeSetInput): Promise<PracticeSet> {
        const { $api } = useNuxtApp()
        const response = await $api(practiceSetRoutes.list, {
            method: 'POST',
            body: payload,
        })
        return practiceSetSchema.parse(response)
    },

    async update(id: number, payload: Partial<PracticeSetInput>): Promise<PracticeSet> {
        const { $api } = useNuxtApp()
        const response = await $api(practiceSetRoutes.byId(id), {
            method: 'PATCH',
            body: payload,
        })
        return practiceSetSchema.parse(response)
    },

    async remove(id: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(practiceSetRoutes.byId(id), { method: 'DELETE' })
    },

    /** 409 if the detection is already in the set; 404 if it doesn't exist. */
    async addItem(setId: number, payload: PracticeItemInput): Promise<PracticeSetItem> {
        const { $api } = useNuxtApp()
        const response = await $api(practiceSetRoutes.items(setId), {
            method: 'POST',
            body: payload,
        })
        return practiceSetItemSchema.parse(response)
    },

    async removeItem(itemId: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(practiceSetRoutes.itemById(itemId), { method: 'DELETE' })
    },
}
