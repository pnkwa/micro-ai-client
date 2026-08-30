<script setup lang="ts">
import { Upload } from '@lucide/vue'

/**
 * Drag-and-drop or click to pick files.
 *
 * Extracted on its third copy. `ImportStudentsCsv.vue` and `ImportAnswerKeyXlsx.vue` each hand-roll
 * the same label-wrapping-a-hidden-input, and the image library needed a fourth - at which point the
 * two details that are easy to get wrong are worth owning in one place:
 *
 *  - **every drag handler is `.prevent`**, including `dragover` and `dragenter`. Miss one and the
 *    browser navigates to the dropped file instead of handing it over;
 *  - **the input is cleared after each pick**, so choosing the same file twice in a row still fires
 *    `change` the second time.
 *
 * Validation stays with the caller. This does not know what a usable file is - the CSV importers
 * check an extension, the library runs `rejectUnusableImage` - and a dropzone that guessed would be
 * wrong for one of them.
 */
const props = withDefaults(
    defineProps<{
        /** The `accept` attribute, e.g. `image/*` or `.csv,text/csv`. */
        accept?: string
        multiple?: boolean
        disabled?: boolean
        /** Resting prompt. The drag-over prompt is `hint` with the verb swapped. */
        label?: string
        hint?: string
    }>(),
    {
        accept: undefined,
        multiple: false,
        disabled: false,
        label: 'Drag & drop or click to choose a file',
        hint: 'Drop the file here',
    },
)

const emit = defineEmits<{ files: [files: File[]] }>()

const isDragging = ref(false)

const handOver = (list: FileList | null | undefined) => {
    const files = Array.from(list ?? [])
    if (files.length) emit('files', props.multiple ? files : files.slice(0, 1))
}

const onDragOver = () => {
    if (!props.disabled) isDragging.value = true
}

const onDragLeave = () => {
    isDragging.value = false
}

const onDrop = (event: DragEvent) => {
    isDragging.value = false
    if (props.disabled) return
    handOver(event.dataTransfer?.files)
}

const onPick = (event: Event) => {
    const input = event.target as HTMLInputElement
    handOver(input.files)
    // Cleared so picking the same file twice in a row still fires `change`.
    input.value = ''
}
</script>

<template>
    <label
        class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:py-8 tw:px-4 tw:border-2 tw:border-dashed tw:rounded-lg tw:transition-colors tw:text-center"
        :class="
            disabled
                ? 'tw:border-navy-20 tw:bg-navy-5 tw:cursor-not-allowed tw:opacity-60'
                : isDragging
                  ? 'tw:border-primary tw:bg-primary/10 tw:cursor-pointer'
                  : 'tw:border-navy-20 tw:hover:border-primary tw:hover:bg-primary/5 tw:cursor-pointer'
        "
        @dragover.prevent="onDragOver"
        @dragenter.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
    >
        <Upload class="tw:w-6 tw:h-6 tw:text-navy-50" />
        <span class="tw:text-sm tw:text-navy-60">
            {{ isDragging ? hint : label }}
        </span>
        <slot />
        <input
            type="file"
            class="tw:hidden"
            :accept="accept"
            :multiple="multiple"
            :disabled="disabled"
            @change="onPick"
        />
    </label>
</template>
