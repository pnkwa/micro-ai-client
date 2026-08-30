import { z } from 'zod'
import { detectionRoutes } from './routes/detectionRoutes'

// One detected/segmented element. Coords are normalized [0,1] against the original image;
// `polygon` is the segmentation outline (a detector leaves it null; see DetectionBox entity).
const detectionBoxSchema = z.object({
    id: z.number(),
    label: z.string(),
    confidence: z.number(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    polygon: z.array(z.array(z.number())).nullable().optional(),
})

const detectionStepSchema = z.object({
    id: z.number(),
    step: z.string(),
    step_order: z.number(),
    predicted_class: z.string(),
    confidence: z.number(),
    probs: z.array(z.number()),
    // The model's full class vocabulary, in index order; null for the legacy classifier.
    labels: z.array(z.string()).nullable().optional(),
    boxes: z.array(detectionBoxSchema),
    created_at: z.string(),
})

export const detectionSchema = z.object({
    id: z.number(),
    source: z.enum(['upload', 'camera', 'submission']),
    // `img_path` and `content_hash` are gone from the wire entirely in v0.7: an image is a row of
    // its own now, and the detection relation is deliberately not joined into detection reads so
    // that the absolute server path cannot travel back out.
    /**
     * The `images` row this run was over (BE-ADR-031). An INTEGER since v0.7, where it used to be
     * the stored file's UUID basename.
     *
     * That change is not cosmetic. The old name was unguessable, so possessing it was the whole
     * authorization; an integer is enumerable, so that argument is gone and the route it feeds
     * (`GET /images/:id/file`) currently checks authentication only, with the real permission union
     * a recorded deferral. Expect a 403 where only a 404 was possible before, and do not treat an
     * image URL as shareable.
     */
    image_id: z.number().nullable().optional(),
    model: z.string(),
    created_by: z.number().nullable().optional(),
    steps: z.array(detectionStepSchema),
    created_at: z.string(),
})

// The admin browse (GET /detections/all, BE-ADR-024) enriches each row with its submitter. The
// server selects only safe columns off the creator - never the password hash - and leaves it
// null for anonymous runs.
const submitterSchema = z.object({
    userID: z.number(),
    firstname: z.string(),
    lastname: z.string(),
    email: z.string(),
    user_type: z.enum(['staff', 'student']),
})

export const detectionWithSubmitterSchema = detectionSchema.extend({
    creator: submitterSchema.nullable().optional(),
})

export type DetectionBox = z.infer<typeof detectionBoxSchema>
export type DetectionStep = z.infer<typeof detectionStepSchema>
export type DetectionWithSubmitter = z.infer<typeof detectionWithSubmitterSchema>
export type DetectionRecord = z.infer<typeof detectionSchema>

/**
 * What the list endpoints return WHEN PAGED (BE-ADR-026). The shape follows the opt-in: no
 * `per_page` and the response is a bare array exactly as before, which is why `listMine` below is
 * unchanged and only the paged callers parse this.
 */
const detectionPageSchema = z.object({
    data: z.array(detectionSchema),
    total: z.number(),
})

// GET /models (FE-ADR-007): the manifest the server actually runs. The client never
// hardcodes a model name so a model added server-side shows up with no client change.
const modelSpecSchema = z.object({
    name: z.string(),
    task: z.enum(['classify', 'detect', 'segment']),
    step: z.string(),
    displayName: z.string(),
    description: z.string(),
    // Two different maps, both keyed by class code, and picking the wrong one is a real mistake:
    //   elements    -> the morphology the box is drawn around ("Clue cell"). Showing this rather
    //                  than the diagnosis is what satisfies "without giving an explicit
    //                  diagnosis" (ML-ADR-001), so it is what a student mid-assessment sees.
    //   displayText -> the diagnosis name ("Bacterial vaginosis"), for surfaces allowed to name
    //                  the finding, and the vocabulary a human answers or authors a key in
    //                  (BE-ADR-018).
    elements: z.record(z.string(), z.string()),
    displayText: z.record(z.string(), z.string()),
})

export type ModelSpec = z.infer<typeof modelSpecSchema>

// `reason` is null when available; 'exam_open' is the only refusal today, but it is a string so a
// second reason (a suspended account, a closed term) doesn't need a new shape.
const detectionAvailabilitySchema = z.object({
    available: z.boolean(),
    reason: z.string().nullable(),
})

export type DetectionAvailability = z.infer<typeof detectionAvailabilitySchema>

export const detectionService = {
    // Naming a detector auto-chains a segmenter behind it server-side (ML-ADR-003,
    // DetectionsService.buildJob). `segmentModel` overrides which one:
    //   - omitted: the server's manifest default (unchanged behavior).
    //   - a model name: chain that one instead.
    //   - null: explicitly skip chaining, even for a detector. Multipart has no real
    //     null, so this sends the server's '' sentinel (RunDetectionDto normalizes it).
    // Ignored server-side for a non-detector model either way.
    async run(
        image: File | Blob,
        model: string,
        source: 'upload' | 'camera' = 'upload',
        segmentModel?: string | null,
    ): Promise<DetectionRecord> {
        const { $api } = useNuxtApp()
        const form = new FormData()
        const file =
            image instanceof File
                ? image
                : new File([image], 'snapshot.jpg', { type: 'image/jpeg' })
        form.append('image', file)
        form.append('model', model)
        form.append('source', source)
        if (segmentModel !== undefined) form.append('segment_model', segmentModel ?? '')
        const response = await $api(detectionRoutes.run, { method: 'POST', body: form })
        return detectionSchema.parse(response)
    },

    /**
     * One run, by id.
     *
     * Owner-or-staff server-side, and it answers 404 rather than 403 when you may not see it, so
     * there is deliberately nothing to distinguish "gone" from "not yours" here.
     *
     * Exists so a detection can be DEEP-LINKED: the library's runs list points at
     * `/image-detection?detection=<id>`, and that page loads a whole record into its viewer rather
     * than an id. Without this the only way into the viewer was picking a row out of the history
     * panel, which cannot reach a colleague's run.
     */
    async get(id: number): Promise<DetectionRecord> {
        const { $api } = useNuxtApp()
        const response = await $api(detectionRoutes.byId(id))
        return detectionSchema.parse(response)
    },

    async listMine(): Promise<DetectionRecord[]> {
        const { $api } = useNuxtApp()
        const response = await $api(detectionRoutes.listMine)
        return z.array(detectionSchema).parse(response)
    },

    // Admin-only: every user's history, newest first, each row carrying its submitter
    // (BE-ADR-024). The API enforces the admin role - a non-admin caller gets 403.
    async listAll(): Promise<DetectionWithSubmitter[]> {
        const { $api } = useNuxtApp()
        const response = await $api(detectionRoutes.listAll)
        return z.array(detectionWithSubmitterSchema).parse(response)
    },

    /**
     * Every run over ONE image, newest first.
     *
     * The annotation editor's seed step needs a `detection_id`, and v0.7 correctly made that
     * explicit because an image can now have several runs - so "seed from the detection" no longer
     * names one. Without this the only usable run was one made in the same session, which we asked
     * about on 2026-08-26.
     *
     * For STAFF this is every run by anyone, each row carrying its `creator`, so a seed is
     * resumable across sessions and across colleagues. For anyone else it narrows their own history
     * to that image: the filter narrows, it never widens.
     *
     * Submission-sourced runs are excluded at every role, staff included (BE-ADR-012). It costs the
     * annotation flow nothing - seeding wants a library run, and the write refuses a non-curated
     * image anyway - and staff read submission detections through the submission instead.
     */
    async listForImage(imageId: number): Promise<DetectionWithSubmitter[]> {
        const { $api } = useNuxtApp()
        const response = await $api(detectionRoutes.listMine, {
            query: { image_id: imageId },
        })
        return z.array(detectionWithSubmitterSchema).parse(response)
    },

    /**
     * How many detections the caller has run, without downloading them.
     *
     * One row and the `total` beside it (BE-ADR-026), rather than the whole history - which carries
     * every step and every polygon of every run - to put a number in a badge.
     *
     * A server older than v0.11.0-rc.1 ignores the paging params and answers with the bare list, so
     * the envelope does not parse - and that response is itself the answer, counted in place. One
     * request either way: retrying against the unpaged route would put a second 401 in the log for
     * every anonymous visitor, who is exactly who cannot have a history in the first place.
     */
    async countMine(): Promise<number> {
        const { $api } = useNuxtApp()
        const response = await $api(detectionRoutes.listMine, {
            query: { page: 1, per_page: 1 },
        })
        const paged = detectionPageSchema.safeParse(response)
        return paged.success ? paged.data.total : z.array(detectionSchema).parse(response).length
    },

    /**
     * May this caller use the AI tool right now? (Request 5.2.)
     *
     * Lets the UI hide the tool and turn a student away at the door rather than after they have
     * picked a model and uploaded a photo. NOT a security check: POST /detections re-derives the
     * same rule server-side, so a client that skips or fakes this gains nothing.
     */
    async availability(): Promise<DetectionAvailability> {
        const { $api } = useNuxtApp()
        const response = await $api(detectionRoutes.availability)
        return detectionAvailabilitySchema.parse(response)
    },

    async listModels(): Promise<ModelSpec[]> {
        const { $api } = useNuxtApp()
        const response = await $api(detectionRoutes.models)
        return z.array(modelSpecSchema).parse(response)
    },
}
