import { z } from 'zod'
import { slideCollectionRoutes } from './routes/slideCollectionRoutes'

// One physical slide and its known answer key (staff-only reference data). `accepted_answers`
// is the exam ground truth, matched fuzzily against the student's written diagnosis server-side.
const slideSchema = z.object({
    id: z.number(),
    slide_collection_id: z.number(),
    slide_number: z.number(),
    accepted_answers: z.array(z.string()),
    notes: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
})

// GET /slide-collections/:id returns the collection with its slides (sorted by number);
// create/update/list responses omit the relation, so `slides` defaults to [] rather than
// being required (a missing relation is empty here, not an error).
const slideCollectionSchema = z.object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable().optional(),
    slides: z.array(slideSchema).default([]),
    created_at: z.string(),
    updated_at: z.string(),
})

// GET /slide-collections (list) omits the slides — scalars only.
const slideCollectionListItemSchema = slideCollectionSchema.omit({ slides: true })

export type Slide = z.infer<typeof slideSchema>
export type SlideCollection = z.infer<typeof slideCollectionSchema>
export type SlideCollectionListItem = z.infer<typeof slideCollectionListItemSchema>

export interface SlideInput {
    slide_number: number
    accepted_answers: string[]
    notes?: string
}

export const slideCollectionService = {
    async list(): Promise<SlideCollectionListItem[]> {
        const { $api } = useNuxtApp()
        const response = await $api(slideCollectionRoutes.list)
        return z.array(slideCollectionListItemSchema).parse(response)
    },

    async getById(id: number): Promise<SlideCollection> {
        const { $api } = useNuxtApp()
        const response = await $api(slideCollectionRoutes.byId(id))
        return slideCollectionSchema.parse(response)
    },

    async create(payload: { name: string; description?: string }): Promise<SlideCollection> {
        const { $api } = useNuxtApp()
        const response = await $api(slideCollectionRoutes.list, { method: 'POST', body: payload })
        return slideCollectionSchema.parse(response)
    },

    async update(
        id: number,
        payload: { name?: string; description?: string },
    ): Promise<SlideCollection> {
        const { $api } = useNuxtApp()
        const response = await $api(slideCollectionRoutes.byId(id), {
            method: 'PATCH',
            body: payload,
        })
        return slideCollectionSchema.parse(response)
    },

    // 409 (surfaced via apiErrorMessage) if the collection still holds slides or an exam uses it.
    async remove(id: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(slideCollectionRoutes.byId(id), { method: 'DELETE' })
    },

    // ---- slides ----

    async addSlide(collectionId: number, payload: SlideInput): Promise<Slide> {
        const { $api } = useNuxtApp()
        const response = await $api(slideCollectionRoutes.slides(collectionId), {
            method: 'POST',
            body: payload,
        })
        return slideSchema.parse(response)
    },

    async updateSlide(slideId: number, payload: Partial<SlideInput>): Promise<Slide> {
        const { $api } = useNuxtApp()
        const response = await $api(slideCollectionRoutes.slideById(slideId), {
            method: 'PATCH',
            body: payload,
        })
        return slideSchema.parse(response)
    },

    async removeSlide(slideId: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(slideCollectionRoutes.slideById(slideId), { method: 'DELETE' })
    },
}
