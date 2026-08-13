import { z } from 'zod'
import { systemConfigRoutes } from './routes/systemConfigRoutes'

// One runtime-config key as GET /system-config reports it. `value` is deliberately untyped
// (the backend column is jsonb): today every key is a boolean, but the admin panel renders
// generically off `typeof value`, so a future string/number key needs no client change.
export const systemConfigEntrySchema = z.object({
    key: z.string(),
    value: z.unknown(),
    description: z.string(),
    source: z.enum(['database', 'env-seed']),
    updated_by: z.number().nullable().optional(),
    updated_at: z.coerce.date().optional(),
})

export type SystemConfigEntry = z.infer<typeof systemConfigEntrySchema>

// PATCH returns the persisted row only — the bare `system_config` entity, WITHOUT the derived
// `description`/`source` that GET synthesises. Parsing it against the full entry schema would
// throw on success (the "Failed" toast bug), so writes validate against just what comes back.
const systemConfigRowSchema = z.object({
    key: z.string(),
    value: z.unknown(),
    updated_by: z.number().nullable().optional(),
    updated_at: z.coerce.date().optional(),
})

export type SystemConfigRow = z.infer<typeof systemConfigRowSchema>

export const systemConfigService = {
    // Every known key with its effective value — including keys never written, which report their
    // env-seeded default with source 'env-seed'.
    async list(): Promise<SystemConfigEntry[]> {
        const { $api } = useNuxtApp()
        const response = await $api(systemConfigRoutes.list)
        return z.array(systemConfigEntrySchema).parse(response)
    },

    // Set one key. Takes effect on the backend's next request (no restart). Returns the persisted
    // row; the caller typically re-lists to pick up source/updated_by/updated_at.
    async set(key: string, value: unknown): Promise<SystemConfigRow> {
        const { $api } = useNuxtApp()
        const response = await $api(systemConfigRoutes.byKey(key), {
            method: 'PATCH',
            body: { value },
        })
        return systemConfigRowSchema.parse(response)
    },
}
