<script setup lang="ts">
defineProps<{
    modelValue: string
    tabs: { value: string; label: string }[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
    <div class="tw:flex tw:border-b tw:border-navy-10 tw:mb-6">
        <button
            v-for="tab in tabs"
            :key="tab.value"
            type="button"
            class="tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:border-b-2 tw:-mb-px tw:transition-colors tw:cursor-pointer"
            :class="
                modelValue === tab.value
                    ? 'tw:border-primary tw:text-primary'
                    : 'tw:border-transparent tw:text-navy-60 tw:hover:text-navy-100'
            "
            @click="emit('update:modelValue', tab.value)"
        >
            {{ tab.label }}
        </button>
    </div>
</template>
