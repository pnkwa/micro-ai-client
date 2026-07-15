<script lang="ts" setup>
import type { CalendarGridProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { CalendarGrid, useForwardProps } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<CalendarGridProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
    <CalendarGrid
        data-slot="calendar-grid"
        :class="cn('tw:w-full tw:border-collapse tw:space-x-1', props.class)"
        v-bind="forwardedProps"
    >
        <slot />
    </CalendarGrid>
</template>
