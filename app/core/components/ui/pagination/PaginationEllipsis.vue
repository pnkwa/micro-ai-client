<script setup lang="ts">
import type { PaginationEllipsisProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { MoreHorizontal } from 'lucide-vue-next'
import { PaginationEllipsis } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<PaginationEllipsisProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
    <PaginationEllipsis
        data-slot="pagination-ellipsis"
        v-bind="delegatedProps"
        :class="cn('tw:flex tw:size-9 tw:items-center tw:justify-center', props.class)"
    >
        <slot>
            <MoreHorizontal class="tw:size-4" />
            <span class="tw:sr-only">More pages</span>
        </slot>
    </PaginationEllipsis>
</template>
