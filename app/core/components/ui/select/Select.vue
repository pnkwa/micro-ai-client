<script setup lang="ts" generic="T extends SelectOption | undefined">
import { X, Loader2 } from 'lucide-vue-next'
import type { AcceptableValue, SelectRootEmits, SelectRootProps } from 'reka-ui'
import { SelectRoot, useForwardPropsEmits } from 'reka-ui'
import type { SelectOption } from '~/core/types/components/select'

const isSelectOption = (obj: unknown): obj is SelectOption =>
    typeof obj === 'object' && obj !== null

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
            label?: string
            hint?: string
        }
    >(),
    {
        placeholder: 'Select an option',
        width: 210,
        loading: false,
        clearable: false,
    },
)

const emits = defineEmits<SelectRootEmits<T>>()

const forwarded = useForwardPropsEmits(props, emits)

const getForwarded = computed(() => {
    const { 'onUpdate:modelValue': _, ...rest } = forwarded.value
    return rest
})

const modelValue = useVeeValidateModel<T>(
    {
        modelValue: props.modelValue == null ? undefined : (props.modelValue as T),
        name: props.name,
    },
    emits,
)

const currentValue = computed(() => modelValue.value.value)
const hasValue = computed(() => currentValue.value != null)
const errorMessage = computed(() => modelValue.errorMessage.value || '')
const isDisabled = computed(() => props.loading || props.disabled)

const handleChangeSelect = (value: T) => {
    modelValue.value.value = value
    emits('update:modelValue', value)
}

const handleClear = () => {
    modelValue.value.value = undefined as T
    emits('update:modelValue', undefined as T)
}

const getOptionByIndex = (index: number): T | undefined => props.options[index]

const getValue = (index: number): AcceptableValue => {
    const option = getOptionByIndex(index)
    if (!option) return ''
    if (props.optionValue && isKeyOfObject<AcceptableValue>(props.optionValue, option)) {
        return option[props.optionValue]
    }
    return (option as SelectOption).value ?? ''
}

const getLabel = (index: number): string => {
    const option = getOptionByIndex(index)
    if (!option) return ''
    if (props.optionLabel && isKeyOfObject<AcceptableValue>(props.optionLabel, option)) {
        return String(option[props.optionLabel])
    }
    if (isSelectOption(option) && option.label !== undefined) {
        return String(option.label)
    }
    return ''
}

const getDisabled = (index: number): boolean => {
    const option = getOptionByIndex(index)
    return option?.disabled ?? false
}

const selectedOption = computed((): T | null => {
    if (!hasValue.value) return null

    return (
        props.options.find((opt) => {
            if (!opt) return false
            if (props.optionValue && isKeyOfObject<AcceptableValue>(props.optionValue, opt)) {
                return opt[props.optionValue] === currentValue.value
            }
            if (isSelectOption(opt)) return opt.value === currentValue.value
            return opt === currentValue.value
        }) ?? null
    )
})
</script>

<template>
    <div
        class="tw:group/select tw:relative tw:flex tw:flex-col tw:gap-1"
        :data-error="Boolean(errorMessage)"
        :data-disabled="isDisabled"
        :class="[errorMessage && 'mc-select-container--error', props.class]"
    >
        <label
            v-if="props.label"
            class="tw:text-sm tw:font-medium tw:text-foreground tw:select-none"
            :class="{ 'tw:opacity-50': isDisabled }"
        >
            {{ props.label }}
        </label>

        <SelectRoot
            class="mc-select"
            data-slot="select"
            v-bind="getForwarded"
            :model-value="currentValue"
            :disabled="isDisabled"
            @update:model-value="(val) => handleChangeSelect(val as T)"
        >
            <div class="tw:relative tw:flex tw:items-center">
                <McSelectTrigger
                    :class="
                        cn(
                            'tw:w-full tw:pr-8',
                            errorMessage && [
                                'tw:border-danger',
                                'tw:ring-danger/20',
                                'tw:hover:ring-danger/20',
                                'tw:hover:border-danger',
                                'tw:focus-visible:border-danger',
                                'tw:focus-visible:ring-danger/10',
                            ],
                        )
                    "
                    as="div"
                    :value="currentValue"
                    :loading="props.loading"
                    @handle-clear="handleClear"
                >
                    <template v-if="props.loading">
                        <Loader2 class="tw:size-4 tw:animate-spin tw:text-muted-foreground" />
                    </template>

                    <template v-else>
                        <slot
                            v-if="hasValue"
                            name="trigger"
                            :value="currentValue"
                            :select-option="selectedOption"
                        >
                            <McSelectValue :placeholder="props.placeholder" />
                        </slot>
                        <McSelectValue v-else :placeholder="props.placeholder" />
                    </template>
                </McSelectTrigger>

                <Transition name="fade">
                    <button
                        v-if="hasValue && props.clearable && !props.loading && !isDisabled"
                        type="button"
                        aria-label="Clear selection"
                        class="tw:absolute tw:right-8 tw:top-1/2 tw:-translate-y-1/2 tw:flex tw:items-center tw:justify-center tw:rounded-sm tw:p-0.5 tw:text-muted-foreground tw:transition-colors tw:hover:text-foreground tw:focus:outline-none tw:focus:ring-1 tw:focus:ring-ring"
                        @click.stop="handleClear"
                    >
                        <X class="tw:size-3.5" />
                    </button>
                </Transition>
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
                            :selected="currentValue"
                        >
                            {{ getLabel(index) }}
                        </slot>
                    </McSelectItem>
                </template>
            </McSelectContent>
        </SelectRoot>

        <span v-if="hint && !errorMessage" class="tw:text-xs tw:text-muted-foreground">
            {{ hint }}
        </span>

        <Transition name="slide-down">
            <span
                v-if="errorMessage"
                :data-cy="`input-error-${props.name || 'default'}`"
                class="tw:text-xs tw:text-danger tw:font-medium"
                role="alert"
                aria-live="polite"
            >
                {{ errorMessage }}
            </span>
        </Transition>
    </div>
</template>

<style scoped lang="scss">
.mc-select {
    text-overflow: ellipsis;
    width: 100%;

    &-trigger {
        text-overflow: ellipsis;
        width: 100%;
    }
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.slide-down-enter-active,
.slide-down-leave-active {
    transition: all 0.2s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}
</style>
