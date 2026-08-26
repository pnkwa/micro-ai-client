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
    availability: '/detections/availability',
    models: '/models',
}
