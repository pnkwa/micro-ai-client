<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/core/lib/utils'

const props = withDefaults(
    defineProps<{
        class?: HTMLAttributes['class']
        modelValue?: string | number
        name?: string
        autoList?: boolean
    }>(),
    {
        autoList: false,
    },
)

const emits = defineEmits<{
    (e: 'update:modelValue', payload: string | number): void
}>()

const modelValue = useVeeValidateModel<string | number>(props, emits)

const errorMessage = computed(() => {
    return modelValue.errorMessage.value || ''
})

const onKeydown = (e: KeyboardEvent) => {
    if (!props.autoList || e.key !== 'Enter' || e.shiftKey || e.isComposing) return

    const el = e.target as HTMLTextAreaElement
    // Only act on a collapsed caret — leave range-selection Enter to the browser.
    if (el.selectionStart !== el.selectionEnd) return

    const value = String(modelValue.value.value ?? '')
    const pos = el.selectionStart
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1
    const line = value.slice(lineStart, pos)

    const ordered = /^(\s*)(\d+)([.)])\s+(.*)$/.exec(line)
    const bullet = /^(\s*)([-*])\s+(.*)$/.exec(line)

    let nextMarker: string
    let isEmptyItem: boolean
    if (ordered) {
        const [, indent = '', num = '0', sep = '.', content = ''] = ordered
        isEmptyItem = content.trim() === ''
        nextMarker = `${indent}${Number(num) + 1}${sep} `
    } else if (bullet) {
        const [, indent = '', mark = '-', content = ''] = bullet
        isEmptyItem = content.trim() === ''
        nextMarker = `${indent}${mark} `
    } else {
        return
    }

    e.preventDefault()

    let newValue: string
    let newPos: number
    if (isEmptyItem) {
        // Enter on an empty item ends the list: drop the dangling marker.
        newValue = value.slice(0, lineStart) + value.slice(pos)
        newPos = lineStart
    } else {
        const insert = `\n${nextMarker}`
        newValue = value.slice(0, pos) + insert + value.slice(pos)
        newPos = pos + insert.length
    }

    modelValue.value.value = newValue
    nextTick(() => {
        el.selectionStart = el.selectionEnd = newPos
    })
}
</script>

<template>
    <div class="tw:group/textarea tw:relative tw:w-full" :data-error="Boolean(errorMessage)">
        <textarea
            v-model="modelValue.value.value"
            data-slot="textarea"
            v-bind="$attrs"
            :class="
                cn(
                    'tw:flex tw:field-sizing-content tw:min-h-24 tw:max-h-64 tw:w-full tw:overflow-y-auto tw:rounded-md tw:border tw:border-input tw:bg-transparent tw:px-3 tw:py-2 tw:text-base tw:shadow-xs tw:transition-[color,box-shadow] tw:outline-none tw:resize-y tw:placeholder:text-muted-foreground tw:focus-visible:border-ring tw:focus-visible:ring-ring/50 tw:focus-visible:ring-[3px] tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:md:text-sm tw:group-data-[error=true]/textarea:border-destructive tw:group-data-[error=true]/textarea:ring-destructive/20',
                    props.class,
                )
            "
            @keydown="onKeydown"
        />
        <span
            v-if="errorMessage"
            :data-cy="`input-error-${props.name || 'default'}`"
            class="tw:text-destructive tw:text-sm tw:mt-1"
        >
            {{ errorMessage }}
        </span>
    </div>
</template>
