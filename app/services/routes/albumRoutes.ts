/**
 * An album is a NAMED SET of images (BE-ADR-032), not a folder that owns bytes.
 *
 * Membership is many-to-many, which the unique `content_hash` forces: one row per distinct picture
 * means the same bytes are reached by several people for several reasons, so filing an image into a
 * second album never removes it from the first. Deleting an album unfiles its images and deletes
 * none of them.
 *
 * `kind` is what makes "curated" expressible, and it gates two things: question authoring, and
 * whether an image may be annotated at all.
 *
 * Staff-only for every action, READS INCLUDED - a curated album IS the question-authoring pool, so
 * listing it to a student would hand them the pictures they are about to be asked about.
 */
export const albumRoutes = {
    list: '/albums',
    create: '/albums',
    byId: (id: number) => `/albums/${id}`,
    /**
     * Deliberately UNPAGED server-side, so it is the wrong tool for the gallery grid.
     *
     * `GET /images?album_id=` is the paged read of an album and is what the grid uses. This one is
     * for the small, whole-album reads (a picker, a count) where pulling the set is the point.
     */
    images: (albumId: number) => `/albums/${albumId}/images`,
    image: (albumId: number, imageId: number) => `/albums/${albumId}/images/${imageId}`,
}
