import { z } from 'zod'
import { imageRoutes } from './routes/imageRoutes'
import { albumKindSchema } from './albumService'
import { detectionSchema, type DetectionRecord } from './detectionService'

/**
 * The stored picture, as every read carries it.
 *
 * `img_path` is deliberately absent and the server no longer sends it: it is an absolute path on
 * the volume shared with the worker, it was never useful to a browser, and the v0.7 port put it on
 * the wire by serializing the entity directly. Nothing here has to strip it any more, but note that
 * `GET /albums/:id/images` still joins the ENTITY rather than this view, so it does still carry
 * `img_path` - which is one of the reasons albumService does not parse the image it nests.
 *
 * `metadata` is an open FLAT bag, so it is typed as one. The reserved `verdict` key is BE-ADR-032's
 * authoring hint: it is a prefill convenience, nothing reads it at grade time, and `PATCH` refuses
 * a write to it with a 400.
 */
export const imageBaseSchema = z.object({
    id: z.number(),
    content_hash: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    // Who supplied the bytes FIRST. Under the unique content hash, later uploaders of identical
    // bytes are not recorded at all, so this is provenance and NOT an ownership claim.
    created_by: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
})

/** An album an image is filed into, as the detail read names it. */
const albumRefSchema = z.object({
    id: z.number(),
    name: z.string(),
    kind: albumKindSchema,
})

/**
 * The library view: the row plus the two flags the grid needs.
 *
 * Both are computed for a whole page in two indexed queries rather than one pair per tile, which is
 * the entire reason they exist - we asked for them on 2026-08-26 because a grid of N tiles otherwise
 * costs N extra requests to answer "is this annotated?" and "may this be annotated?".
 *
 * *** `annotation_count` IS THE CALLER'S OWN COUNT, NOT THE LIBRARY'S (BE-ADR-038). *** A tile
 * reading "0 annotations" means YOU have not annotated it, not that nobody has, and `?annotated=`
 * filters the same way - it is your labelling worklist rather than a view of what exists. Anything
 * phrased as "unannotated images" in the UI is therefore about the person reading it.
 *
 * `in_curated_album` is an EXISTS, never an equality on the row: an image can sit in a curated album
 * and someone's personal one at the same time. It no longer gates annotating - that guard was
 * dropped on 2026-08-26 when BE-ADR-030 was amended, and `curated` now gates question authoring
 * alone - so this is a badge in the library rather than a precondition for the Annotate button.
 */
export const imageSchema = imageBaseSchema.extend({
    annotation_count: z.number(),
    in_curated_album: z.boolean(),
    // Present on the single read only, where one extra query is cheap.
    albums: z.array(albumRefSchema).optional(),
})

const imagePageSchema = z.object({
    data: z.array(imageSchema),
    total: z.number(),
})

export type LibraryImage = z.infer<typeof imageSchema>
export type AlbumRef = z.infer<typeof albumRefSchema>
export type ImagePage = z.infer<typeof imagePageSchema>

/** What the listing can be narrowed by, all optional and ANDed server-side. */
export interface ImageFilters {
    /** Only images filed into this album. This is the PAGED read of an album. */
    album_id?: number
    /** Case-insensitive substring over `metadata.title`. An untitled image never matches. */
    q?: string
    /**
     * `true` narrows to the caller's own uploads.
     *
     * There is deliberately no "other people's": upload is idempotent on content, so one row can
     * have many uploaders and `created_by` records only the first, which means "not mine" would
     * exclude pictures you did upload. Send the flag or omit it - never send `false` meaning
     * "theirs", because the server reads `mine=false` as no filter at all.
     */
    mine?: boolean
    /**
     * `true` has at least one of YOUR annotations; `false` has none of yours (BE-ADR-038).
     *
     * `false` is the labelling worklist, and it is per-person: an image a colleague has already
     * covered still appears in yours. That is the useful reading for a shared library, and it is
     * also the only one available, since the count it filters on is caller-scoped too.
     */
    annotated?: boolean
    page?: number
    per_page?: number
}

/** A fresh row versus an idempotent hit, which is the whole point of 201-vs-200 on upload. */
export interface UploadResult {
    image: LibraryImage
    created: boolean
}

/** The grid's page size. Named so the page and the service cannot drift about it. */
export const LIBRARY_PAGE_SIZE = 24

