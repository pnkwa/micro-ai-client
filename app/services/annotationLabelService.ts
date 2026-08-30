import { z } from 'zod'
import { annotationLabelRoutes } from './routes/annotationLabelRoutes'

/**
 * The caller's own annotation-label palette (BE-ADR-038).
 *
 * A class in the annotator IS one of these rows. That is the whole change: the tool used to derive
 * its class list from whatever strings the images happened to carry and colour them by position in
 * that list, which meant a colour moved whenever a new class appeared ahead of it. Now the list is
 * stored, the colour is authored, and both survive a reload and follow the person rather than the
 * batch.
 *
 * Still free text, deliberately, for the reason BE-ADR-030 gave: the tool exists to describe what
 * the models do NOT detect, so a vocabulary frozen to the manifest's classes would make the dataset
 * useless for the next checkpoint.
 */

/**
 * `color_hex` is SIX HEX DIGITS WITH NO `#`, which is the one asymmetry on this surface: the palette
 * writes and reads bare hex, while a box's resolved `color` comes back '#'-prefixed and ready for
 * CSS. Six digits is enforced server-side, so a value read from here can be prefixed without
 * checking.
 *
 * `owner_id` is nullable because a label backfilled from the old free-text column may have outlived
 * the account that wrote it. Nothing renders it; it is parsed so the schema matches the wire.
 */
const annotationLabelSchema = z.object({
    id: z.number(),
    label: z.string(),
    color_hex: z.string(),
    owner_id: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
})

export type AnnotationLabel = z.infer<typeof annotationLabelSchema>

/** What a write sends. Bare hex, no `#`; the server lowercases it. */
export interface AnnotationLabelInput {
    label: string
    color_hex: string
}

export const annotationLabelService = {
    /**
     * The caller's own labels, alphabetical. Unpaged: a personal palette is a bounded set.
     *
     * `hideOrphan` drops labels no annotation points at, so the picker offers the classes actually in
     * use rather than everything ever typed. It is an EXISTS over `image_annotations.label_id`.
     *
     * *** IT IS ONLY SAFE AS AN OPENING QUESTION, NOT AS A REFRESH. *** A label is an orphan until
     * some box is SAVED with it, so a freshly created class is an orphan, and so is one applied to
     * three boxes that have not been written yet. Re-reading with this flag mid-session therefore
     * deletes from the picker exactly the class the person is in the middle of using. The annotator
     * asks for it once, on open, and treats the palette as append-only afterwards.
     */
    async list(options?: { hideOrphan?: boolean }): Promise<AnnotationLabel[]> {
        const { $api } = useNuxtApp()
        const response = await $api(annotationLabelRoutes.list, {
            ...(options?.hideOrphan && { query: { hide_orphan: true } }),
        })
        return z.array(annotationLabelSchema).parse(response)
    },

    /**
     * Mint a label.
     *
     * *** 409 IS AN ORDINARY OUTCOME, NOT A FAILURE. *** `UNIQUE(owner_id, label)` means asking for a
     * name you already hold is a conflict, and the annotator reaches that case constantly: typing a
     * class onto a chip cannot know whether the palette already has it. The caller catches the 409
     * and reuses the existing row rather than surfacing an error.
     */
    async create(input: AnnotationLabelInput): Promise<AnnotationLabel> {
        const { $api } = useNuxtApp()
        const response = await $api(annotationLabelRoutes.create, {
            method: 'POST',
            body: input,
        })
        return annotationLabelSchema.parse(response)
    },

    /** Rename or recolour. An omitted field is kept, so a recolour need not resend the name. */
    async update(id: number, patch: Partial<AnnotationLabelInput>): Promise<AnnotationLabel> {
        const { $api } = useNuxtApp()
        const response = await $api(annotationLabelRoutes.byId(id), {
            method: 'PATCH',
            body: patch,
        })
        return annotationLabelSchema.parse(response)
    },

    /**
     * Retire a label.
     *
     * *** THIS UNLABELS EVERY BOX CARRYING IT, LIBRARY-WIDE. *** The FK is ON DELETE SET NULL, so
     * nothing is stranded and nothing is deleted, but annotations on images the caller is not
     * looking at silently lose their class. Any UI for this owes the person that sentence.
     */
    async remove(id: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(annotationLabelRoutes.byId(id), { method: 'DELETE' })
    },
}
