export const detectionRoutes = {
    run: '/detections',
    listMine: '/detections',
    byId: (id: number) => `/detections/${id}`,
    image: (id: number) => `/detections/${id}/image`,
    models: '/models',
}
