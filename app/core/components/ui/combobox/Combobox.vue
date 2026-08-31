<script setup lang="ts">
import type { ComboboxRootEmits, ComboboxRootProps } from 'reka-ui'
import { ComboboxRoot, useForwardPropsEmits } from 'reka-ui'

/**
 * A searchable select: reka-ui's Combobox, styled to match the Select and Popover already here.
 *
 * Filtering is the primitive's own, keyed off each item's text, so a list stays a list of
 * `McComboboxItem`s and nothing has to be filtered by hand.
 */
const props = withDefaults(defineProps<ComboboxRootProps>(), {
    open: undefined,
    // The search box lives in the popup, so a term left behind would silently hide options the
    // next time it opens.
    resetSearchTermOnBlur: true,
})
const emits = defineEmits<ComboboxRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
    <ComboboxRoot data-slot="combobox" v-bind="forwarded">
        <slot />
    </ComboboxRoot>
</template>
