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
    img_path: z.string(),
    model: z.string(),
    created_by: z.number().nullable().optional(),
    steps: z.array(detectionStepSchema),
    created_at: z.string(),
})

// The admin browse (GET /detections/all, BE-ADR-024) enriches each row with its submitter. The
// server selects only safe columns off the creator — never the password hash — and leaves it
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

    async listMine(): Promise<DetectionRecord[]> {
        const { $api } = useNuxtApp()
        const response = await $api(detectionRoutes.listMine)
        return z.array(detectionSchema).parse(response)
    },

    // Admin-only: every user's history, newest first, each row carrying its submitter
    // (BE-ADR-024). The API enforces the admin role — a non-admin caller gets 403.
    async listAll(): Promise<DetectionWithSubmitter[]> {
        const { $api } = useNuxtApp()
        const response = await $api(detectionRoutes.listAll)
        return z.array(detectionWithSubmitterSchema).parse(response)
    },

    // The image a detection ran on. An <img src> can't carry the Authorization header $api
    // attaches, so fetch it as a blob and hand back an object URL; caller must revoke it.
    async imageBlobUrl(detectionId: number): Promise<string> {
        const { $api } = useNuxtApp()
        const blob = await $api<Blob>(detectionRoutes.image(detectionId), {
            responseType: 'blob',
        })
        return URL.createObjectURL(blob)
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
