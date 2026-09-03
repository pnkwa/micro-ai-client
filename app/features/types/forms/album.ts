import z from 'zod'

/**
 * An album's editable fields (BE-ADR-032).
 *
 * `kind` defaults to `personal` and the server defaults it the same way, deliberately: a new album
 * is never accidentally an authoring pool. `curated` is the vetted set question authoring draws
 * from - it no longer gates annotation, which was amended out of BE-ADR-030 on 2026-08-26.
 */
export const albumFormSchema = z.object({
    name: z.string().min(1, 'Album name is required').max(100, 'Album name is too long'),
    // Optional, and empty means empty rather than absent: the PATCH reads an explicit null as
    // "clear it", which is what an emptied field should do.
    description: z.string().max(500, 'Description is too long').optional(),
    kind: z.enum(['curated', 'personal', 'system', 'assignment']),
})

export type AlbumFormData = z.infer<typeof albumFormSchema>
