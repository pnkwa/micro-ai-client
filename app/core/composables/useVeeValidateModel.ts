import { useField, useFieldArray, type FieldArrayContext } from 'vee-validate'
import { useVModel } from '@vueuse/core'

interface VeeValidateModelReturn<T> {
    value: Ref<T>
    errorMessage: Ref<string | undefined>
}

export const useVeeValidateModel = <T>(
    props: { modelValue?: T; name?: string },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emit: (event: any, ...args: any[]) => void,
): VeeValidateModelReturn<T> => {
    if (props.name) {
        const { value, errorMessage } = useField<T>(() => props.name!, undefined, {
            syncVModel: true,
        })
        return { value, errorMessage }
    }

    const localValue = useVModel(props, 'modelValue', emit, {
        passive: true,
    }) as Ref<T>

    return {
        value: localValue,
        errorMessage: ref(undefined),
    }
}

export const isUseFieldVeeValid = (context: object): context is FieldArrayContext => {
    return 'fields' in context
}

export const isValueModelArray = (props: object): props is { modelValue: unknown[] } => {
    return 'modelValue' in props
}

export const useVeeValidateArrayModel = (
    props: object,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emit: (event: any, ...args: any[]) => void,
    option: {
        initialValue: unknown
        minArrayLength?: number
    },
) => {
    const valueModel = computed(
        () => isValueModelArray(props) && useVModel(props, 'modelValue', emit),
    )

    const getName = computed(() => {
        if (!('name' in props) || typeof props.name !== 'string') {
            return ''
        }

        return props.name
    })

    const fieldArray = getName.value && useFieldArray(getName.value)

    const fields = computed(() => {
        if (fieldArray && isUseFieldVeeValid(fieldArray)) {
            return fieldArray.fields.value || [option.initialValue]
        }

        return valueModel.value ? valueModel.value.value : [option.initialValue]
    })

    const push = (value: unknown) => {
        if (fieldArray && isUseFieldVeeValid(fieldArray)) {
            fieldArray.push(value)
            return
        }

        if (!valueModel.value) {
            return
        }
        return valueModel.value.value.push(value)
    }

    const handleChange = (index: number, value: unknown, key: string) => {
        if (fieldArray && isUseFieldVeeValid(fieldArray)) {
            return
        }

        if (!valueModel.value) {
            return
        }

        if (
            valueModel.value.value &&
            key &&
            typeof valueModel.value.value[index] === 'object' &&
            valueModel.value.value[index] &&
            key in valueModel.value.value[index]
        ) {
            ;(valueModel.value.value[index] as Record<string, unknown>)[key] = value
        } else {
            valueModel.value.value[index] = value
        }
    }

    const getItem = (index: number) => {
        if (fieldArray && isUseFieldVeeValid(fieldArray)) {
            return fieldArray.fields.value[index]?.value
        }

        if (!valueModel.value) {
            return
        }

        return valueModel.value.value[index]
    }

    const remove = (index: number) => {
        if (fieldArray && isUseFieldVeeValid(fieldArray)) {
            fieldArray.remove(index)
            return
        }

        if (!valueModel.value) {
            return
        }

        valueModel.value.value.splice(index, 1)
    }

    return {
        fields,
        valueModel,
        push,
        handleChange,
        getItem,
        remove,
    }
}
