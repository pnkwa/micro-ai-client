export const slideCollectionRoutes = {
    list: '/slide-collections',
    byId: (id: number) => `/slide-collections/${id}`,
    slides: (collectionId: number) => `/slide-collections/${collectionId}/slides`,
    slidesBulk: (collectionId: number) => `/slide-collections/${collectionId}/slides/bulk`,
    slideById: (slideId: number) => `/slides/${slideId}`,
}
