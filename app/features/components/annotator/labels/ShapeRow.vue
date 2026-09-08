<script setup lang="ts">
import { Check, Eye, EyeOff, Pentagon, Square, X } from '@lucide/vue'
import type { Shape } from '~/core/helpers/annotationShapes'

/**
 * One shape, in four states: normal, selected, seeded, hidden.
 *
 * SEEDED IS A REVIEW QUEUE, NOT A RESULT. A shape copied from a model run carries its real
 * confidence and an accept/reject pair instead of the eye, and the image stays amber until every
 * one has been passed over. That is BE-ADR-030's argument made visible: a correction says WHERE the
 * model was wrong, which is the signal the research team wants, and it only exists if someone
 * actually looks at each box.
 *
 * The confidence is real because these shapes are seeded CLIENT-SIDE from the detection's own boxes
 * rather than through the server's seed endpoint - `image_annotations` stores no confidence, and
 * the serializer synthesizes 1 precisely so a fabricated number never reaches the export. It is
 * therefore session-only: saving drops it, and a reload will not bring it back.
 */
const props = withDefaults(
    defineProps<{
        shape: Shape
        color: string | null
        selected: boolean
        hidden: boolean
        /** Present only while the shape is seeded and unreviewed. */
        confidence: number | null
        /** Off for a fixed vocabulary, where a box is relabelled by picking, not by typing. */
        editable?: boolean
    }>(),
    { editable: true },
)

const emit = defineEmits<{
    select: []
    'toggle-hidden': []
    accept: []
    reject: []
    /** A new label typed onto this shape's row. The parent applies it (minting a class if new). */
    relabel: [label: string]
}>()

// Inline relabel, opened by double-clicking the label (editable rows only). Enter/blur commits,
// Escape abandons; a blank or unchanged value is a cancel, not a way to unname the box.
const editing = ref(false)
const draft = ref('')
const inputEl = useTemplateRef<HTMLInputElement>('inputEl')
const startEdit = () => {
    if (!props.editable) return
    draft.value = props.shape.label
    editing.value = true
    void nextTick(() => {
        inputEl.value?.focus()
        inputEl.value?.select()
    })
}
const cancelEdit = () => {
    editing.value = false
    draft.value = ''
}
const commitEdit = () => {
    if (!editing.value) return
    const name = draft.value.trim()
    editing.value = false
    if (name && name !== props.shape.label) emit('relabel', name)
}

/**
 * Geometry, then provenance: `polygon, seeded 0.91` or `rectangle, drawn by you`.
 *
 * Provenance is the half that decides what to do with the row. A seeded shape is a claim to check;
 * one you drew is already checked, and saying so is what stops the two blurring together in a list
 * of twenty. The node count is deliberately gone: "6 pts" beside a label read as a graded score.
 */
const meta = computed(() => {
    const geometry = props.shape.polygon ? 'polygon' : 'rectangle'
    const origin =
        props.confidence !== null ? `seeded ${props.confidence.toFixed(2)}` : 'drawn by you'
    return `${geometry}, ${origin}`
})

/**
 * The row's own surface.
 *
 * Both marked states are a near-white wash plus a 1px inset ring rather than a saturated fill: the
 * list is read as a column, and a strongly tinted row pulls the eye away from the picture, which is
 * the thing being looked at. The ring carries the meaning, the fill only separates.
 */
const surface = computed(() => {
    if (props.selected) return 'tw:bg-an-n-50 tw:ring-1 tw:ring-inset tw:ring-an-accent/40'
    if (props.confidence !== null) {
        return 'tw:bg-an-seed-tint tw:ring-1 tw:ring-inset tw:ring-an-seed-ring'
    }
    return 'tw:hover:bg-an-n-50'
})

/** Dimmer when there is less to say: a hidden shape recedes, the selected one comes forward. */
const eyeColor = computed(() => {
    if (props.selected) return 'tw:text-an-n-600'
    if (props.confidence !== null) return 'tw:text-an-n-500'
    return 'tw:text-an-n-300'
})
</script>

