<script setup lang="ts">
import type { DateValue } from 'reka-ui'
import { CalendarIcon } from '@lucide/vue'
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
        // Adds a time-of-day input. The stored value then carries the time too, as
        // "YYYY-MM-DDTHH:mm" (local); without it the value stays a plain "YYYY-MM-DD".
        withTime?: boolean
    }>(),
    {
        placeholder: 'Pick a date',
        withTime: false,
    },
)

const emits = defineEmits<{
    'update:modelValue': [value: string]
}>()

// Binds to the vee-validate field by `name`, exactly like McSelect. The stored value is a
// plain "YYYY-MM-DD" (or "YYYY-MM-DDTHH:mm" with time) string, so form schemas stay z.string().
const modelValue = useVeeValidateModel<string>(props, emits)

// The stored value is date and (optionally) time joined by 'T'; split it for the two controls.
const datePart = computed(() => (modelValue.value.value ?? '').split('T')[0] ?? '')
const timePart = computed(() => (modelValue.value.value ?? '').split('T')[1] ?? '')

// Bridge the date string <-> the calendar's DateValue. parseDate throws on a malformed
// string, so guard it and treat anything unparseable as "no selection".
const calendarValue = computed<DateValue | undefined>(() => {
    if (!datePart.value) return undefined
    try {
        return parseDate(datePart.value)
    } catch {
        return undefined
    }
})

const formatTime = (t: string): string => {
    const [h, m] = t.split(':').map(Number)
    if (h === undefined || m === undefined) return t
    const d = new Date()
    d.setHours(h, m)
    return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const dateLabel = computed(() => {
    const date = calendarValue.value
    if (!date) return ''
    return date.toDate(getLocalTimeZone()).toLocaleDateString('en', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
})

const displayLabel = computed(() => {
    if (!dateLabel.value) return ''
    return props.withTime && timePart.value
        ? `${dateLabel.value} ${formatTime(timePart.value)}`
        : dateLabel.value
})

const errorMessage = computed(() => modelValue.errorMessage.value || '')

const open = ref(false)

// Compose the stored value from the two parts. An empty date clears everything.
const commit = (date: string, time: string) => {
    if (!date) {
        modelValue.value.value = ''
        return
    }
    modelValue.value.value = props.withTime ? `${date}T${time || '00:00'}` : date
}

const onSelect = (date: DateValue | undefined) => {
    // date.toString() yields "YYYY-MM-DD" for a CalendarDate, the format the form expects.
    const d = date ? date.toString() : ''
    if (!props.withTime) {
        modelValue.value.value = d
        open.value = false
        return
    }
    // Keep the popover open so the time can be set; default to 09:00 on the first pick.
    commit(d, timePart.value || '09:00')
}

const onTime = (event: Event) => {
    commit(datePart.value, (event.target as HTMLInputElement).value)
}

const clear = () => {
    modelValue.value.value = ''
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
                    <!--
                        truncate, because inputVariants() fixes the trigger at h-9: a label longer
                        than the button wraps to a second line inside a box that cannot grow, and
                        spills over the border. Two pickers side by side then look mismatched even
                        though both are h-9. min-w-0 is what lets it actually shrink in the flex row.
                    -->
                    <span class="tw:min-w-0 tw:truncate">
                        {{ displayLabel || props.placeholder }}
                    </span>
                    <CalendarIcon class="tw:size-4 tw:opacity-60" />
                </button>
            </PopoverTrigger>
            <PopoverContent class="tw:w-auto tw:p-0" align="start">
                <!-- Notion-style: the selected date (and a time field) on top, calendar below. -->
                <div class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-navy-10 tw:p-2">
                    <div
                        class="tw:min-w-0 tw:flex-1 tw:rounded-md tw:bg-navy-10/50 tw:px-2.5 tw:py-1.5 tw:text-sm tw:font-medium"
                        :class="dateLabel ? 'tw:text-navy-90' : 'tw:text-muted-foreground'"
                    >
                        {{ dateLabel || props.placeholder }}
                    </div>
                    <input
                        v-if="withTime"
                        type="time"
                        :value="timePart"
                        :disabled="!datePart"
                        class="tw:rounded-md tw:bg-navy-10/50 tw:px-2.5 tw:py-1.5 tw:text-sm tw:font-medium tw:text-navy-90 tw:tabular-nums tw:outline-none tw:focus:ring-2 tw:focus:ring-primary/30 tw:disabled:opacity-50"
                        @input="onTime"
                    />
                </div>
                <Calendar
                    :model-value="calendarValue"
                    initial-focus
                    @update:model-value="onSelect"
                />
                <div class="tw:border-t tw:border-navy-10 tw:p-1.5">
                    <button
                        type="button"
                        :disabled="!datePart"
                        class="tw:w-full tw:rounded-md tw:px-2 tw:py-1.5 tw:text-left tw:text-sm tw:text-navy-60 tw:hover:bg-navy-10/50 tw:disabled:opacity-40 tw:disabled:hover:bg-transparent"
                        @click="clear"
                    >
                        Clear
                    </button>
                </div>
            </PopoverContent>
        </Popover>
        <span v-if="errorMessage" class="tw:text-xs tw:text-red-500">
            {{ errorMessage }}
        </span>
    </div>
</template>
