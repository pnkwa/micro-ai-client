export const detectionRoutes = {
    run: '/detections',
    listMine: '/detections',
    // Admin-only: every user's history, enriched with the submitter (BE-ADR-024).
    listAll: '/detections/all',
    byId: (id: number) => `/detections/${id}`,
    // Addressed by DETECTION id. The id is not stable - DATABASE_INIT_STRATEGY=recreate restarts
    // ids at 1 while the image volume persists - so this URL can mean a different picture
    // tomorrow, and the server sends it `no-cache` for exactly that reason (BE-ADR-027).
    image: (id: number) => `/detections/${id}/image`,
    // Addressed by the IMAGE's own UUID name. Names one file forever, so it is the cacheable one
    // and the one to use. Same bytes, same ?size=thumb, same auth header.
    imageByName: (imageId: string) => `/detections/images/${imageId}`,
    availability: '/detections/availability',
    models: '/models',
}
