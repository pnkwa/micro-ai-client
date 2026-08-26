import { z } from 'zod'
import { albumRoutes } from './routes/albumRoutes'

/**
 * What an album is FOR, and the only field on it that changes behaviour.
 *
 * `curated` is the vetted pool: question authoring picks from it, and it is the precondition for
 * annotating an image at all (BE-ADR-030's consent question, answered by BE-ADR-032). `personal` is
 * the default precisely so a new album is never accidentally an authoring pool.
 */
export const ALBUM_KINDS = ['curated', 'personal', 'system'] as const
export const albumKindSchema = z.enum(ALBUM_KINDS)
export type AlbumKind = z.infer<typeof albumKindSchema>

const albumSchema = z.object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable(),
    kind: albumKindSchema,
    // References STAFF, not users, so a student cannot own a curated library by construction.
    // Nullable because ON DELETE SET NULL: an album outlives whoever made it.
    owner_id: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
})

/**
 * A membership row, as `GET /albums/:id/images` returns it.
 *
 * `added_by` is who filed the image HERE, which is not `images.created_by` (whoever uploaded the
 * bytes first, possibly years earlier for an unrelated purpose). For a curated album this is the
 * column that answers "who vetted this into the library".
 *
 * THE NESTED IMAGE IS DELIBERATELY NOT PARSED, and z.object drops it for free. Two reasons, and
 * the second is the one that matters: this route joins the ENTITY rather than the library view, so
 * the image it nests carries none of the computed flags anything here would want; and parsing it
 * would mean importing the image schema, which imports this module back for `kind` - a cycle whose
 * only purpose would be a field with no caller. Use `imageService.list({ album_id })` for the
 * images themselves. It is the paged read, and it returns the view.
 */
const albumImageSchema = z.object({
    album_id: z.number(),
    image_id: z.number(),
    added_by: z.number().nullable(),
    added_at: z.string(),
})

export type Album = z.infer<typeof albumSchema>
export type AlbumImage = z.infer<typeof albumImageSchema>

export interface AlbumInput {
    name: string
    description?: string | null
    kind?: AlbumKind
}

export const albumService = {
    async list(): Promise<Album[]> {
        const { $api } = useNuxtApp()
        const response = await $api(albumRoutes.list)
        return z.array(albumSchema).parse(response)
    },

    async get(id: number): Promise<Album> {
        const { $api } = useNuxtApp()
        const response = await $api(albumRoutes.byId(id))
        return albumSchema.parse(response)
    },

    async create(input: AlbumInput): Promise<Album> {
        const { $api } = useNuxtApp()
        const response = await $api(albumRoutes.create, { method: 'POST', body: input })
        return albumSchema.parse(response)
    },

    // PATCH reads an omitted key as "leave it alone" and an explicit null on `description` as
    // "clear it", which is the same rule PATCH /images/:id applies to metadata.
    async update(id: number, input: Partial<AlbumInput>): Promise<Album> {
        const { $api } = useNuxtApp()
        const response = await $api(albumRoutes.byId(id), { method: 'PATCH', body: input })
        return albumSchema.parse(response)
    },

    // 204. The membership rows cascade; THE IMAGES DO NOT. An album is a view over the library,
    // not a container that owns bytes, so this unfiles and nothing more.
    async remove(id: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(albumRoutes.byId(id), { method: 'DELETE' })
    },

    /**
     * Every image in the album, UNPAGED.
     *
     * The grid does not use this - `imageService.list({ album_id })` is the paged read and carries
     * the per-row flags besides. This is for the whole-album reads where pulling the set is the
     * point, and it is the wrong tool for anything that has to scale.
     */
    async listImages(albumId: number): Promise<AlbumImage[]> {
        const { $api } = useNuxtApp()
        const response = await $api(albumRoutes.images(albumId))
        return z.array(albumImageSchema).parse(response)
    },

    // Idempotent: re-filing an image already here returns the existing membership rather than a
    // 409, because the caller asked for a state that now holds.
    async addImage(albumId: number, imageId: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(albumRoutes.images(albumId), {
            method: 'POST',
            body: { image_id: imageId },
        })
    },

    async removeImage(albumId: number, imageId: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(albumRoutes.image(albumId, imageId), { method: 'DELETE' })
    },
}
