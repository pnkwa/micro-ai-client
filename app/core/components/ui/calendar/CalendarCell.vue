<script lang="ts" setup>
import type { CalendarCellProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { CalendarCell, useForwardProps } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<CalendarCellProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
    <CalendarCell
        data-slot="calendar-cell"
        :class="
            cn(
                'tw:relative tw:p-0 tw:text-center tw:text-sm tw:focus-within:relative tw:focus-within:z-20 tw:flex-1 tw:[&:has([data-selected])]:rounded-md tw:[&:has([data-selected])]:bg-accent',
                props.class,
            )
        "
        v-bind="forwardedProps"
    >
        <slot />
    </CalendarCell>
</template>
