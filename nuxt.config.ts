import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

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
            // Baked at build time from package.json, and deliberately not fetched from the
            // API: the frontend is deployed separately (client-dist), so the server's idea of
            // "the client version" is the one that goes stale when only one side ships.
            appVersion: pkg.version,
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
                // Belt and suspenders on page zoom: this pins the scale app-wide where the browser
                // honours it, and the annotator surfaces additionally set `touch-action: pan-x
                // pan-y` (AnnotatorShell), which reliably blocks pinch/double-tap page zoom on the
                // devices - iOS Safari among them - that ignore user-scalable. The canvas keeps its
                // own image zoom through `touch-action: none`.
                {
                    name: 'viewport',
                    content:
                        'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
                },
                { charset: 'utf-8' },
                { name: 'format-detection', content: 'telephone=no' },
            ],
            // The microscope, not Nuxt's default triangle: the tab was the last place still
            // naming the framework rather than the product. Same lucide glyph the sidebar uses as
            // the app's mark, so the two cannot drift.
            //
            // SVG only. There is no .ico fallback because every browser this app supports takes an
            // SVG favicon, and the .ico that shipped before was Nuxt's default artwork - keeping it
            // would have meant serving the framework's logo to whoever fell back to it.
            link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
        },
    },
})
