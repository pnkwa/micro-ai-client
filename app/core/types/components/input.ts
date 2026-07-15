import type { InputHTMLAttributes, InputTypeHTMLAttribute } from 'vue'
import type { CommonComponent } from '.'
import type * as icons from 'lucide-vue-next'

type AllIcon = keyof typeof icons
export type McInputProps = {
    modelValue?: string | number
    maxNumber?: number | string
    minNumber?: number | string
    iconPrepend?: AllIcon
    iconAppend?: AllIcon
    disabled?: boolean
    type?: InputTypeHTMLAttribute
} & CommonComponent &
    /* @vue-ignore */ Partial<InputHTMLAttributes>

export interface McInputEmit {
    (e: 'update:modelValue', payload: string | number): void
}
