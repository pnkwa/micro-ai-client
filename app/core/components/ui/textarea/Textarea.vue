<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/core/lib/utils'

const props = defineProps<{
    class?: HTMLAttributes['class']
    modelValue?: string | number
    name?: string
}>()

const emits = defineEmits<{
    (e: 'update:modelValue', payload: string | number): void
}>()

const modelValue = useVeeValidateModel<string | number>(props, emits)

const errorMessage = computed(() => {
    return modelValue.errorMessage.value || ''
})
</script>

<template>
    <div class="tw:group/textarea tw:relative tw:w-full" :data-error="Boolean(errorMessage)">
        <textarea
            v-model="modelValue.value.value"
            data-slot="textarea"
            v-bind="$attrs"
            :class="
                cn(
                    'tw:flex tw:field-sizing-content tw:min-h-24 tw:w-full tw:rounded-md tw:border tw:border-input tw:bg-transparent tw:px-3 tw:py-2 tw:text-base tw:shadow-xs tw:transition-[color,box-shadow] tw:outline-none tw:resize-none tw:placeholder:text-muted-foreground tw:focus-visible:border-ring tw:focus-visible:ring-ring/50 tw:focus-visible:ring-[3px] tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:md:text-sm tw:group-data-[error=true]/textarea:border-destructive tw:group-data-[error=true]/textarea:ring-destructive/20',
                    props.class,
                )
            "
        />
        <span
            v-if="errorMessage"
            :data-cy="`input-error-${props.name || 'default'}`"
            class="tw:text-destructive tw:text-sm tw:mt-1"
        >
            {{ errorMessage }}
        </span>
    </div>
</template>
