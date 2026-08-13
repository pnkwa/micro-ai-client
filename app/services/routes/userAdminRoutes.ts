export const userAdminRoutes = {
    list: '/users',
    byId: (id: number) => `/users/${id}`,
    role: (id: number) => `/users/${id}/role`,
    staff: '/users/staff',
    student: '/users/student',
}
