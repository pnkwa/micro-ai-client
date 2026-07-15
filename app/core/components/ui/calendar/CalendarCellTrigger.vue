<script lang="ts" setup>
import type { CalendarCellTriggerProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { CalendarCellTrigger, useForwardProps } from 'reka-ui'
import { cn } from '@/core/lib/utils'
import { buttonVariants } from '@/core/components/ui/button'

const props = withDefaults(
    defineProps<CalendarCellTriggerProps & { class?: HTMLAttributes['class'] }>(),
    {
        as: 'button',
    },
)

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
    <CalendarCellTrigger
        data-slot="calendar-cell-trigger"
        :class="
            cn(
                buttonVariants({ variant: 'ghost' }),
                'tw:size-8 tw:p-0 tw:font-normal tw:aria-selected:opacity-100 tw:cursor-default',
                'tw:[&[data-today]:not([data-selected])]:bg-accent tw:[&[data-today]:not([data-selected])]:text-accent-foreground',
                // Selected
                'tw:data-[selected]:bg-primary tw:data-[selected]:text-primary-foreground tw:data-[selected]:opacity-100 tw:[&[data-selected]:hover]:bg-primary tw:data-[selected]:hover:text-primary-foreground tw:data-[selected]:focus:bg-primary tw:data-[selected]:focus:text-primary-foreground',
                // Disabled
                'tw:data-[disabled]:text-muted-foreground tw:data-[disabled]:opacity-50',
                // Unavailable
                'tw:data-[unavailable]:text-destructive-foreground tw:data-[unavailable]:line-through',
                // Outside months
                'tw:data-[outside-view]:text-muted-foreground',
                props.class,
            )
        "
        v-bind="forwardedProps"
    >
        <slot />
    </CalendarCellTrigger>
</template>
