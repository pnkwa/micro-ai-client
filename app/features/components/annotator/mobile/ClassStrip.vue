<script setup lang="ts">
import { Check, Plus, X } from '@lucide/vue'
import { classColorAt, toColorHex, type AnnotationClass } from '~/core/helpers/annotationClasses'

/**
 * The class picker as a horizontally scrolling bottom strip.
 *
 * No number keycaps here: there is no keyboard, and a key hint on a surface that cannot receive one
 * is noise. Picking is the tap itself, which is why every chip is 44px tall.
 *
 * Creating a class happens IN THE STRIP, not in a panel elsewhere: on a phone the labels panel is a
 * summoned drawer, and its inline add-row is an 11px swatch and a hairline field, neither of them a
 * real touch target. Tapping "+" here swaps the strip for a full-width name field and a 44px colour
 * swatch, so the name is typeable and the colour is changeable with a finger. Emits the same
 * `(label, colorHex)` as ClassPicker (bare six-hex), so both callers create a class the one way.
 */
const props = defineProps<{
    classes: AnnotationClass[]
    active: number | null
    /**
     * A fixed vocabulary: the list cannot be added to, so the "+" is hidden. Used by an annotation
     * assignment whose `label_set` the instructor authored (mirrors ClassPicker's `fixed`).
     */
    fixed?: boolean
}>()

const emit = defineEmits<{ pick: [labelId: number]; create: [label: string, colorHex: string] }>()

const adding = ref(false)
const draft = ref('')
// A `#rrggbb` string for the native colour input; the next colour along the cycle so two classes
// made back to back are not the same shade. Set fresh each time the row opens.
const draftColor = ref(classColorAt(props.classes.length))

const startAdding = () => {
    draftColor.value = classColorAt(props.classes.length)
    draft.value = ''
    adding.value = true
}

const cancel = () => {
    adding.value = false
    draft.value = ''
}

const submit = () => {
    const label = draft.value.trim()
    if (label) emit('create', label, toColorHex(draftColor.value))
    cancel()
}
</script>

<template>
    <div
        class="tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:gap-1.5 tw:overflow-x-auto tw:border-t tw:border-an-border tw:bg-an-panel tw:px-2"
    >
        <!-- Create mode takes the whole strip: a phone has no room for both the list and a field. -->
        <template v-if="adding">
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
                    aria-label="Colour for the new class"
                    title="Colour for the new class"
                />
            </span>
            <input
                v-model="draft"
                autofocus
                placeholder="Class name"
                class="tw:h-10 tw:min-w-0 tw:flex-1 tw:rounded-lg tw:border tw:border-an-border tw:bg-white tw:px-3 tw:text-[15px] tw:text-an-text tw:outline-none tw:focus:border-an-accent"
                @keydown.enter="submit"
                @keydown.esc="cancel"
            />
            <button
                type="button"
                class="tw:flex tw:h-10 tw:w-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg tw:bg-an-accent tw:text-white tw:disabled:opacity-40"
                :disabled="!draft.trim()"
                aria-label="Add class"
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
            <button
                v-for="klass in classes"
                :key="klass.id"
                type="button"
                class="tw:flex tw:h-11 tw:shrink-0 tw:items-center tw:gap-2 tw:rounded-xl tw:px-3 tw:transition-colors"
                :class="klass.id === active ? '' : 'tw:bg-an-n-100'"
                :style="
                    klass.id === active
                        ? {
                              background: `${klass.color}1A`,
                              boxShadow: `inset 0 0 0 1.5px ${klass.color}`,
                          }
                        : undefined
                "
                @click="emit('pick', klass.id)"
            >
                <span
                    class="tw:h-3 tw:w-3 tw:shrink-0 tw:rounded-[4px]"
                    :style="{ background: klass.color }"
                ></span>
                <span class="tw:text-[13px] tw:font-medium tw:whitespace-nowrap tw:text-an-text">
                    {{ klass.label }}
                </span>
            </button>

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
