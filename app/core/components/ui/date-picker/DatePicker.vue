<script setup lang="ts">
import type { DateValue } from 'reka-ui'
import { CalendarIcon } from 'lucide-vue-next'
import { getLocalTimeZone, parseDate } from '@internationalized/date'
import { cn } from '@/core/lib/utils'
import { inputVariants } from '@/core/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/core/components/ui/popover'
import { Calendar } from '@/core/components/ui/calendar'

const props = withDefaults(
    defineProps<{
        name: string
        modelValue?: string
        placeholder?: string
        class?: string
        disabled?: boolean
    }>(),
    {
        placeholder: 'Pick a date',
    },
)

const emits = defineEmits<{
    'update:modelValue': [value: string]
}>()

// Binds to the vee-validate field by `name`, exactly like McSelect. The stored value is a
// plain "YYYY-MM-DD" string so the form schema (z.string()) is unchanged.
const modelValue = useVeeValidateModel<string>(props, emits)

// Bridge the string field <-> the calendar's DateValue. parseDate throws on a malformed
// string, so guard it and treat anything unparseable as "no selection".
const calendarValue = computed<DateValue | undefined>(() => {
    const raw = modelValue.value.value
    if (!raw) return undefined
    try {
        return parseDate(raw)
    } catch {
        return undefined
    }
})

const displayLabel = computed(() => {
    const date = calendarValue.value
    if (!date) return ''
    return date.toDate(getLocalTimeZone()).toLocaleDateString('en', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
})

const errorMessage = computed(() => modelValue.errorMessage.value || '')

const open = ref(false)

const onSelect = (date: DateValue | undefined) => {
    // date.toString() yields "YYYY-MM-DD" for a CalendarDate, the format the form expects.
    modelValue.value.value = date ? date.toString() : ''
    open.value = false
}
</script>

<template>
    <div class="tw:group/input tw:flex tw:flex-col tw:gap-1" :data-error="Boolean(errorMessage)">
        <Popover v-model:open="open">
            <PopoverTrigger as-child>
                <button
                    type="button"
                    :disabled="props.disabled"
                    :class="
                        cn(
                            inputVariants(),
                            'tw:justify-between tw:text-left tw:cursor-pointer tw:disabled:pointer-events-none tw:disabled:opacity-50',
                            !displayLabel && 'tw:text-muted-foreground',
                            props.class,
                        )
                    "
                >
                    <span>{{ displayLabel || props.placeholder }}</span>
                    <CalendarIcon class="tw:size-4 tw:opacity-60" />
                </button>
            </PopoverTrigger>
            <PopoverContent class="tw:w-auto tw:p-0" align="start">
                <Calendar
                    :model-value="calendarValue"
                    initial-focus
                    @update:model-value="onSelect"
                />
            </PopoverContent>
        </Popover>
        <span v-if="errorMessage" class="tw:text-xs tw:text-red-500">
            {{ errorMessage }}
        </span>
    </div>
</template>
