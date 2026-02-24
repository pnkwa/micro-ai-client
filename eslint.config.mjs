// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook'

// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

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
    {
        rules: {
            // error rule
            'no-console': 'error',
            'vue/v-slot-style': 'error',
            'vue/v-on-style': 'error',
            'vue/prop-name-casing': 'error',
            'no-unused-vars': 'off',

            // off rule
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
    storybook.configs['flat/recommended'],
)
