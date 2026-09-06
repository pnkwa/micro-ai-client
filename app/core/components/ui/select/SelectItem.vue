<script setup lang="ts">
import type { SelectItemProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { SelectItem, SelectItemText, useForwardProps } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<SelectItemProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
    <SelectItem
        data-slot="select-item"
        v-bind="forwardedProps"
        :class="
            cn(
                `tw:focus:bg-accent tw:text-base tw:h-10 tw:transition-colors tw:duration-100 tw:focus:text-accent-foreground tw:[&_svg:not([class*='text-'])]:text-muted-foreground tw:relative tw:flex tw:w-full tw:cursor-default tw:items-center tw:gap-2 tw:rounded-sm tw:py-1.5 tw:pr-8 tw:pl-2 tw:outline-hidden tw:select-none tw:data-[disabled]:pointer-events-none tw:data-[disabled]:opacity-50 tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex tw:*:[span]:last:items-center tw:*:[span]:last:gap-2 tw:data-[state=checked]:bg-primary-hover-cursor tw:data-[state=checked]:font-semibold tw:data-[state=checked]:text-primary tw:data-[highlighted]:bg-primary-hover-cursor`,
                props.class,
            )
        "
    >
        <SelectItemText>
            <slot />
        </SelectItemText>
    </SelectItem>
</template>
