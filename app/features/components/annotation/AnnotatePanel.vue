<script setup lang="ts">
/**
 * The student workspace's right panel: the instructions, the per-image fill-in form, the class
 * picker (as a slot, so the desktop docks a ClassPicker here while a tablet uses the bottom
 * ClassStrip instead), the list of shapes on the current image, and the Mark done / Skip actions.
 *
 * A view component (props in, events out) so it renders identically whether it is the docked right
 * column or the contents of a drawer on a tablet.
 */
import { Check, ChevronDown, Pentagon, Shapes, SkipForward, Square, Trash2 } from '@lucide/vue'
import { colorForShape } from '~/core/helpers/annotationClasses'
import type { Shape } from '~/core/helpers/annotationShapes'
import type { AnnotationLabel } from '~/services/annotationLabelService'
import type { FieldPrompt } from '~/services/annotationAssignmentService'

const props = withDefaults(
    defineProps<{
        instructions: string | null | undefined
        fieldPrompts: FieldPrompt[]
        responses: Record<string, string> | null
        status: 'pending' | 'completed' | 'skipped' | null
        shapes: Shape[]
        selectedId: string | null
        hiddenIds: Set<string>
        palette: AnnotationLabel[]
        allowSkip: boolean
        /** A fixed vocabulary: a box is relabelled by picking a class, not by typing a new name. */
        lockLabels?: boolean
        /** Which image is showing, so the instructions card collapses from the second one onward. */
        imageIndex?: number
        /** Scopes the remembered instructions collapse state to this assignment. */
        instructionsKey?: string | number
        /**
         * Show instructions, the fill-in form and Mark done / Skip. On a tablet these move to the
         * AnnotateBrief band above the canvas, so the panel drawer turns them off and is left with
         * the classes and the shape list.
         */
        showBrief?: boolean
    }>(),
    { showBrief: true, imageIndex: 0 },
)

const emit = defineEmits<{
    'update-response': [key: string, value: string]
    'select-shape': [id: string]
    'delete-shape': [id: string]
    relabel: [id: string, label: string]
    'mark-done': []
    skip: []
}>()

// Inline relabel a box from its row, by double-clicking the label (free vocab only). Enter/blur
// commits, Escape abandons; a blank or unchanged value is a cancel.
const editingShapeId = ref<string | null>(null)
const shapeDraft = ref('')
const shapeInputEl = useTemplateRef<HTMLInputElement>('shapeInputEl')
const startShapeEdit = (s: Shape) => {
    if (props.lockLabels) return
    editingShapeId.value = s.id
    shapeDraft.value = s.label
    void nextTick(() => {
        shapeInputEl.value?.focus()
        shapeInputEl.value?.select()
    })
}
// A click on the label opens the editor; with a locked vocabulary it does nothing here and bubbles to
// the row so the shape is selected instead (a locked box is relabelled by picking a class).
const onLabelClick = (s: Shape, event: MouseEvent) => {
    if (props.lockLabels) return
    event.stopPropagation()
    startShapeEdit(s)
}
const cancelShapeEdit = () => {
    editingShapeId.value = null
    shapeDraft.value = ''
}
const commitShapeEdit = (s: Shape) => {
    if (editingShapeId.value !== s.id) return
    const name = shapeDraft.value.trim()
    editingShapeId.value = null
    if (name && name !== s.label) emit('relabel', s.id, name)
}

// Instructions collapse. The student reads them once: the card opens on the first image and stays
// open until they collapse it, then that choice is remembered per assignment. From the second image
// onward the default is collapsed. Persisted in localStorage (best-effort; never throws the panel).
const storageKey = computed(() =>
    props.instructionsKey == null ? null : `annotate:instr-open:${props.instructionsKey}`,
)
const readPref = (): boolean | null => {
    if (!storageKey.value) return null
    try {
        const raw = localStorage.getItem(storageKey.value)
        return raw === null ? null : raw === '1'
    } catch {
        return null
    }
}
const instructionsOpen = ref(true)
const applyOpenDefault = () => {
    const pref = readPref()
    instructionsOpen.value = pref ?? props.imageIndex === 0
}
const toggleInstructions = () => {
    instructionsOpen.value = !instructionsOpen.value
    if (!storageKey.value) return
    try {
        localStorage.setItem(storageKey.value, instructionsOpen.value ? '1' : '0')
    } catch {
        /* private mode / blocked storage: the toggle still works this session */
    }
}
onMounted(applyOpenDefault)
watch(() => props.imageIndex, applyOpenDefault)

