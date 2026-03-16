<script setup lang="ts">
import type { McInputEmit, McInputProps } from '~/core/types/components/input'
import { inputVariants } from '.'
import { useVeeValidateModel } from '~/core/composables/useVeeValidateModel'
import * as icons from 'lucide-vue-next'

const props = defineProps<McInputProps>()

const emits = defineEmits<McInputEmit>()

//@ts-ignore
const modelValue = useVeeValidateModel<McInputProps['modelValue']>(props, emits)

const handleChange = (value: string | number) => {
    const digitPattern = /[^\d-]+/g
    let tempVal = value || ''

    if (props.type === 'number' && typeof tempVal === 'string') {
        tempVal = tempVal.replace(digitPattern, '')
    }

    if (props.maxNumber) {
        const match = +props.maxNumber > +tempVal
        tempVal = match ? tempVal : props.maxNumber
    }

    nextTick(() => {
        modelValue.value.value = tempVal
    })
    return tempVal
}

const handleInput = (event: Event) => {
    const target = event.target as HTMLInputElement
    const value = handleChange(target.value)
    target.value = `${value}`
}

const isTypingNumber = (evt: KeyboardEvent) => {
    const test = /^[0-9]/.test(evt.key)

    if (!test) {
        return evt.preventDefault()
    }
    return true
}

const IconPrependComponent = computed(() => {
    if (!props.iconPrepend) {
        return undefined
    }

    return h(icons[props.iconPrepend] as icons.LucideIcon, { class: 'tw:size-4' })
})

const IconAppendComponent = computed(() => {
    if (!props.iconAppend) {
        return undefined
    }

    return h(icons[props.iconAppend] as icons.LucideIcon, { class: 'tw:size-4' })
})

const errorMessage = computed(() => {
    return modelValue.errorMessage.value || ''
})
</script>

<template>
    <div
        class="tw:group/input tw:relative tw:w-full tw:items-center"
        :data-error="Boolean(errorMessage)"
        :class="[errorMessage && 'mc-input-container--error', props.class]"
    >
        <div
            :class="
                cn(
                    'tw:relative tw:w-full tw:items-center ',
                    inputVariants(),
                    props.class,
                    iconPrepend && 'tw:pl-8',
                    iconAppend && 'tw:pr-8',
                    props.disabled &&
                        'tw:pointer-events-none tw:cursor-not-allowed tw:bg-basic-gray-20 tw:border-basic-gray-40 tw:text-basic-gray-50 ',
                )
            "
        >
            <input
                class="tw:outline-none tw:w-full tw:text-base"
                :value="modelValue.value.value"
                data-slot="input"
                v-bind="{ ...$attrs, disabled: props.disabled }"
                @input="handleInput"
                @keypress="props.type === 'number' && isTypingNumber($event)"
            />
            <span
                v-if="props.iconPrepend"
                class="tw:inset-s-0 tw:absolute tw:inset-y-0 tw:flex tw:items-center tw:justify-center tw:px-2"
            >
                <IconPrependComponent />
            </span>

            <span
                v-if="props.iconAppend"
                class="tw:inset-e-0 tw:absolute tw:inset-y-0 tw:flex tw:items-center tw:justify-center tw:px-2"
            >
                <IconAppendComponent />
            </span>
        </div>
        <span
            v-if="errorMessage"
            :data-cy="`input-error-${props.name || 'default'}`"
            class="tw:group-[.mc-input-container--error]/input:text-danger mc-input-error__message tw:text-sm"
        >
            {{ errorMessage }}
        </span>
    </div>
</template>

<style lang="scss" scoped>
.mc-input {
    &__container {
        position: relative;
    }
}
</style>
