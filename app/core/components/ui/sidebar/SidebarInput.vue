<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/core/lib/utils'
import { Input } from '@/core/components/ui/input'

const props = defineProps<{
    class?: HTMLAttributes['class']
}>()
</script>

<template>
    <Input
        data-slot="sidebar-input"
        data-sidebar="input"
        :class="cn('tw:bg-background tw:h-8 tw:w-full tw:shadow-none', props.class)"
    >
        <slot />
    </Input>
</template>
