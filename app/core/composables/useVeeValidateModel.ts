import { useField, type FieldContext, type FieldOptions } from 'vee-validate'
import { isKeyOfObject } from '../helpers/object'

export const isUseField = <T>(
    veeValidateContext: object,
): veeValidateContext is FieldContext<T> => {
    return (
        typeof veeValidateContext !== 'undefined' &&
        'handleChange' in veeValidateContext &&
        'errorMessage' in veeValidateContext
    )
}

export const useVeeValidateModel = <T = unknown>(
    props: object,
    // eslint-disable-next-line
    emit: (event: any, ...args: any[]) => void,
    option: Partial<FieldOptions<T>> & {
        modelValueName?: string
    } = {},
) => {
    const key = option.modelValueName || 'modelValue'
    const valid = ref<boolean>(false)
    const getValue = computed(() => {
        if (!props) {
            return
        }
        if (!isKeyOfObject(key, props)) {
            return option.initialValue as T
        }

        const modelValueName = props[key]

        return modelValueName
    })

    const getName = computed(() => {
        if (!('name' in props) || typeof props.name !== 'string') {
            return ''
        }
        return props.name
    })

    const optionUseField = computed(() => {
        const tempOption = { ...option }
        return {
            ...tempOption,
        }
    })

    const valueField =
        getName.value &&
        useField<T>(() => getName.value, undefined, {
            validateOnValueUpdate: false,
            ...optionUseField.value,
        })

    const value = computed<T>({
        set(val) {
            if (valueField && getName.value && isUseField(valueField)) {
                valueField.handleChange(val, valid.value)
            }
            emit(`update:${key.toString()}`, val)
        },
        get() {
            if (valueField && getName.value && isUseField(valueField)) {
                return typeof valueField.value.value !== 'undefined'
                    ? valueField.value.value
                    : (option.initialValue as T)
            } else {
                return getValue.value as T
            }
        },
    })

    const errorMessage = computed(() => {
        if (!valueField || !isUseField(valueField) || !valueField.errorMessage.value) {
            return ''
        }

        return valueField.errorMessage.value
    })

    const veeValidateContext = computed(() => {
        return valueField && isUseField(valueField) && valueField
    })

    watch(
        () => valueField && isUseField(valueField) && valueField.errorMessage.value,
        (value) => {
            if (valueField && !valid.value && valueField.value && value) {
                valid.value = true
            }
        },
    )

    return { value, errorMessage, valid, veeValidateContext }
}
