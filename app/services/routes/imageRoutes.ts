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
    byId: (id: number) => `/images/${id}`,
    file: (id: number) => `/images/${id}/file`,
}
