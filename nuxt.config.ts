import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',
    devtools: { enabled: true },
    vite: {
        plugins: [
            // @ts-ignore
            tailwindcss(),
        ],
    },
    ssr: false,
    components: [
        { path: '~/core/components/ui', prefix: 'Mc', extensions: ['.vue'] },
        { path: '~/core/components', prefix: 'Mc', extensions: ['.vue'] },
    ],
    imports: {
        dirs: ['core/**'],
    },
})
