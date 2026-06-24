export const classRoutes = {
    list: '/classes',
    byId: (id: number) => `/classes/${id}`,
    students: (id: number) => `/classes/${id}/students`,
    staff: (id: number) => `/classes/${id}/staff`,
}
