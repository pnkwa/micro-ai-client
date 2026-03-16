import type { AcceptableValue } from 'reka-ui'

export interface SelectOption {
    label?: string
    value?: AcceptableValue | AcceptableValue[]
    disabled?: boolean
}
