export const practiceSetRoutes = {
    list: '/practice-sets',
    published: '/practice-sets/published',
    byId: (id: number) => `/practice-sets/${id}`,
    items: (setId: number) => `/practice-sets/${setId}/items`,
    itemById: (itemId: number) => `/practice-sets/items/${itemId}`,
}
