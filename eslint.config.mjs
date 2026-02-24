import withNuxt from './.nuxt/eslint.config.mjs'
import prettier from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'

export default withNuxt(
    {
        ignores: [
            'node_modules',
            '.nuxt',
            '.husky',
            '**/*.md',
            'deployments',
            'nginx',
            'public',
            '**/*.d.ts',
        ],
    },
    prettierConfig,
    {
        plugins: {
            prettier,
        },
        rules: {
            'prettier/prettier': 'error',

            'no-console': 'error',
            'vue/v-slot-style': 'error',
            'vue/v-on-style': 'error',
            'vue/prop-name-casing': 'error',
            'no-unused-vars': 'off',

            'vue/multi-word-component-names': 'off',
            'vue/html-indent': 'off',
            'vue/html-self-closing': 'off',
            'vue/return-in-computed-property': 'off',
            '@typescript-eslint/no-dynamic-delete': 'off',
            'vue/require-default-prop': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            'vue/valid-v-slot': 'off',
        },
    },
)
