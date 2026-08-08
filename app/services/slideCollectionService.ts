import { z } from 'zod'
import { slideCollectionRoutes } from './routes/slideCollectionRoutes'

// One physical slide and its known answer key (staff-only reference data). `accepted_answers`
// is the exam ground truth, matched fuzzily against the student's written diagnosis server-side.
const slideSchema = z.object({
    id: z.number(),
    slide_collection_id: z.number(),
    // Text, not a number: labels carry letter codes ("V7"). Server-normalized, so it arrives in
    // canonical form. See core/helpers/slideNumber.ts.
    slide_number: z.string(),
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
    slide_number: string
    accepted_answers: string[]
    notes?: string
}

/**
 * How an import reconciles with the slides already in the collection.
 *  - `replace`: the sheet becomes the whole answer key; slides it omits are deleted.
 *  - `merge`:   upsert on the slide label; slides the sheet omits are left alone.
 */
export type BulkImportMode = 'replace' | 'merge'

export interface BulkImportResult {
    mode: BulkImportMode
    created: number
    updated: number
    deleted: number
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

    /**
     * Bulk answer-key import (2.1). The .xlsx never leaves the browser; it is parsed and
     * validated in the import dialog, so this only ever posts rows as JSON (BE-ADR-006/007).
     * All-or-nothing server-side: either every row lands or none does.
     */
    async bulkImportSlides(
        collectionId: number,
        payload: { mode: BulkImportMode; slides: SlideInput[] },
    ): Promise<BulkImportResult> {
        const { $api } = useNuxtApp()
        return await $api<BulkImportResult>(slideCollectionRoutes.slidesBulk(collectionId), {
            method: 'POST',
            body: payload,
        })
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
