/**
 * Adds `role` to page meta so `definePageMeta({ role: 'instructor' })` is typed and a
 * typo becomes a build error rather than a page that silently lets everyone in.
 * Enforced by app/middleware/auth.global.ts.
 */
declare module 'vue-router' {
    interface RouteMeta {
        role?: 'admin' | 'instructor' | 'student'
    }
}

export {}
