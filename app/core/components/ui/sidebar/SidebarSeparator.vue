<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from '@/core/lib/utils'
import { Separator } from '@/core/components/ui/separator'

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <Separator
    data-slot="sidebar-separator"
    data-sidebar="separator"
    :class="cn('tw:bg-sidebar-border tw:mx-2 tw:w-auto', props.class)"
  >
    <slot />
  </Separator>
</template>
