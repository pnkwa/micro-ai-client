<script lang="ts" setup>
import type { CalendarRootEmits, CalendarRootProps, DateValue } from 'reka-ui'
import type { HTMLAttributes, Ref } from 'vue'
import type { LayoutTypes } from '.'
import { getLocalTimeZone, today } from '@internationalized/date'
import { createReusableTemplate, reactiveOmit, useVModel } from '@vueuse/core'
import { CalendarRoot, useDateFormatter, useForwardPropsEmits } from 'reka-ui'
import { createYear, createYearRange, toDate } from 'reka-ui/date'
import { computed, toRaw } from 'vue'
import { cn } from '@/core/lib/utils'
import { NativeSelect, NativeSelectOption } from '@/core/components/ui/native-select'
import {
    CalendarCell,
    CalendarCellTrigger,
    CalendarGrid,
    CalendarGridBody,
    CalendarGridHead,
    CalendarGridRow,
    CalendarHeadCell,
    CalendarHeader,
    CalendarHeading,
    CalendarNextButton,
    CalendarPrevButton,
} from '.'

const props = withDefaults(
    defineProps<
        CalendarRootProps & {
            class?: HTMLAttributes['class']
            layout?: LayoutTypes
            yearRange?: DateValue[]
        }
    >(),
    {
        modelValue: undefined,
        layout: undefined,
    },
)
const emits = defineEmits<CalendarRootEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'layout', 'placeholder')

const placeholder = useVModel(props, 'placeholder', emits, {
    passive: true,
    defaultValue: props.defaultPlaceholder ?? today(getLocalTimeZone()),
}) as Ref<DateValue>

const formatter = useDateFormatter(props.locale ?? 'en')

const yearRange = computed(() => {
    return (
        props.yearRange ??
        createYearRange({
            start:
                props?.minValue ??
                (
                    toRaw(props.placeholder) ??
                    props.defaultPlaceholder ??
                    today(getLocalTimeZone())
                ).cycle('year', -100),

            end:
                props?.maxValue ??
                (
                    toRaw(props.placeholder) ??
                    props.defaultPlaceholder ??
                    today(getLocalTimeZone())
                ).cycle('year', 10),
        })
    )
})

const [DefineMonthTemplate, ReuseMonthTemplate] = createReusableTemplate<{ date: DateValue }>()
const [DefineYearTemplate, ReuseYearTemplate] = createReusableTemplate<{ date: DateValue }>()

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
    <DefineMonthTemplate v-slot="{ date }">
        <div class="tw:**:data-[slot=native-select-icon]:right-1">
            <div class="tw:relative">
                <div
                    class="tw:absolute tw:inset-0 tw:flex tw:h-full tw:items-center tw:text-sm tw:pl-2 tw:pointer-events-none"
                >
                    {{ formatter.custom(toDate(date), { month: 'short' }) }}
                </div>
                <NativeSelect
                    class="tw:text-xs tw:h-8 tw:pr-6 tw:pl-2 tw:text-transparent tw:relative"
                    :model-value="date.month"
                    @change="
                        (e: Event) => {
                            placeholder = placeholder.set({
                                month: Number((e?.target as any)?.value),
                            })
                        }
                    "
                >
                    <NativeSelectOption
                        v-for="month in createYear({ dateObj: date })"
                        :key="month.toString()"
                        :value="month.month"
                        :selected="date.month === month.month"
                    >
                        {{ formatter.custom(toDate(month), { month: 'short' }) }}
                    </NativeSelectOption>
                </NativeSelect>
            </div>
        </div>
    </DefineMonthTemplate>

    <DefineYearTemplate v-slot="{ date }">
        <div class="tw:**:data-[slot=native-select-icon]:right-1">
            <div class="tw:relative">
                <div
                    class="tw:absolute tw:inset-0 tw:flex tw:h-full tw:items-center tw:text-sm tw:pl-2 tw:pointer-events-none"
                >
                    {{ formatter.custom(toDate(date), { year: 'numeric' }) }}
                </div>
                <NativeSelect
                    class="tw:text-xs tw:h-8 tw:pr-6 tw:pl-2 tw:text-transparent tw:relative"
                    :model-value="date.year"
                    @change="
                        (e: Event) => {
                            placeholder = placeholder.set({
                                year: Number((e?.target as any)?.value),
                            })
                        }
                    "
                >
                    <NativeSelectOption
                        v-for="year in yearRange"
                        :key="year.toString()"
                        :value="year.year"
                        :selected="date.year === year.year"
                    >
                        {{ formatter.custom(toDate(year), { year: 'numeric' }) }}
                    </NativeSelectOption>
                </NativeSelect>
            </div>
        </div>
    </DefineYearTemplate>

    <CalendarRoot
        v-slot="{ grid, weekDays, date }"
        v-bind="forwarded"
        v-model:placeholder="placeholder"
        data-slot="calendar"
        :class="cn('tw:p-3', props.class)"
    >
        <CalendarHeader class="tw:pt-0">
            <nav
                class="tw:flex tw:items-center tw:gap-1 tw:absolute tw:top-0 tw:inset-x-0 tw:justify-between"
            >
                <CalendarPrevButton>
                    <slot name="calendar-prev-icon" />
                </CalendarPrevButton>
                <CalendarNextButton>
                    <slot name="calendar-next-icon" />
                </CalendarNextButton>
            </nav>

            <slot
                name="calendar-heading"
                :date="date"
                :month="ReuseMonthTemplate"
                :year="ReuseYearTemplate"
            >
                <template v-if="layout === 'month-and-year'">
                    <div class="tw:flex tw:items-center tw:justify-center tw:gap-1">
                        <ReuseMonthTemplate :date="date" />
                        <ReuseYearTemplate :date="date" />
                    </div>
                </template>
                <template v-else-if="layout === 'month-only'">
                    <div class="tw:flex tw:items-center tw:justify-center tw:gap-1">
                        <ReuseMonthTemplate :date="date" />
                        {{ formatter.custom(toDate(date), { year: 'numeric' }) }}
                    </div>
                </template>
                <template v-else-if="layout === 'year-only'">
                    <div class="tw:flex tw:items-center tw:justify-center tw:gap-1">
                        {{ formatter.custom(toDate(date), { month: 'short' }) }}
                        <ReuseYearTemplate :date="date" />
                    </div>
                </template>
                <template v-else>
                    <CalendarHeading />
                </template>
            </slot>
        </CalendarHeader>

        <div
            class="tw:flex tw:flex-col tw:gap-y-4 tw:mt-4 tw:sm:flex-row tw:sm:gap-x-4 tw:sm:gap-y-0"
        >
            <CalendarGrid v-for="month in grid" :key="month.value.toString()">
                <CalendarGridHead>
                    <CalendarGridRow>
                        <CalendarHeadCell v-for="day in weekDays" :key="day">
                            {{ day }}
                        </CalendarHeadCell>
                    </CalendarGridRow>
                </CalendarGridHead>
                <CalendarGridBody>
                    <CalendarGridRow
                        v-for="(weekDates, index) in month.rows"
                        :key="`weekDate-${index}`"
                        class="tw:mt-2 tw:w-full"
                    >
                        <CalendarCell
                            v-for="weekDate in weekDates"
                            :key="weekDate.toString()"
                            :date="weekDate"
                        >
                            <CalendarCellTrigger :day="weekDate" :month="month.value" />
                        </CalendarCell>
                    </CalendarGridRow>
                </CalendarGridBody>
            </CalendarGrid>
        </div>
    </CalendarRoot>
</template>
