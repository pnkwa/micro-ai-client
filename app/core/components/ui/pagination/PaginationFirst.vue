<script setup lang="ts">
import type { PaginationFirstProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from '@/core/components/ui/button'
import { reactiveOmit } from '@vueuse/core'
import { ChevronLeftIcon } from 'lucide-vue-next'
import { PaginationFirst, useForwardProps } from 'reka-ui'
import { cn } from '@/core/lib/utils'
import { buttonVariants } from '@/core/components/ui/button'

const props = withDefaults(
    defineProps<
        PaginationFirstProps & {
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
    <PaginationFirst
        data-slot="pagination-first"
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
            <ChevronLeftIcon />
            <span class="tw:hidden tw:sm:block">First</span>
        </slot>
    </PaginationFirst>
</template>
