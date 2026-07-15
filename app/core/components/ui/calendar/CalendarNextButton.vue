<script lang="ts" setup>
import type { CalendarNextProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { ChevronRight } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { CalendarNext, useForwardProps } from 'reka-ui'
import { cn } from '@/core/lib/utils'
import { buttonVariants } from '@/core/components/ui/button'

const props = defineProps<CalendarNextProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
    <CalendarNext
        data-slot="calendar-next-button"
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
            <ChevronRight class="tw:size-4" />
        </slot>
    </CalendarNext>
</template>
