import { imageService } from '~/services/imageService'

/**
 * Fetched image bytes, held as object URLs and keyed by IMAGE id.
 *
 * An `<img src>` cannot carry the Authorization header `$api` attaches, so every picture in the app
 * is fetched as a blob and rendered from an object URL. That is three lines; the reasons this is a
 * composable rather than three lines repeated are the parts around it, all of which were learned
 * the hard way in `DetectionHistory.vue` and are easy to drop when copying:
 *
 *  - **the cache**, because re-filtering or re-paging a grid re-lists the same rows;
 *  - **the in-flight set**, because a tile that scrolls out and back announces itself again, and
 *    without it that is a second request for the same image;
 *  - **the revoke**, because an object URL pins its blob in memory until it is released;
 *  - **the per-image error**, because 403 is a realistic answer now and a broken-image icon that
 *    never resolves is worse than a caption saying why.
 *
 * Keyed by image id rather than by whatever row is displaying it. `DetectionHistory` keys its cache
 * by DETECTION id because two runs over one image are two rows, and it fetches by the image id
 * underneath; a gallery has one row per image, so here the two are the same key.
 */

/** Why an image did not load. `forbidden` is worth distinguishing; everything else is not. */
export type ImageLoadError = 'forbidden' | 'unavailable'

export const useImageObjectUrls = () => {
    const urls = ref<Record<number, string>>({})
    const errors = ref<Record<number, ImageLoadError>>({})

    // In flight as well as done: see the note above about a tile scrolling out and back.
    const pending = new Set<number>()

    /**
     * What each cached entry was fetched FOR, so an id that changes meaning is refetched.
     *
     * The cache is keyed by id, and an id is not a stable name for a picture: recreate the dev
     * database and the sequence walks back to 1 while this map still holds the previous library's
     * blobs. Remembering the version an entry was built from turns "id 1" into "id 1 as it was",
     * which is the only reading that makes an id-keyed cache safe.
     */
    const versions = new Map<number, string>()

    const revokeAll = () => {
        for (const url of Object.values(urls.value)) URL.revokeObjectURL(url)
        urls.value = {}
        errors.value = {}
        pending.clear()
        versions.clear()
    }

    /**
     * Fetch one image if it is not already loaded, loading, or known to have failed.
     *
     * A failure is remembered, so a tile that scrolls past a forbidden image repeatedly does not
     * re-request it every time.
     *
     * `version` is the row's `content_hash`. Pass it wherever the caller has one: it goes into the
     * URL so the browser's immutable cache is content-addressed rather than id-addressed, and it
     * invalidates this cache here for the same reason. See `imageService.blobUrl`.
     */
    const load = async (imageId: number, size?: 'thumb', version?: string): Promise<void> => {
        // A version that does not match what is held means this id now names different bytes, so
        // the entry is dropped rather than served. Checked before the early return below, which
        // would otherwise report the stale blob as a cache hit.
        if (
            version &&
            versions.get(imageId) !== version &&
            (urls.value[imageId] || errors.value[imageId])
        )
            forget(imageId)
        if (urls.value[imageId] || errors.value[imageId] || pending.has(imageId)) return
        pending.add(imageId)
        try {
            urls.value[imageId] = await imageService.blobUrl(imageId, size, version)
            if (version) versions.set(imageId, version)
        } catch (error) {
            // BE-ADR-031's permission union on GET /images/:id/file is still a recorded deferral,
            // and that route deliberately carries no @Roles, so a 403 is a realistic answer where
            // previously only a 404 was. Distinguish it: "you may not see this" and "this is gone"
            // are different things to tell someone.
            errors.value[imageId] = isForbidden(error) ? 'forbidden' : 'unavailable'
        } finally {
            pending.delete(imageId)
        }
    }

    /** Drop one image from the cache, e.g. after it is deleted, so a re-add re-fetches. */
    function forget(imageId: number) {
        const url = urls.value[imageId]
        if (url) URL.revokeObjectURL(url)
        delete urls.value[imageId]
        delete errors.value[imageId]
        versions.delete(imageId)
    }

    // onScopeDispose rather than onUnmounted so this is safe to call from anywhere with an effect
    // scope, not only directly inside a component's setup.
    onScopeDispose(revokeAll)

    return { urls, errors, load, forget, revokeAll }
}
