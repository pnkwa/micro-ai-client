<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from '.'
import { Primitive } from 'reka-ui'
import { Loader2 } from '@lucide/vue'
import { cn } from '@/core/lib/utils'
import { buttonVariants } from '.'

interface Props extends PrimitiveProps {
    variant?: ButtonVariants['variant']
    size?: ButtonVariants['size']
    class?: HTMLAttributes['class']
    loading?: boolean
    disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    as: 'button',
})

// Disabling while loading is the point: it stops a double-submit, which for sign-in means
// a second request racing the first. buttonVariants already styles :disabled.
const isDisabled = computed(() => props.disabled || props.loading)
</script>

<template>
    <Primitive
        data-slot="button"
        :data-variant="variant"
        :data-size="size"
        :as="as"
        :as-child="asChild"
        :disabled="isDisabled"
        :aria-busy="loading"
        :class="cn(buttonVariants({ variant, size }), props.class)"
    >
        <Loader2 v-if="loading" class="tw:size-4 tw:animate-spin" />
        <slot />
    </Primitive>
</template>
