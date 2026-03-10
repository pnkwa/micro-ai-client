<script setup lang="ts" generic="T extends SelectOption | undefined">
import { X } from 'lucide-vue-next'
import type { AcceptableValue, SelectRootEmits, SelectRootProps } from 'reka-ui'
import { SelectRoot, useForwardPropsEmits } from 'reka-ui'
import type { SelectOption } from '~/core/types/components/select'
import { isKeyOfObject } from '~/core/helpers/object'

const isSelectOption = (obj: unknown): obj is T => {
    return typeof obj === 'object' && obj !== null
}

const props = withDefaults(
    defineProps<
        SelectRootProps & {
            class?: string
            placeholder?: string
            options: T[]
            optionValue?: string
            optionLabel?: string
            width?: string | number
            loading?: boolean
            clearable?: boolean
        }
    >(),
    {
        placeholder: '',
        width: 210,
        loading: false,
        clearable: false,
    },
)

const emits = defineEmits<SelectRootEmits<T>>()

const forwarded = useForwardPropsEmits(props, emits)

const getForwarded = computed(() => {
    const tempForwarded = forwarded.value

    delete tempForwarded['onUpdate:modelValue']

    return tempForwarded
})

const modelValue = useVeeValidateModel<T>(
    props as unknown as { modelValue?: T; name?: string },
    emits,
)

const handleChangeSelect = (value: T) => {
    modelValue.value.value = value
    emits('update:modelValue', value)
}

const getValue = (index: number) => {
    const value = props.options[index]
    if (!value) {
        return ''
    }
    if (props.optionValue && isKeyOfObject<AcceptableValue>(props.optionValue, value)) {
        return value[props.optionValue]
    }
    return value.value ?? ''
}

const getLabel = (index: number): string => {
    const value = props.options[index]
    if (!value) {
        return ''
    }
    if (props.optionLabel && isKeyOfObject<AcceptableValue>(props.optionLabel, value)) {
        return String(value[props.optionLabel])
    }
    if (isSelectOption(value) && value.label !== undefined) {
        return String(value.label)
    }
    return ''
}

const selectedOption = computed(() => {
    const currentValue = modelValue.value.value
    if (!currentValue) return null

    const findOption = props.options.find((opt) => {
        if (!opt) return false

        if (props.optionValue && isKeyOfObject<AcceptableValue>(props.optionValue, opt)) {
            return opt[props.optionValue] === currentValue
        }

        if (isSelectOption(opt)) {
            return opt.value === currentValue
        }

        return opt === currentValue
    })

    return findOption || null
})

const getDisabled = (index: number): boolean => {
    const value = props.options[index]
    if (!value) {
        return false
    }
    return value.disabled || false
}

const errorMessage = computed(() => {
    return modelValue.errorMessage.value || ''
})
</script>

<template>
    <div
        class="tw:group/select tw:relative tw:w-full"
        :data-error="Boolean(errorMessage)"
        :class="props.class"
    >
        <SelectRoot
            data-slot="select"
            v-bind="getForwarded"
            :model-value="modelValue.value.value"
            :disabled="props.loading || props.disabled"
            @update:model-value="(val) => handleChangeSelect(val as T)"
        >
            <div class="tw:relative">
                <McSelectTrigger
                    :class="
                        cn(
                            'tw:group-data-[error=true]/select:border-destructive tw:group-data-[error=true]/select:ring-destructive/20',
                            props.class,
                        )
                    "
                    as="div"
                    :value="modelValue.value.value"
                    :loading="props.loading"
                    @handle-clear="
                        () => {
                            modelValue.value.value = undefined as T
                        }
                    "
                >
                    <slot
                        v-if="modelValue.value.value"
                        name="trigger"
                        :value="modelValue.value.value"
                        :select-option="selectedOption"
                    >
                        <McSelectValue :placeholder="`${props.placeholder}`" />
                    </slot>
                    <McSelectValue v-else :placeholder="`${props.placeholder}`" />
                </McSelectTrigger>
                <X
                    v-if="modelValue.value.value && props.clearable && !props.loading"
                    class="tw:cursor-pointer tw:size-4 tw:top-1/2 tw:-translate-y-1/2 tw:right-8 tw:absolute"
                    @click="modelValue.value.value = undefined as T"
                />
            </div>

            <McSelectContent>
                <template
                    v-for="(option, index) in props.options"
                    :key="`${getValue(index)}-${index}`"
                >
                    <McSelectItem :value="getValue(index)" :disabled="getDisabled(index)">
                        <slot
                            name="option"
                            :option="option"
                            :index="index"
                            :selected="modelValue.value.value"
                        >
                            {{ getLabel(index) }}
                        </slot>
                    </McSelectItem>
                </template>
            </McSelectContent>
        </SelectRoot>
        <span
            v-if="errorMessage"
            :data-cy="`input-error-${props.name || 'default'}`"
            class="tw:text-destructive tw:text-sm tw:mt-1"
        >
            {{ errorMessage }}
        </span>
    </div>
</template>

<style scoped lang="scss">
[data-slot='select'] {
    text-overflow: ellipsis;
}
</style>