export const imageService = {
    /**
     * The library listing, ALWAYS paged.
     *
     * The BE-ADR-026 shape switch means omitting `per_page` would return a bare array instead of
     * the envelope, so this always sends one: a gallery that cannot page is a gallery that
     * downloads the whole library to show twenty-four tiles.
     */
    async list(filters: ImageFilters = {}): Promise<ImagePage> {
        const { $api } = useNuxtApp()
        const { page = 1, per_page = LIBRARY_PAGE_SIZE, ...rest } = filters
        const response = await $api(imageRoutes.list, {
            query: {
                page,
                per_page,
                ...(rest.album_id !== undefined && { album_id: rest.album_id }),
                ...(rest.q && { q: rest.q }),
                // Only ever sent as true; see the note on ImageFilters.mine.
                ...(rest.mine && { mine: true }),
                ...(rest.annotated !== undefined && { annotated: rest.annotated }),
            },
        })
        return imagePageSchema.parse(response)
    },

    /** One image, plus the albums it is filed into - the detail panel in a single round trip. */
    async get(id: number): Promise<LibraryImage> {
        const { $api } = useNuxtApp()
        const response = await $api(imageRoutes.byId(id))
        return imageSchema.parse(response)
    },

    /**
     * Store bytes, WITHOUT running a model over them (BE-ADR-031, amending BE-ADR-007).
     *
     * Until v0.7 the detection endpoint was the only binary path into the backend, so curating a
     * picture meant running a detector first. That dance is gone, and this is what the library's
     * uploader calls.
     *
     * IDEMPOTENT ON CONTENT: `content_hash` is unique, so re-posting identical bytes returns the
     * row that already exists. The status is the only way to tell - 201 created, 200 already there
     * - so this reads it off the raw response and hands back `created`, because "already in the
     * library" is a materially different thing to tell someone than "uploaded".
     */
    async upload(file: File): Promise<UploadResult> {
        const { $api } = useNuxtApp()
        const form = new FormData()
        form.append('image', file)
        const response = await $api.raw(imageRoutes.upload, { method: 'POST', body: form })
        return {
            image: imageSchema.parse(response._data),
            created: response.status === 201,
        }
    },

    /**
     * Edit the metadata bag. SHALLOW MERGE, and an explicit `null` DELETES a key.
     *
     * Send only the keys you are changing. The bag is shared - the panel's title, the export's
     * `title`, and BE-ADR-032's `verdict` all live in it - so a read-modify-write of the whole
     * object could clobber a key this caller does not own, including in the window between its read
     * and its write.
     *
     * `verdict` is refused with a 400 and must never be sent from the metadata form.
     */
    async updateMetadata(id: number, metadata: Record<string, unknown>): Promise<LibraryImage> {
        const { $api } = useNuxtApp()
        const response = await $api(imageRoutes.byId(id), {
            method: 'PATCH',
            body: { metadata },
        })
        return imageSchema.parse(response)
    },

    /**
     * 204, or a 409 naming the table that still holds it.
     *
     * Annotations and album filings cascade. Detections and questions are RESTRICT, so
     * upload -> run a model -> change your mind is a 409: that is the constraint working, because
     * cascading would silently destroy the detection history BE-ADR-024's dedup exists to keep.
     * Surface the server's message rather than a generic failure; it names the blocker.
     */
    async remove(id: number): Promise<void> {
        const { $api } = useNuxtApp()
        await $api(imageRoutes.byId(id), { method: 'DELETE' })
    },

    /**
     * Run a model over an image already in the library.
     *
     * JSON rather than multipart, because the bytes arrived at upload. Naming a DETECTOR chains the
     * manifest's segmenter behind it (ML-ADR-003); `segmentModel` overrides which one, and null
     * opts out of chaining entirely. Re-running the same image under the same pair reuses the
     * stored result and skips the worker, but still records a row under the caller's name.
     */
    async detect(
        id: number,
        model: string,
        segmentModel?: string | null,
    ): Promise<DetectionRecord> {
        const { $api } = useNuxtApp()
        const response = await $api(imageRoutes.detect(id), {
            method: 'POST',
            body: {
                model,
                // JSON carries null, so skip travels as a real null (not an empty-string
                // sentinel): the server reads null as "opt out of chaining".
                ...(segmentModel !== undefined && { segment_model: segmentModel }),
            },
        })
        return detectionSchema.parse(response)
    },

    /**
     * The image's bytes as an object URL. An `<img src>` can't carry the Authorization header
     * `$api` attaches, so fetch it as a blob; THE CALLER MUST REVOKE IT.
     *
     * `size: 'thumb'` asks for the server's cached 256px downscale - ~20 KB against a multi-MB
     * microscopy frame, and all a grid tile can show. Opt-in, because anything that draws boxes
     * over the picture needs the pixels the coordinates were measured against.
     *
     * No fallback needed in either direction: a server too old to know `size` ignores the query
     * param and returns the original, and a current one returns the original when the image is
     * already under the cap or cannot be decoded.
     *
     * *** PASS `version` (the row's `content_hash`) WHEREVER YOU HAVE IT. *** The response is
     * `Cache-Control: private, max-age=31536000, immutable`, which tells the browser never to
     * revalidate - it will not even send `If-None-Match`, so the server's content-keyed ETag never
     * gets a chance to catch a stale entry. That is only safe if the URL identifies the BYTES, and
     * `/images/:id/file` identifies a ROW: wipe the database in dev and the identity sequence walks
     * back to 1, so every browser that ever loaded the old library keeps serving those pictures
     * under the new ids for a year. Threading the hash through makes the URL content-addressed and
     * the immutable cache honest. The server ignores the extra param.
     *
     * Optional because not every caller has it: a detection row carries `image_id` but no hash
     * (both left the wire in v0.7), so the detection and submission surfaces still ask by id alone.
     * They are read-only views of images nobody re-uploads, so the exposure is small, but it is the
     * same bug and it is worth a per-row hash on those payloads eventually.
     */
    async blobUrl(imageId: number, size?: 'thumb', version?: string): Promise<string> {
        const { $api } = useNuxtApp()
        const blob = await $api<Blob>(imageRoutes.file(imageId), {
            responseType: 'blob',
            query: {
                ...(size && { size }),
                // Sixteen chars, matching the prefix the server's own ETag uses. The full 64 would
                // work identically and only makes the URL harder to read in a network log.
                ...(version && { v: version.slice(0, 16) }),
            },
        })
        return URL.createObjectURL(blob)
    },

    /**
     * The stored image as a File, for re-submitting a photo the student already sent.
     *
     * Full size, NOT the thumb the redo preview renders: the preview only has to be looked at,
     * whereas this becomes the answer, and handing the detector a 256px downscale of a microscopy
     * field would quietly cost the student the analysis their mark depends on.
     */
    async file(imageId: number): Promise<File> {
        const { $api } = useNuxtApp()
        const blob = await $api<Blob>(imageRoutes.file(imageId), {
            responseType: 'blob',
        })
        // Named after the row, since the stored filename is no longer on the wire.
        return new File([blob], `image-${imageId}.jpg`, { type: blob.type || 'image/jpeg' })
    },
}
