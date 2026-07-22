<script setup lang="ts">
/**
 * Slider for McAnnotatedImage's confidence filter. Its only consumer is
 * McAnnotatedImage itself, which renders it directly above the step toggles so both
 * "which boxes do I see?" controls sit together under the image. Kept a separate
 * component because it was duplicated markup in two pages before that.
 *
 * The model value is the 0..1 fraction the overlay filters on, not the percent:
 * percent is a display detail, so keeping it inside means no caller repeats the /100.
 */
withDefaults(
    defineProps<{
        /** 0..1, compared directly against each box's confidence. */
        modelValue: number
        label?: string
        hint?: string
    }>(),
    {
        label: 'Confidence threshold',
        hint: 'Boxes below this confidence are hidden on the image.',
    },
)

defineEmits<{ 'update:modelValue': [value: number] }>()

const percent = (value: number) => Math.round(value * 100)
</script>

<template>
    <div>
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
            <label
                class="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-[0.12em] tw:text-navy-50"
            >
                {{ label }}
            </label>
            <span class="tw:text-xs tw:font-semibold tw:text-primary tw:tabular-nums">
                {{ percent(modelValue) }}%
            </span>
        </div>
        <input
            :value="percent(modelValue)"
            type="range"
            min="0"
            max="100"
            step="1"
            class="tw:w-full tw:accent-primary"
            @input="
                $emit('update:modelValue', Number(($event.target as HTMLInputElement).value) / 100)
            "
        />
        <p v-if="hint" class="tw:text-[10px] tw:mt-1 tw:leading-relaxed tw:text-navy-40">
            {{ hint }}
        </p>
    </div>
</template>
