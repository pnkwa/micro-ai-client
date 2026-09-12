<script setup lang="ts">
/**
 * The class chips — the bottom half of the Label tab body.
 *
 * A horizontally scrolling row of the classes the assignment defines: colour square + name +
 * count-when-used. The picked chip is tinted in its OWN colour with a 1.5px ring, so which class
 * the next box takes is legible at a glance. Picking the active chip again clears it (the page
 * toggles `activeLabelId` to null), so a box can be left unlabelled.
 *
 * Normally the vocabulary is FIXED — the instructor authored `label_set` and a student only picks
 * from it — and then this is the whole component. But an annotation assignment may ship an empty
 * `label_set`, which means free text, and on a stacked layout this strip is the only class surface
 * there is (the docked ClassPicker never mounts). So when `fixed` is false the strip also creates
 * and edits, the same way the instructor's `ClassStrip` does and for the same reason: tapping "+"
 * swaps the strip for a name field and a finger-sized colour swatch, and tapping an existing chip's
 * SWATCH swaps in that same editor pre-filled, so one gesture renames and recolours. Tapping a
 * chip's NAME stays the pick.
 */
import { Check, Plus, X } from '@lucide/vue'
import {
    DEFAULT_CLASS_COLOR,
    toColorHex,
    type AnnotationClass,
} from '~/core/helpers/annotationClasses'

defineProps<{
    classes: AnnotationClass[]
    /** The class new boxes take, highlighted. Null when nothing is armed. */
    active: number | null
    /** A fixed vocabulary: no "+", no swatch editor, picking is all this strip does. */
    fixed?: boolean
}>()

const emit = defineEmits<{
    pick: [id: number]
    create: [label: string, colorHex: string]
    edit: [id: number, label: string, colorHex: string]
}>()

// The editor's mode: `null` idle, `'new'` creating, or the id of the class being edited. One row
// serves both, because at peek this strip is 44px and has no room for the list and a field at once.
const editing = ref<'new' | number | null>(null)
const draft = ref('')
const draftColor = ref(DEFAULT_CLASS_COLOR)

const startAdding = () => {
    draftColor.value = DEFAULT_CLASS_COLOR
    draft.value = ''
    editing.value = 'new'
}

const startEditing = (klass: AnnotationClass) => {
    // `klass.color` is already `#`-prefixed (colorOf), which is what the native input wants.
    draftColor.value = klass.color
    draft.value = klass.label
    editing.value = klass.id
}

const cancel = () => {
    editing.value = null
    draft.value = ''
}

const submit = () => {
    const label = draft.value.trim()
    if (label && editing.value === 'new') emit('create', label, toColorHex(draftColor.value))
    else if (label && typeof editing.value === 'number')
        emit('edit', editing.value, label, toColorHex(draftColor.value))
    cancel()
}
</script>

<template>
    <!-- `pan-x` keeps the strip swipeable while the shell blocks page pinch/zoom. -->
    <div class="tw:flex tw:h-11 tw:items-center tw:gap-2 tw:overflow-x-auto tw:[touch-action:pan-x]">
        <!-- Create / edit takes the whole strip. Same row for both, so a class is named and
             recoloured the one way. -->
        <template v-if="editing !== null">
            <!-- A real, finger-sized colour target: the native input is sized over the square and
                 made invisible, so the tap area is the full 40px even though the paint is 20px. -->
            <span class="tw:relative tw:size-10 tw:shrink-0">
                <span
                    class="tw:absolute tw:inset-2.5 tw:rounded-[5px] tw:ring-1 tw:ring-an-border"
                    :style="{ background: draftColor }"
                />
                <input
                    v-model="draftColor"
                    type="color"
                    class="tw:absolute tw:inset-0 tw:size-full tw:cursor-pointer tw:opacity-0"
                    aria-label="Class colour"
                />
            </span>
            <input
                v-model="draft"
                autofocus
                :placeholder="editing === 'new' ? 'Class name' : 'Rename class'"
                class="tw:h-10 tw:min-w-0 tw:flex-1 tw:rounded-[10px] tw:border tw:border-an-n-200 tw:bg-an-n-50 tw:px-3 tw:text-sm tw:outline-none tw:placeholder:text-an-faint tw:focus:border-an-accent"
                @keydown.enter="submit"
                @keydown.esc="cancel"
            />
            <button
                type="button"
                class="tw:flex tw:size-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[10px] tw:bg-an-accent tw:text-white tw:disabled:opacity-40"
                :disabled="!draft.trim()"
                :aria-label="editing === 'new' ? 'Add class' : 'Save class'"
                @click="submit"
            >
                <Check class="tw:size-[19px]" />
            </button>
            <button
                type="button"
                class="tw:flex tw:size-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[10px] tw:text-an-faint"
                aria-label="Cancel"
                @click="cancel"
            >
                <X class="tw:size-[19px]" />
            </button>
        </template>

        <template v-else>
            <div
                v-for="klass in classes"
                :key="klass.id"
                class="tw:flex tw:h-11 tw:shrink-0 tw:items-center tw:rounded-[10px] tw:border tw:transition-colors"
                :class="
                    klass.id === active
                        ? 'tw:border-[1.5px] tw:text-an-text'
                        : 'tw:border-an-n-200 tw:bg-an-panel tw:text-an-n-700'
                "
                :style="
                    klass.id === active
                        ? { borderColor: klass.color, background: `${klass.color}14` }
                        : undefined
                "
            >
                <!-- With a free vocabulary the swatch is the edit handle, so it is its own 44px
                     target ahead of the name; with a fixed one it is part of the pick button. -->
                <button
                    v-if="!fixed"
                    type="button"
                    class="tw:flex tw:h-11 tw:w-8 tw:shrink-0 tw:items-center tw:justify-center tw:pl-[13px]"
                    :aria-label="`Edit ${klass.label}`"
                    @click="startEditing(klass)"
                >
                    <span
                        class="tw:size-[11px] tw:shrink-0 tw:rounded-[3px]"
                        :style="{ background: klass.color }"
                    />
                </button>
                <button
                    type="button"
                    class="tw:flex tw:h-11 tw:shrink-0 tw:items-center tw:gap-2 tw:text-[13.5px] tw:font-medium"
                    :class="fixed ? 'tw:px-[13px]' : 'tw:pr-[13px] tw:pl-2'"
                    :aria-pressed="klass.id === active"
                    @click="emit('pick', klass.id)"
                >
                    <span
                        v-if="fixed"
                        class="tw:size-[11px] tw:shrink-0 tw:rounded-[3px]"
                        :style="{ background: klass.color }"
                    />
                    {{ klass.label }}
                    <span
                        v-if="klass.count > 0"
                        class="tw:font-mono tw:text-[11.5px] tw:font-medium tw:text-an-muted"
                    >
                        {{ klass.count }}
                    </span>
                </button>
            </div>

            <button
                v-if="!fixed"
                type="button"
                class="tw:flex tw:size-11 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[10px] tw:border tw:border-dashed tw:border-an-n-200 tw:text-an-faint"
                aria-label="New class"
                @click="startAdding"
            >
                <Plus class="tw:size-[19px]" />
            </button>

            <p
                v-if="!classes.length && !fixed"
                class="tw:px-1 tw:text-[12px] tw:whitespace-nowrap tw:text-an-faint"
            >
                No classes yet. Add one to start labelling.
            </p>
        </template>
    </div>
</template>
