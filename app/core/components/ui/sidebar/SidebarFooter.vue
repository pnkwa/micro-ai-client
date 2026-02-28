<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from '@/core/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="sidebar-footer"
    data-sidebar="footer"
    :class="cn('tw:flex tw:flex-col tw:gap-2 tw:p-2', props.class)"
  >
    <slot />
  </div>
</template>