const shapeColor = (s: Shape) => colorForShape(props.palette, s) ?? 'var(--color-an-n-250)'
// No node count: "N pts" beside a label read as a graded score to students. Shape kind is enough.
const shapeMeta = (s: Shape) => (s.polygon ? 'polygon' : 'rectangle')
</script>

<template>
    <!-- `touch-action: pan-x pan-y` on the panel itself, not only on the shell aside or the sheet
         that hosts it: iOS Safari honours it on the touched element far more reliably than on an
         ancestor, so the docked sidebar (landscape) and the drawer (portrait) both need it here to
         stop a stray pinch or double-tap zooming the whole page. Scrolling the panel still works. -->
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:[touch-action:pan-x_pan-y]">
        <!-- instructions: a collapsible card that never pushes the class list below the fold. Open on
             the first image, then collapsed by default and remembered per assignment. Collapsed shows
             one clamped line; expanded scrolls internally past 160px. -->
        <div v-if="showBrief" class="tw:shrink-0 tw:p-3 tw:pb-0">
            <div class="tw:rounded-lg tw:bg-an-n-50 tw:p-3">
                <button
                    type="button"
                    class="tw:flex tw:w-full tw:items-center tw:gap-2 tw:text-left"
                    :aria-expanded="instructionsOpen"
                    @click="toggleInstructions"
                >
                    <span
                        class="tw:text-[11.5px] tw:font-semibold tw:tracking-[-0.1px] tw:text-an-text"
                    >
                        Instructions
                    </span>
                    <div class="tw:flex-1"></div>
                    <ChevronDown
                        class="tw:size-4 tw:text-an-faint tw:transition-transform"
                        :class="instructionsOpen ? '' : 'tw:-rotate-90'"
                    />
                </button>
                <p
                    class="tw:mt-1.5 tw:text-[12.5px] tw:text-an-n-600"
                    :class="
                        instructionsOpen
                            ? 'tw:max-h-40 tw:overflow-y-auto tw:whitespace-pre-line'
                            : 'tw:truncate'
                    "
                >
                    {{ instructions || 'Box every finding and label it.' }}
                </p>
            </div>
        </div>

        <!-- per-image fill-in form (field_prompts) -->
        <div
            v-if="showBrief && responses && fieldPrompts.length > 0"
            class="tw:shrink-0 tw:border-t tw:border-an-border tw:bg-an-panel tw:px-4 tw:py-3"
        >
            <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-4">
                <div
                    v-for="prompt in fieldPrompts"
                    :key="prompt.key"
                    class="tw:flex tw:min-w-[240px] tw:flex-1 tw:items-center tw:gap-2"
                >
                    <label class="tw:shrink-0 tw:text-[13px] tw:font-medium tw:text-an-text">
                        {{ prompt.label }}
                        <span v-if="prompt.required" class="tw:text-danger">*</span>
                    </label>
                    <textarea
                        v-if="prompt.type === 'textarea'"
                        rows="1"
                        :value="responses[prompt.key]"
                        class="tw:flex-1 tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:py-1.5 tw:text-sm tw:outline-none tw:focus:border-an-accent"
                        @input="
                            emit(
                                'update-response',
                                prompt.key,
                                ($event.target as HTMLTextAreaElement).value,
                            )
                        "
                    />
                    <input
                        v-else
                        :type="prompt.type === 'number' ? 'number' : 'text'"
                        :value="responses[prompt.key]"
                        class="tw:h-9 tw:flex-1 tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:text-sm tw:outline-none tw:focus:border-an-accent"
                        @input="
                            emit(
                                'update-response',
                                prompt.key,
                                ($event.target as HTMLInputElement).value,
                            )
                        "
                    />
                </div>
            </div>
        </div>

        <!-- `pan-y` on the scroll body, the element a finger lands on, since iOS lets a descendant
             zoom even when the panel root forbids it; it still scrolls, it just cannot zoom. -->
        <div
            class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-y-auto tw:[touch-action:pan-y]"
        >
            <!-- the class picker docks here on a wide screen; on a tablet the bottom ClassStrip
                 fills this role and the slot is left empty. -->
            <slot name="classes" />

            <div class="tw:mx-3 tw:h-px tw:shrink-0 tw:bg-an-divider" />

            <!-- shapes on this image -->
            <section class="tw:flex tw:flex-col tw:gap-1 tw:p-3">
                <div class="tw:mb-1 tw:flex tw:items-center tw:gap-2">
                    <span class="tw:text-[11.5px] tw:font-semibold tw:text-an-text">
                        Your labels
                    </span>
                    <span class="tw:font-mono tw:text-[10px] tw:text-an-faint">
                        {{ shapes.length }}
                    </span>
                </div>

                <div
                    v-for="s in shapes"
                    :key="s.id"
                    class="tw:flex tw:h-[42px] tw:cursor-pointer tw:items-center tw:gap-[9px] tw:rounded-[8px] tw:px-2"
                    :class="[
                        s.id === selectedId
                            ? 'tw:bg-an-n-50 tw:ring-1 tw:ring-inset tw:ring-an-accent/40'
                            : 'tw:hover:bg-an-n-50',
                        hiddenIds.has(s.id) ? 'tw:opacity-45' : '',
                    ]"
                    @click="emit('select-shape', s.id)"
                >
                    <span
                        class="tw:h-6 tw:w-[3px] tw:shrink-0 tw:rounded-[2px]"
                        :style="{ background: shapeColor(s) }"
                    />
                    <component
                        :is="s.polygon ? Pentagon : Square"
                        class="tw:size-[15px] tw:shrink-0 tw:text-an-n-500"
                    />
                    <span class="tw:min-w-0 tw:flex-1">
                        <!-- Single click on the label relabels this box in place (free vocab only);
                             the input's own events are stopped so typing does not select the row. When
                             the vocab is locked the click falls through to select the row instead. -->
                        <input
                            v-if="editingShapeId === s.id"
                            ref="shapeInputEl"
                            v-model="shapeDraft"
                            class="tw:block tw:w-full tw:min-w-0 tw:bg-transparent tw:text-[13px] tw:text-an-text tw:outline-none"
                            @click.stop
                            @mousedown.stop
                            @keydown.enter.prevent.stop="commitShapeEdit(s)"
                            @keydown.esc.prevent.stop="cancelShapeEdit"
                            @blur="commitShapeEdit(s)"
                        />
                        <span
                            v-else
                            class="tw:block tw:truncate tw:text-[13px]"
                            :class="s.label ? 'tw:text-an-text' : 'tw:text-an-n-300 tw:italic'"
                            :title="lockLabels ? undefined : 'Click to relabel'"
                            @click="onLabelClick(s, $event)"
                        >
                            {{ s.label || 'Unlabelled' }}
                        </span>
                        <span class="tw:block tw:font-mono tw:text-[10px] tw:text-an-faint">
                            {{ shapeMeta(s) }}
                        </span>
                    </span>
                    <button
                        class="tw:flex tw:size-6 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-400 tw:hover:bg-danger/10 tw:hover:text-danger"
                        aria-label="Delete"
                        @click.stop="emit('delete-shape', s.id)"
                    >
                        <Trash2 class="tw:size-[15px]" />
                    </button>
                </div>

                <!-- Anchored to the TOP of the region (not vertically centred), so it reads as the
                     start of a list waiting to be filled rather than an empty state that ate the panel. -->
                <div
                    v-if="!shapes.length"
                    class="tw:flex tw:flex-col tw:items-center tw:gap-1 tw:px-4 tw:pt-12 tw:text-center"
                >
                    <Shapes class="tw:size-6 tw:text-an-n-300" />
                    <span class="tw:text-[12px] tw:font-medium tw:text-an-n-500">
                        Nothing labelled yet
                    </span>
                    <span class="tw:text-[11px] tw:text-an-faint">
                        Pick a class, then drag a box on the image.
                    </span>
                </div>
            </section>
        </div>

        <div
            v-if="showBrief"
            class="tw:shrink-0 tw:border-t tw:border-an-divider tw:bg-an-chrome tw:p-3"
        >
            <!-- The single Skip control on the screen (the header has none). Mark done takes the row
                 at full width with its `M` keycap; Skip sits beside it at natural width. Done reads as
                 outline once the image is already marked complete. -->
            <div class="tw:flex tw:gap-2">
                <McButton
                    class="tw:flex-1"
                    :variant="status === 'completed' ? 'outline' : 'default'"
                    @click="emit('mark-done')"
                >
                    <Check class="tw:mr-1 tw:size-4" />
                    {{ status === 'completed' ? 'Done' : 'Mark done' }}
                    <kbd
                        class="tw:ml-1.5 tw:rounded tw:border tw:border-white/25 tw:px-1 tw:py-px tw:font-mono tw:text-[9.5px] tw:leading-none"
                        :class="status === 'completed' ? 'tw:border-an-n-200 tw:text-an-muted' : ''"
                    >
                        M
                    </kbd>
                </McButton>
                <McButton
                    v-if="allowSkip && status !== 'completed'"
                    variant="outline"
                    :disabled="!allowSkip"
                    @click="emit('skip')"
                >
                    <SkipForward class="tw:mr-1 tw:size-4" />
                    Skip
                </McButton>
            </div>
        </div>
    </div>
</template>
