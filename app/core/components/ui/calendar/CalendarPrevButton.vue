<script lang="ts" setup>
import type { CalendarPrevProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { ChevronLeft } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { CalendarPrev, useForwardProps } from 'reka-ui'
import { cn } from '@/core/lib/utils'
import { buttonVariants } from '@/core/components/ui/button'

const props = defineProps<CalendarPrevProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
    <CalendarPrev
        data-slot="calendar-prev-button"
        :class="
            cn(
                buttonVariants({ variant: 'outline' }),
                'tw:size-7 tw:bg-transparent tw:p-0 tw:opacity-50 tw:hover:opacity-100',
                props.class,
            )
        "
        v-bind="forwardedProps"
    >
        <slot>
            <ChevronLeft class="tw:size-4" />
        </slot>
    </CalendarPrev>
</template>
