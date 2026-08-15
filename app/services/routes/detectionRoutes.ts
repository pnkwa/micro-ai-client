export const detectionRoutes = {
    run: '/detections',
    listMine: '/detections',
    // Admin-only: every user's history, enriched with the submitter (BE-ADR-024).
    listAll: '/detections/all',
    byId: (id: number) => `/detections/${id}`,
    image: (id: number) => `/detections/${id}/image`,
    availability: '/detections/availability',
    models: '/models',
}
