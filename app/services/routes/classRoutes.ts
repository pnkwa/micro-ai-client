export const classRoutes = {
    list: '/classes',
    byId: (id: number) => `/classes/${id}`,
    students: (id: number) => `/classes/${id}/students`,
    grades: (id: number) => `/classes/${id}/grades`,
    staff: (id: number) => `/classes/${id}/staff`,
}
