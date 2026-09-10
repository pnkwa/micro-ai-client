<script setup lang="ts">
import { Check, Plus, X } from '@lucide/vue'
import {
    DEFAULT_CLASS_COLOR,
    toColorHex,
    type AnnotationClass,
} from '~/core/helpers/annotationClasses'

/**
 * The class picker as a horizontally scrolling bottom strip.
 *
 * No number keycaps here: there is no keyboard, and a key hint on a surface that cannot receive one
 * is noise. Picking is the tap itself, which is why every chip is 44px tall.
 *
 * Creating AND editing a class both happen IN THE STRIP, not in a panel elsewhere: on a phone the
 * labels panel with its 11px swatch and hairline field never mounts, so this strip is the whole of
 * managing a class. Tapping "+" swaps the strip for a full-width name field and a 44px colour
 * swatch; tapping an existing chip's SWATCH swaps in the same editor pre-filled with that class, so
 * one gesture renames and recolours it. Tapping a chip's NAME is the pick (or, with a shape
 * selected, the reclass). Emits `(label, colorHex)` on create and `(id, label, colorHex)` on edit,
 * bare six-hex, the way ClassPicker does, so both callers manage a class the one way.
 */
const props = defineProps<{
    classes: AnnotationClass[]
    active: number | null
    /**
     * A fixed vocabulary: the list cannot be added to or edited, so the "+" and the swatch editor
     * are hidden. Used by an annotation assignment whose `label_set` the instructor authored
     * (mirrors ClassPicker's `fixed`).
     */
    fixed?: boolean
}>()

const emit = defineEmits<{
    pick: [labelId: number]
    create: [label: string, colorHex: string]
    edit: [labelId: number, label: string, colorHex: string]
}>()

// A new class is appended at the FOOT of the strip and armed, but a horizontal strip does not grow
// the way the vertical picker does - the new chip lands off the right edge and looks unreachable.
// So reveal the active chip (the just-made one, or a freshly picked one) whenever the list or the
// pick changes, the same courtesy ClassPicker does by scrolling its column to the bottom.
const stripEl = useTemplateRef<HTMLElement>('stripEl')
const revealActive = () =>
    nextTick(() => {
        const el = stripEl.value
        if (!el) return
        const chip = el.querySelector<HTMLElement>('[data-active]')
        if (chip) chip.scrollIntoView({ inline: 'nearest', block: 'nearest' })
        else el.scrollLeft = el.scrollWidth
    })
watch(() => props.classes.length, revealActive)
watch(() => props.active, revealActive)

// The editor's mode: `null` idle, `'new'` creating, or the id of the class being edited. One row
// serves both because a phone has no room for the list and a field at once.
const editing = ref<'new' | number | null>(null)
const draft = ref('')
// A `#rrggbb` string for the native colour input. On create it is a neutral grey default (the same
// for every class, recoloured deliberately from the swatch); on edit it is the class's own colour.
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
    <div
        ref="stripEl"
        class="tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:gap-1.5 tw:overflow-x-auto tw:border-t tw:border-an-border tw:bg-an-panel tw:px-2 tw:[touch-action:pan-x_pan-y]"
    >
        <!-- Create/edit mode takes the whole strip: a phone has no room for both the list and a
             field. Same row for both, so a class is named and recoloured the one way. -->
        <template v-if="editing !== null">
            <!-- A real, finger-sized colour swatch. The native input is sized over the square and
                 made invisible, so the tap area is the full 40px even though the paint is 22px. -->
            <span class="tw:relative tw:h-10 tw:w-10 tw:shrink-0">
                <span
                    class="tw:absolute tw:inset-[9px] tw:rounded-md tw:ring-1 tw:ring-an-border"
                    :style="{ background: draftColor }"
                ></span>
                <input
                    v-model="draftColor"
                    type="color"
                    class="tw:absolute tw:inset-0 tw:h-full tw:w-full tw:cursor-pointer tw:opacity-0"
                    aria-label="Class colour"
                    title="Class colour"
                />
            </span>
            <input
                v-model="draft"
                autofocus
                :placeholder="editing === 'new' ? 'Class name' : 'Rename class'"
                class="tw:h-10 tw:min-w-0 tw:flex-1 tw:rounded-lg tw:border tw:border-an-border tw:bg-white tw:px-3 tw:text-[15px] tw:text-an-text tw:outline-none tw:focus:border-an-accent"
                @keydown.enter="submit"
                @keydown.esc="cancel"
            />
            <button
                type="button"
                class="tw:flex tw:h-10 tw:w-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg tw:bg-an-accent tw:text-white tw:disabled:opacity-40"
                :disabled="!draft.trim()"
                :aria-label="editing === 'new' ? 'Add class' : 'Save class'"
                @click="submit"
            >
                <Check class="tw:h-5 tw:w-5" />
            </button>
            <button
                type="button"
                class="tw:flex tw:h-10 tw:w-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg tw:text-an-faint"
                aria-label="Cancel"
                @click="cancel"
            >
                <X class="tw:h-5 tw:w-5" />
            </button>
        </template>

        <template v-else>
            <div
                v-for="klass in classes"
                :key="klass.id"
                :data-active="klass.id === active ? '' : undefined"
                class="tw:flex tw:h-11 tw:shrink-0 tw:items-center tw:gap-2 tw:rounded-xl tw:pr-3 tw:pl-2.5 tw:transition-colors"
                :class="klass.id === active ? '' : 'tw:bg-an-n-100'"
                :style="
                    klass.id === active
                        ? {
                              background: `${klass.color}1A`,
                              boxShadow: `inset 0 0 0 1.5px ${klass.color}`,
                          }
                        : undefined
                "
            >
                <!-- Tapping the swatch opens the editor for this class (rename + recolour). It is the
                     one class-managing affordance a phone has, since the labels panel never mounts on
                     a stacked layout. A separate tap target from the name, so editing is not a pick.
                     When fixed it is a plain square: nothing here can be changed. -->
                <button
                    v-if="!fixed"
                    type="button"
                    class="tw:h-6 tw:w-6 tw:shrink-0 tw:rounded-md"
                    :style="{ background: klass.color }"
                    :aria-label="`Edit ${klass.label}`"
                    :title="`Edit ${klass.label}`"
                    @click="startEditing(klass)"
                ></button>
                <span
                    v-else
                    class="tw:h-3 tw:w-3 tw:shrink-0 tw:rounded-[4px]"
                    :style="{ background: klass.color }"
                ></span>
                <button
                    type="button"
                    class="tw:whitespace-nowrap tw:text-[13px] tw:font-medium tw:text-an-text"
                    @click="emit('pick', klass.id)"
                >
                    {{ klass.label }}
                </button>
            </div>

            <button
                v-if="!fixed"
                type="button"
                class="tw:flex tw:h-11 tw:w-11 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-xl tw:border tw:border-dashed tw:border-an-n-200 tw:text-an-faint"
                aria-label="New class"
                @click="startAdding"
            >
                <Plus class="tw:h-5 tw:w-5" />
            </button>

            <p
                v-if="!classes.length"
                class="tw:px-2 tw:text-[12px] tw:whitespace-nowrap tw:text-an-faint"
            >
                No classes yet. Add one to start labelling.
            </p>
        </template>
    </div>
</template>
