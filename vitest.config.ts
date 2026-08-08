import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Unit tests for pure logic under `app/`: no Nuxt runtime, no DOM.
 *
 * Deliberately plain Vitest rather than @nuxt/test-utils: the things worth testing here are
 * framework-free modules (the answer-key sheet parser, the slide-label normalizer), and a Nuxt
 * environment would add a slow boot for nothing. Anything needing a Nuxt context belongs in the
 * Playwright suites at the repo root instead.
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['app/**/*.spec.ts'],
    },
    resolve: {
        alias: {
            // Mirrors Nuxt's `~` -> srcDir alias so the modules under test import the same way
            // they do in the app.
            '~': fileURLToPath(new URL('./app', import.meta.url)),
        },
    },
})
