<script setup lang="ts" generic="T extends SelectOption | undefined">
import type { AcceptableValue, SelectRootEmits, SelectRootProps } from 'reka-ui'
import { SelectRoot, useForwardPropsEmits } from 'reka-ui'
import { X } from 'lucide-vue-next'
import McBadge from '@/core/components/ui/badge/Badge.vue'

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
            loading?: boolean
            clearable?: boolean
        }
    >(),
    {
        placeholder: '',
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

type VeeValidateModelType = T | T[] | AcceptableValue | AcceptableValue[] | undefined

const modelValue = useVeeValidateModel<VeeValidateModelType>(props, emits)

const handleChangeSelect = (value: T) => {
    modelValue.value.value = value
}

const handleClear = () => {
    const clearedValue = props.multiple ? [] : undefined
    modelValue.value.value = clearedValue
}

const getValueByIndex = (index: number) => {
    const value = props.options[index]
    if (!value) {
        return ''
    }
    if (props.optionValue && isKeyOfObject<AcceptableValue>(props.optionValue, value)) {
        return value[props.optionValue]
    }
    return value.value || ''
}

const getLabelByIndex = (index: number): string => {
    const value = props.options[index]
    if (!value) {
        return ''
    }
    if (props.optionLabel && isKeyOfObject<AcceptableValue>(props.optionLabel, value)) {
        return value[props.optionLabel]
    }
    if (isSelectOption(value) && value.label !== undefined) {
        return value.label
    }
    return ''
}

const getValueFromOption = (option: VeeValidateModelType): AcceptableValue => {
    if (!option) return ''

    if (props.optionValue && isKeyOfObject<AcceptableValue>(props.optionValue, option)) {
        return option[props.optionValue]
    }

    if (isSelectOption(option) && option.value !== undefined) {
        return option.value
    }

    return option
}

const getLabelFromOption = (option: VeeValidateModelType): string => {
    if (!option) return ''

    if (props.optionLabel && isKeyOfObject<AcceptableValue>(props.optionLabel, option)) {
        return String(option[props.optionLabel])
    }

    if (isSelectOption(option) && option.label !== undefined) {
        return option.label
    }

    return String(option)
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

const selectedOptions = computed(() => {
    const currentValue = modelValue.value.value
    if (!currentValue || !Array.isArray(currentValue)) return []

    return currentValue
        .map((selectedVal) => {
            return props.options.find((opt) => {
                if (!opt) return false

                let optValue: VeeValidateModelType
                if (props.optionValue && isKeyOfObject<AcceptableValue>(props.optionValue, opt)) {
                    optValue = opt[props.optionValue]
                } else if (isSelectOption(opt)) {
                    optValue = opt.value || ''
                } else {
                    optValue = opt
                }

                return optValue === selectedVal
            })
        })
        .filter((opt) => opt !== undefined)
})

const removeSelectedItem = (valueToRemove: VeeValidateModelType) => {
    const currentValue = modelValue.value.value
    if (!Array.isArray(currentValue)) return

    const newValue = currentValue.filter((v) => v !== valueToRemove)
    modelValue.value.value = newValue
}

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
        class="tw:group/select tw:relative tw:items-center"
        :data-error="Boolean(errorMessage)"
        :class="[errorMessage && 'mc-select-container--error', props.class]"
    >
        <SelectRoot
            class="mc-select"
            data-slot="select"
            v-bind="getForwarded"
            :model-value="modelValue.value.value"
            :disabled="props.loading || props.disabled"
            @update:model-value="(val) => handleChangeSelect(val as T)"
        >
            <div class="tw:relative">
                <McSelectTrigger
                    class="mc-select-trigger"
                    :class="
                        cn(
                            'tw:data-[disabled]:pointer-events-none tw:data-[disabled]:opacity-50 tw:group-[.mc-select-container--error]/select:border-danger tw:group-[.mc-select-container--error]/select:ring-danger/20 tw:group-[.mc-select-container--error]/select:hover:ring-danger/20 tw:group-[.mc-select-container--error]/select:hover:border-danger tw:group-[.mc-select-container--error]/select:focus-visible:border-danger tw:group-[.mc-select-container--error]/select:focus-visible:ring-danger/10',
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
                        v-if="modelValue.value.value && !Array.isArray(modelValue.value.value)"
                        name="trigger"
                        :value="modelValue.value.value"
                        :select-option="selectedOption"
                    >
                        <McSelectValue
                            class="tw:px-[0.5px]"
                            :placeholder="`${props.placeholder}`"
                        />
                    </slot>

                    <div
                        v-else-if="
                            Array.isArray(modelValue.value.value) && selectedOptions.length > 0
                        "
                        class="multiple-value tw:flex tw:flex-wrap tw:gap-1"
                    >
                        <McBadge
                            v-for="(option, index) in selectedOptions"
                            :key="`selected-${getValueFromOption(option)}-${index}`"
                        >
                            <span class="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">
                                <slot
                                    name="tag"
                                    :option="option"
                                    :label="getLabelFromOption(option)"
                                >
                                    {{ getLabelFromOption(option) }}
                                </slot>
                            </span>
                            <button
                                type="button"
                                class="tw:cursor-pointer"
                                :aria-label="`Remove ${getLabelFromOption(option)}`"
                                @pointerdown.prevent.stop="
                                    removeSelectedItem(getValueFromOption(option))
                                "
                            >
                                <X :size="14" class="tw:pointer-events-none" />
                            </button>
                        </McBadge>
                    </div>

                    <McSelectValue v-else :placeholder="`${props.placeholder}`" />
                </McSelectTrigger>
                <X
                    v-if="props.clearable && !props.loading"
                    class="tw:absolute tw:top-[50%] tw:-translate-y-1/2 tw:right-[32px] tw:z-10 tw:cursor-pointer tw:size-6 tw:p-1"
                    @click.stop="handleClear"
                />
            </div>

            <McSelectContent>
                <template
                    v-for="(option, index) in props.options"
                    :key="`${getValueByIndex(index)}-${index}`"
                >
                    <McSelectItem :value="getValueByIndex(index)" :disabled="getDisabled(index)">
                        <slot
                            name="option"
                            :option="option"
                            :index="index"
                            :selected="modelValue.value.value"
                        >
                            {{ getLabelByIndex(index) }}
                        </slot>
                    </McSelectItem>
                </template>
            </McSelectContent>
        </SelectRoot>
        <span
            v-if="errorMessage"
            :data-cy="`input-error-${props.name || 'default'}`"
            class="tw:group-[.mc-select-container--error]/select:text-danger mc-select-error__message tw:text-sm"
        >
            {{ errorMessage }}
        </span>
    </div>
</template>
<style scoped lang="scss">
.mc-select {
    text-overflow: ellipsis;

    &-trigger {
        text-overflow: ellipsis;
        width: 100%;

        &:has(.multiple-value) {
            padding-left: 0.3rem !important;
        }
    }
}
</style>
