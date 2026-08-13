// Declared here rather than in ConfirmModal.vue: `imports.dirs: ['core/**']` makes Nuxt
// auto-import exported types, and for a type exported from an SFC it writes an extensionless path
// into .nuxt/types/imports.d.ts. That file is a global type file for @vue/compiler-sfc, whose
// resolver never tries `.vue`, so the whole global scope fails to parse and every `extends` in
// every component reports "Failed to resolve extends base type". Keep component prop types in .ts.
export interface ConfirmModalProps {
    title?: string
    description?: string
    confirmText?: string
    cancelText?: string
    variant?: 'default' | 'destructive'
}

export { default as ConfirmModal } from './ConfirmModal.vue'
