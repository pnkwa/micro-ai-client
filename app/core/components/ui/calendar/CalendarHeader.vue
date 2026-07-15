<script lang="ts" setup>
import type { CalendarHeaderProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { CalendarHeader, useForwardProps } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<CalendarHeaderProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
    <CalendarHeader
        data-slot="calendar-header"
        :class="
            cn(
                'tw:flex tw:justify-center tw:pt-1 tw:relative tw:items-center tw:w-full tw:px-8',
                props.class,
            )
        "
        v-bind="forwardedProps"
    >
        <slot />
    </CalendarHeader>
</template>
