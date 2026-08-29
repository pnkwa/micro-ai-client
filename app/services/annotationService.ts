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
 *
 * `label` and `color` are RESOLVED from the joined label row (BE-ADR-038) and are both null when the
 * box is unlabeled, which is a real state: a box is drawn before it is named, and auto-save persists
 * it in between. Nullable here is therefore load-bearing - `z.string()` would throw on an ordinary
 * unnamed box and take the whole image's annotations down with it.
 *
 * *** THE READ DOES NOT CARRY `label_id`, ONLY THE RESOLVED TEXT AND COLOUR. *** Writes need the id,
 * so the caller recovers it by matching the text against its own palette, which is sound because the
 * read is owner-filtered and `UNIQUE(owner_id, label)` makes the text a key within one palette.
 * Asking the server to include `label_id` here would remove that lookup, and is worth requesting.
 */
const annotationSchema = z.object({
    id: z.number(),
    label: z.string().nullable(),
    /** '#'-prefixed and ready for CSS, unlike the palette's bare `color_hex`. Null when unlabeled. */
    color: z.string().nullable(),
    confidence: z.number(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    polygon: z.array(z.array(z.number())).nullable().optional(),
    expert_curated: z.boolean(),
})

export type Annotation = z.infer<typeof annotationSchema>

/**
 * One region to write. No id: replace-all means the server assigns them.
 *
 * `label_id` REPLACES the free-text `label` (BE-ADR-038), and null is how a box says it is unnamed.
 * The id must be one of the caller's own labels or the write is a 400 - which is not a case the
 * annotator can reach, since the read it loaded from is owner-filtered.
 *
 * Sending the old `label` string here would not fail: the server's ValidationPipe runs with
 * `whitelist: true` and no `forbidNonWhitelisted`, so an unknown field is STRIPPED and the write
 * succeeds with every box unlabeled. That silence is why this field changed name rather than gaining
 * a sibling.
 */
export interface AnnotationInput {
    label_id: number | null
    x: number
    y: number
    w: number
    h: number
    polygon?: number[][]
    expert_curated?: boolean
}

export const annotationService = {
    /**
     * YOUR OWN annotations on this image, not everyone's (BE-ADR-038).
     *
     * The caller is the token, never a query param. `?mine=false` asks for every staff member's
     * annotations on the image instead, which is the shared review view and is deliberately not
     * wired up here: the editor writes what it reads, and a replace-all over a set containing a
     * colleague's boxes would need a merge posture nothing has designed yet.
     *
     * Owner-filtering is also what makes the text-to-id lookup on `label` safe. See the schema.
     */
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
     * "COMPLETE SET" MEANS YOURS (BE-ADR-038). A replace-all is "here is my whole pass" and leaves a
     * colleague's annotations on the same image alone, which is what makes it safe to keep sending
     * the whole set from an owner-filtered read.
     *
     * Per-row `POST`/`PATCH`/`DELETE` now exist for incremental auto-save. We stay on replace-all,
     * and the two must NOT be interleaved on one image: replace-all delete-then-inserts, minting new
     * ids and invalidating any a per-row call is holding.
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
     *
     * EACH MODEL CLASS BECOMES A LABEL IN THE CALLER'S PALETTE (BE-ADR-038), created with a default
     * colour if new and reused if already held, so seeded boxes come back resolved and the classes
     * turn up in the palette afterwards. The 409 counts only the caller's own annotations.
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
