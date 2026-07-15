<script setup lang="ts">
import type { AcceptableValue } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { ChevronDownIcon } from '@lucide/vue'
import { reactiveOmit, useVModel } from '@vueuse/core'
import { cn } from '@/core/lib/utils'

defineOptions({
    inheritAttrs: false,
})

const props = defineProps<{
    modelValue?: AcceptableValue | AcceptableValue[]
    class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
    'update:modelValue': AcceptableValue
}>()

const modelValue = useVModel(props, 'modelValue', emit, {
    passive: true,
    defaultValue: '',
})

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
    <div
        class="tw:group/native-select tw:relative tw:w-fit tw:has-[select:disabled]:opacity-50"
        data-slot="native-select-wrapper"
    >
        <select
            v-bind="{ ...$attrs, ...delegatedProps }"
            v-model="modelValue"
            data-slot="native-select"
            :class="
                cn(
                    'tw:border-input tw:placeholder:text-muted-foreground tw:selection:bg-primary tw:selection:text-primary-foreground tw:dark:bg-input/30 tw:dark:hover:bg-input/50 tw:h-9 tw:w-full tw:min-w-0 tw:appearance-none tw:rounded-md tw:border tw:bg-transparent tw:px-3 tw:py-2 tw:pr-9 tw:text-sm tw:shadow-xs tw:transition-[color,box-shadow] tw:outline-none tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed',
                    'tw:focus-visible:border-ring tw:focus-visible:ring-ring/50 tw:focus-visible:ring-3',
                    'tw:aria-invalid:ring-destructive/20 tw:dark:aria-invalid:ring-destructive/40 tw:aria-invalid:border-destructive',
                    props.class,
                )
            "
        >
            <slot />
        </select>
        <ChevronDownIcon
            class="tw:text-muted-foreground tw:pointer-events-none tw:absolute tw:top-1/2 tw:right-3.5 tw:size-4 tw:-translate-y-1/2 tw:opacity-50 tw:select-none"
            aria-hidden="true"
            data-slot="native-select-icon"
        />
    </div>
</template>
