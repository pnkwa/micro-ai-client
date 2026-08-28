import { z } from 'zod'
import { imageRoutes } from './routes/imageRoutes'

/**
 * Human annotations on a library image (BE-ADR-030).
 *
 * A separate service from `imageService` because the server keeps them in a separate controller for
 * the same reason: the image's bytes and identity are one concern, what people have drawn on it is
 * another. Its predecessor was 435 lines doing both jobs.
 *
 * *** STAFF-ONLY, INCLUDING READS. *** An annotation is an instructor's working note on a vetted
 * image, and one of them may name exactly the thing a question asks a student to find.
 */

/**
 * One annotation, in the shape `detection_boxes` uses.
 *
 * That mirroring is the design, not a coincidence: it means `McAnnotatedImage` renders human work
 * with no component changes, and the coordinate space is identical - normalized [0,1] against the
 * original image.
 *
 * `confidence` is always 1 and is SYNTHESIZED at the server's serializer purely so a client parsing
 * these as detection boxes does not have to special-case them. There is no confidence column: a
 * person drawing a box did not measure a probability, and storing a fabricated 1.0 would carry it
 * into the dataset export as if they had. Parsed here so the schema matches the wire, and ignored.
 */
const annotationSchema = z.object({
    id: z.number(),
    label: z.string(),
    confidence: z.number(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    polygon: z.array(z.array(z.number())).nullable().optional(),
    expert_curated: z.boolean(),
})

export type Annotation = z.infer<typeof annotationSchema>

/** One region to write. No id: replace-all means the server assigns them. */
export interface AnnotationInput {
    label: string
    x: number
    y: number
    w: number
    h: number
    polygon?: number[][]
    expert_curated?: boolean
}

export const annotationService = {
    async list(imageId: number): Promise<Annotation[]> {
        const { $api } = useNuxtApp()
        const response = await $api(imageRoutes.annotations(imageId))
        return z.array(annotationSchema).parse(response)
    },

    /**
     * REPLACE-ALL, in one transaction.
     *
     * Send the complete set every time. An annotation pass is one editing session rather than a
     * sequence of independent facts, and the all-or-nothing write is what stops a half-saved
     * drawing reaching the database. It also spares us reconciling ids for shapes a person just
     * drew, which is why the editor can hand out throwaway local ids.
     *
     * A POLYGON'S EXTENT WINS: send both and the x/y/w/h is recomputed from the outline and the one
     * sent is ignored, so the two descriptions of one region cannot disagree. Re-read the response
     * rather than trusting local state.
     *
     * Refused with a 400 unless the image is in a CURATED album, and limited to 1000.
     */
    async replace(imageId: number, annotations: AnnotationInput[]): Promise<Annotation[]> {
        const { $api } = useNuxtApp()
        const response = await $api(imageRoutes.annotations(imageId), {
            method: 'PUT',
            body: { annotations },
        })
        return z.array(annotationSchema).parse(response)
    },

    /**
     * Copy a model run's own geometry in as editable annotations.
     *
     * Where the value is (BE-ADR-030): correcting the model's boxes says WHERE it was wrong, which
     * a fresh label never does, and that is the signal the research team actually wants.
     *
     * `detection_id` is explicit because v0.7 separated an image from its runs, so "seed from the
     * detection" no longer names one. 409 when annotations already exist - clear them first rather
     * than silently merging two sets - and 400 when the run produced no boxes or is over a
     * different image.
     */
    async seedFromDetection(imageId: number, detectionId: number): Promise<Annotation[]> {
        const { $api } = useNuxtApp()
        const response = await $api(imageRoutes.seedAnnotations(imageId), {
            method: 'POST',
            body: { detection_id: detectionId },
        })
        return z.array(annotationSchema).parse(response)
    },
}
