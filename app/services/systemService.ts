import { z } from 'zod'
import { systemRoutes } from './routes/systemRoutes'

/**
 * Component versions for the admin console's "About system" panel.
 *
 * Only two of the three come from here. The **frontend** version is not on this payload and
 * should not be: the client already knows its own build, and asking the API what version the
 * client is would report whatever the *server* believed at deploy time - which is exactly the
 * number that goes stale when only one of them is redeployed. It comes from
 * `runtimeConfig.public.appVersion`, baked from package.json at build time.
 *
 * The **image processor** binds no port, so the server cannot call it. It reports itself by
 * writing a short-lived heartbeat to the Redis both already share (BE/ML: `service/heartbeat.py`),
 * and the absence of that key is what "unhealthy" means - which is why `version` is nullable
 * here. A down worker has no version to report, and inventing a last-known one would be a lie
 * about something that is not running.
 */
const workerStatusSchema = z.object({
    healthy: z.boolean(),
    version: z.string().nullable(),
    /** Seconds since the worker's last heartbeat; null when there is no beat to measure. */
    lastSeenSeconds: z.number().nullable(),
})

export const systemInfoSchema = z.object({
    backend: z.object({ version: z.string() }),
    imageProcessor: workerStatusSchema,
})

export type WorkerStatus = z.infer<typeof workerStatusSchema>
export type SystemInfo = z.infer<typeof systemInfoSchema>

export const systemService = {
    async info(): Promise<SystemInfo> {
        const { $api } = useNuxtApp()
        const response = await $api(systemRoutes.info)
        return systemInfoSchema.parse(response)
    },
}
