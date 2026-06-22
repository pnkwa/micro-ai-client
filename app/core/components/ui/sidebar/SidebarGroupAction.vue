<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { Primitive } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<
    PrimitiveProps & {
        class?: HTMLAttributes['class']
    }
>()
</script>

<template>
    <Primitive
        data-slot="sidebar-group-action"
        data-sidebar="group-action"
        :as="as"
        :as-child="asChild"
        :class="
            cn(
                'tw:text-sidebar-foreground tw:ring-sidebar-ring tw:hover:bg-sidebar-accent tw:hover:text-sidebar-accent-foreground tw:absolute tw:top-3.5 tw:right-3 tw:flex tw:aspect-square tw:w-5 tw:items-center tw:justify-center tw:rounded-md tw:p-0 tw:outline-hidden tw:transition-transform tw:focus-visible:ring-2 tw:[&>svg]:size-4 tw:[&>svg]:shrink-0',
                'tw:after:absolute tw:after:-inset-2 tw:md:after:hidden',
                'tw:group-data-[collapsible=icon]:hidden',
                props.class,
            )
        "
    >
        <slot />
    </Primitive>
</template>
