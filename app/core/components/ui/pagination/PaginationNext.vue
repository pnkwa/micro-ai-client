<script setup lang="ts">
import type { PaginationNextProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from '@/core/components/ui/button'
import { reactiveOmit } from '@vueuse/core'
import { ChevronRightIcon } from '@lucide/vue'
import { PaginationNext, useForwardProps } from 'reka-ui'
import { cn } from '@/core/lib/utils'
import { buttonVariants } from '@/core/components/ui/button'

const props = withDefaults(
    defineProps<
        PaginationNextProps & {
            size?: ButtonVariants['size']
            class?: HTMLAttributes['class']
        }
    >(),
    {
        size: 'default',
    },
)

const delegatedProps = reactiveOmit(props, 'class', 'size')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
    <PaginationNext
        data-slot="pagination-next"
        :class="
            cn(
                buttonVariants({ variant: 'ghost', size }),
                'tw:gap-1 tw:px-2.5 tw:sm:pr-2.5',
                props.class,
            )
        "
        v-bind="forwarded"
    >
        <slot>
            <span class="tw:hidden tw:sm:block">Next</span>
            <ChevronRightIcon />
        </slot>
    </PaginationNext>
</template>