<template>
    <li>
        <div
            class="tw:flex tw:h-[42px] tw:items-center tw:gap-[9px] tw:rounded-[8px] tw:px-2 tw:transition-colors"
            :class="[surface, hidden ? 'tw:opacity-45' : '']"
        >
            <!-- The 3px bar is the class colour, and a PALE NEUTRAL when there is no class.

                 It used to be amber, which was wrong twice over: unnamed is now an ordinary saved
                 state rather than something the save refuses, so warning about it in a colour on
                 every such row is noise; and that amber was `#D97706`, which is class colour 2, so
                 an unnamed row was indistinguishable from a row correctly labelled with it. The
                 grey says "no colour has been assigned here", which is exactly the fact. The
                 italic "Unlabelled" beside it is what actually names the state. -->
            <span
                class="tw:h-6 tw:w-[3px] tw:shrink-0 tw:rounded-[2px]"
                :style="{ background: color ?? 'var(--color-an-n-250)' }"
            ></span>

            <!-- Editing swaps the select button for a plain row so the text field is not nested inside
                 a <button> (invalid, and it swallows the caret). Double-click the label to open it. -->
            <div v-if="editing" class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-[9px]">
                <Pentagon
                    v-if="shape.polygon"
                    class="tw:h-[15px] tw:w-[15px] tw:shrink-0 tw:text-an-n-500"
                />
                <Square v-else class="tw:h-[15px] tw:w-[15px] tw:shrink-0 tw:text-an-n-500" />
                <span class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-[2px]">
                    <input
                        ref="inputEl"
                        v-model="draft"
                        class="tw:min-w-0 tw:bg-transparent tw:text-[11.5px] tw:font-medium tw:text-an-text tw:outline-none"
                        @keydown.enter.prevent.stop="commitEdit"
                        @keydown.esc.prevent.stop="cancelEdit"
                        @blur="commitEdit"
                    />
                    <span
                        class="tw:truncate tw:font-mono tw:text-[10px] tw:tabular-nums tw:text-an-faint"
                    >
                        {{ meta }}
                    </span>
                </span>
            </div>

            <button
                v-else
                type="button"
                class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-[9px] tw:text-left"
                @click="emit('select')"
            >
                <Pentagon
                    v-if="shape.polygon"
                    class="tw:h-[15px] tw:w-[15px] tw:shrink-0 tw:text-an-n-500"
                />
                <Square v-else class="tw:h-[15px] tw:w-[15px] tw:shrink-0 tw:text-an-n-500" />
                <span class="tw:flex tw:min-w-0 tw:flex-col tw:gap-[2px]">
                    <!-- Double-click to relabel this box in place. -->
                    <span
                        class="tw:truncate tw:text-[11.5px] tw:font-medium"
                        :class="shape.label ? 'tw:text-an-text' : 'tw:text-an-n-300 tw:italic'"
                        :title="editable ? 'Double-click to relabel' : undefined"
                        @dblclick.stop.prevent="startEdit"
                    >
                        {{ shape.label || 'Unlabelled' }}
                    </span>
                    <span
                        class="tw:truncate tw:font-mono tw:text-[10px] tw:tabular-nums tw:text-an-faint"
                    >
                        {{ meta }}
                    </span>
                </span>
            </button>

            <!-- Accept/reject REPLACES the eye while seeded: hiding a box you have not judged is
                 not a thing anyone wants to do, and the row has room for one control. -->
            <!--
                Always-filled chips, not hover-only, and the reject is NEUTRAL rather than red: a
                seeded shape is a review, and rejecting the model's guess is an ordinary answer, not
                a destructive one. 24px, the mockup's accept #E6F4F2/#0B7C70 and reject
                #F7F8F9/#8A9099.
            -->
            <span v-if="confidence !== null" class="tw:flex tw:shrink-0 tw:gap-1">
                <button
                    type="button"
                    class="tw:flex tw:h-6 tw:w-6 tw:items-center tw:justify-center tw:rounded-md tw:bg-an-accent-tint tw:text-an-accent-hover"
                    aria-label="Accept this shape"
                    title="Accept"
                    @click="emit('accept')"
                >
                    <Check class="tw:h-3.5 tw:w-3.5" />
                </button>
                <button
                    type="button"
                    class="tw:flex tw:h-6 tw:w-6 tw:items-center tw:justify-center tw:rounded-md tw:bg-an-n-50 tw:text-an-n-500"
                    aria-label="Reject this shape"
                    title="Reject"
                    @click="emit('reject')"
                >
                    <X class="tw:h-3.5 tw:w-3.5" />
                </button>
            </span>

            <button
                v-else
                type="button"
                class="tw:flex tw:shrink-0 tw:items-center tw:justify-center tw:transition-colors tw:hover:text-an-muted"
                :class="eyeColor"
                :aria-label="hidden ? 'Show this shape' : 'Hide this shape'"
                @click="emit('toggle-hidden')"
            >
                <EyeOff v-if="hidden" class="tw:h-[15px] tw:w-[15px]" />
                <Eye v-else class="tw:h-[15px] tw:w-[15px]" />
            </button>
        </div>
    </li>
</template>
