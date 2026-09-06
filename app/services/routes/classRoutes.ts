export const classRoutes = {
    list: '/classes',
    byId: (id: number) => `/classes/${id}`,
    archive: (id: number) => `/classes/${id}/archive`,
    students: (id: number) => `/classes/${id}/students`,
    grades: (id: number) => `/classes/${id}/grades`,
    staff: (id: number) => `/classes/${id}/staff`,
    removeStaff: (id: number, staffId: number) => `/classes/${id}/staff/${staffId}`,
}
