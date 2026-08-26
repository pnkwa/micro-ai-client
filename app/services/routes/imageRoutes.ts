/**
 * Images are first-class since v0.7 (BE-ADR-031): one row per stored picture, and a detection is a
 * run OVER an image rather than a description of one.
 *
 * This replaces `detectionRoutes.imageByName`. The old URL carried a UUID basename and was a
 * capability: the name was unguessable, so possessing it WAS the authorization (BE-ADR-027). An
 * integer id is enumerable, so that argument is gone. The route currently checks authentication
 * only, with the real permission union a recorded deferral, which has two consequences for callers:
 * an image URL is no longer shareable between users, and a 403 is now a realistic response where
 * previously only a 404 was.
 */
export const imageRoutes = {
    // The library listing and the upload share a path; `list` takes the BE-ADR-026 paging pair plus
    // the ?album_id / ?q / ?mine / ?annotated filters, all optional and ANDed server-side.
    list: '/images',
    upload: '/images',
    byId: (id: number) => `/images/${id}`,
    file: (id: number) => `/images/${id}/file`,
    // The bytes already arrived through POST /images, so running a model over them is JSON rather
    // than multipart. Lives in DetectionsModule server-side despite the /images path.
    detect: (id: number) => `/images/${id}/detect`,
    annotations: (id: number) => `/images/${id}/annotations`,
    seedAnnotations: (id: number) => `/images/${id}/annotations/seed-from-detection`,
    /**
     * THREE segments, and not `/images/export`, which never worked.
     *
     * `@Get('export')` sat in ImageAnnotationsController while `@Get(':id')` sat in ImagesController;
     * Nest registers by module resolution order, ImagesModule resolves first, so `/images/export`
     * matched `:id`, hit a ParseIntPipe and came back 400. Reported by us on 2026-08-26, confirmed
     * and fixed by moving the path rather than reordering the module imports - a three-segment path
     * cannot collide with `/images/:id` or `/images/:id/file` under any resolution order.
     */
    annotationsExport: '/images/annotations/export',
}
