import { z } from 'zod'
import { detectionRoutes } from './routes/detectionRoutes'

const detectionStepSchema = z.object({
    id: z.number(),
    step: z.string(),
    step_order: z.number(),
    predicted_class: z.string(),
    confidence: z.number(),
    probs: z.array(z.number()),
    created_at: z.string(),
})

const detectionSchema = z.object({
    id: z.number(),
    source: z.enum(['upload', 'camera', 'submission']),
    img_path: z.string(),
    model: z.string(),
    created_by: z.number().nullable().optional(),
    steps: z.array(detectionStepSchema),
    created_at: z.string(),
})

export type DetectionStep = z.infer<typeof detectionStepSchema>
export type DetectionRecord = z.infer<typeof detectionSchema>

export const DEFAULT_MODEL = 'HRP_FvsN_best_resnet18'

export const detectionService = {
    async run(
        image: File | Blob,
        model: string = DEFAULT_MODEL,
        source: 'upload' | 'camera' = 'upload',
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
        const response = await $api(detectionRoutes.run, { method: 'POST', body: form })
        return detectionSchema.parse(response)
    },

    async listMine(): Promise<DetectionRecord[]> {
        const { $api } = useNuxtApp()
        const response = await $api(detectionRoutes.listMine)
        return z.array(detectionSchema).parse(response)
    },
}
