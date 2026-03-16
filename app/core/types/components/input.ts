import type { HTMLAttributes } from 'vue'
import type * as icons from 'lucide-vue-next'

type IconName = keyof typeof icons

export interface McInputProps {
    defaultValue?: string | number
    modelValue?: string | number
    class?: HTMLAttributes['class']
    type?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'url'
    name?: string
    disabled?: boolean
    maxNumber?: number | string
    iconPrepend?: IconName
    iconAppend?: IconName
}

export interface McInputEmit {
    (e: 'update:modelValue', payload: string | number | undefined): void
}
