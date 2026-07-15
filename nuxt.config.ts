import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',
    devServer: {
        port: Number(process.env.NUXT_DEV_PORT ?? 3001),
    },
    runtimeConfig: {
        public: {
            apiBaseUrl: '/api',
            authDisabled: false,
        },
    },
    devtools: { enabled: false },
    css: ['~/assets/styles/main.css'],
    vite: {
        plugins: [
            // @ts-ignore
            tailwindcss(),
        ],
        server: {
            proxy: {
                '/api': {
                    target: process.env.NUXT_PUBLIC_API_BASE_URL_TARGET ?? 'http://localhost:3000',
                    changeOrigin: true,
                    rewrite: (path: string) => path.replace(/^\/api/, ''),
                },
            },
        },
    },
    ssr: false,
    modules: [
        '@pinia/nuxt',
        '@nuxt/eslint',
        '@vee-validate/nuxt',
        '@vueuse/nuxt',
        '@nuxt/fonts',
        'nuxt-svgo',
    ],
    components: [
        { path: '~/core/components', prefix: 'Mc', extensions: ['.vue'] },
        { path: '~/core/components/ui', prefix: 'Mc', extensions: ['.vue'] },
    ],
    fonts: {
        defaults: {
            weights: [100, 200, 300, 400, 500, 600, 700, 800],
        },
        families: [
            { name: 'Kanit', provider: 'google', global: true, preload: true },
            { name: 'Sarabun', provider: 'google', global: true, preload: true },
        ],
        provider: 'google',
    },
    imports: {
        dirs: ['core/**'],
    },
    app: {
        head: {
            title: 'MicroAI',
            htmlAttrs: {
                lang: 'en',
            },
            meta: [
                { name: 'viewport', content: 'width=device-width, initial-scale=1' },
                { charset: 'utf-8' },
                { name: 'format-detection', content: 'telephone=no' },
            ],
        },
    },
})
