<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { SwitchRootEmits, SwitchRootProps } from 'reka-ui'
import { SwitchRoot, SwitchThumb, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/core/lib/utils'

const props = defineProps<SwitchRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<SwitchRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
    <SwitchRoot
        data-slot="switch"
        v-bind="forwarded"
        :class="
            cn(
                'tw:peer tw:data-[state=checked]:bg-primary tw:data-[state=unchecked]:bg-navy-20 tw:focus-visible:ring-2 tw:focus-visible:ring-primary/30 tw:inline-flex tw:h-5 tw:w-9 tw:shrink-0 tw:cursor-pointer tw:items-center tw:rounded-full tw:transition-colors tw:outline-none tw:disabled:cursor-not-allowed tw:disabled:opacity-50',
                props.class,
            )
        "
    >
        <SwitchThumb
            data-slot="switch-thumb"
            class="tw:pointer-events-none tw:block tw:size-4 tw:translate-x-0.5 tw:rounded-full tw:bg-white tw:shadow-sm tw:transition-transform tw:data-[state=checked]:translate-x-[18px]"
        />
    </SwitchRoot>
</template>
