<script setup lang="ts">
/**
 * The one bottom sheet, three tabs — Task (read it), Label (do it), Answer (answer it).
 *
 * Replaces the four separate compact chromes the student annotator used to stack: the instructions
 * band, the tool row, the class strip and the action bar. Everything a student does to an image
 * lives here, on ONE surface. The tool row and class chips are the Label tab body, not bands of
 * their own, and the classes-and-shapes drawer the compact header used to open is gone with them:
 * it showed what the Label tab already shows, so it was a second route to one place.
 *
 * PEEK IS 228px ON EVERY TAB, and that number is the SUM OF ITS PARTS, not a round figure the parts
 * are trusted to fit inside: grabber 20 + tab row 44 + body 108 + action row 56. It was 212 against
 * a 220px stack once the grabber grew, and since the sheet is `overflow-hidden` the missing 8px came
 * off the bottom of the action row, clipping the status line under "Mark done". Change any band's
 * height and this constant and `PEEK_PX` have to move with it.
 *
 * The height is load-bearing, not cosmetic: switching tabs must never resize the canvas or re-run
 * fit, so a student who zoomed into a cell and tapped Instructions to re-read the brief comes back
 * to the exact same view. The body is a fixed 108px at peek whatever tab shows — 6px of padding, a
 * 44px row, an 8px gap, a second 44px row, 6px of padding — and only the tab's INTERNAL content
 * differs.
 *
 * The sheet lifts 16px OVER the canvas (`-mt-4`, z above it) with a top-corner radius and an upward
 * shadow, so the dark canvas shows through behind the rounded corners and the edge reads without a
 * hard border. The page subtracts that overlap from the canvas viewport (`insetBottom`) so the
 * specimen fits above the sheet rather than under it.
 */
import { Check } from '@lucide/vue'
import type { AnnotationClass } from '~/core/helpers/annotationClasses'
import type { Shape } from '~/core/helpers/annotationShapes'
import type { AnnotationLabel } from '~/services/annotationLabelService'
import type { FieldPrompt } from '~/services/annotationAssignmentService'
import type { Tool } from '~/features/components/annotator/canvas/AnnotationCanvas.vue'
import TaskTab from './tabs/TaskTab.vue'
import LabelTab from './tabs/LabelTab.vue'
import ActionRow from './ActionRow.vue'

export type WorkTab = 'task' | 'label'

const props = defineProps<{
    instructions: string | null | undefined
    fieldPrompts: FieldPrompt[]
    responses: Record<string, string> | null
    status: 'pending' | 'completed' | 'skipped' | null
    shapes: Shape[]
    classes: AnnotationClass[]
    activeLabelId: number | null
    selectedId: string | null
    hiddenIds: Set<string>
    palette: AnnotationLabel[]
    tool: Tool
    canUndo: boolean
    canRedo: boolean
    allowSkip: boolean
    /** A fixed vocabulary (`label_set` is non-empty): the Label tab's chips pick only. */
    fixed?: boolean
    /** The image is marked done: the Label tab swaps its tools for a locked notice. */
    locked?: boolean
}>()

const tab = defineModel<WorkTab>('tab', { required: true })

// Expand raises the sheet from peek to a tall state so the whole Task reads at once — the full
// brief, the requirement checklist and a primary "Start annotating" — without a student having to
// scroll a 108px slot one-handed. Tap the grabber to raise it, "Start annotating" (or the grabber
// again) to drop back to peek. Expanding is an explicit gesture, so it MAY resize the canvas; only
// a tab SWITCH must leave the canvas untouched, and the expanded height is the same on both tabs,
// so switching tabs while expanded still holds that invariant. (Drag-to-snap lands in step 3.)
const expanded = ref(false)

const emit = defineEmits<{
    'update:tool': [tool: Tool]
    undo: []
    redo: []
    'delete-selected': []
    pick: [id: number]
    'create-class': [label: string, colorHex: string]
    'edit-class': [id: number, label: string, colorHex: string]
    'select-shape': [id: string]
    'delete-shape': [id: string]
    'update-response': [key: string, value: string]
    'mark-done': []
    skip: []
    start: []
}>()

// Start annotating: drop to peek and hand off to the Label tab (the parent sets the tab).
const onStart = () => {
    expanded.value = false
    emit('start')
}

// Drag the grabber to raise or lower the sheet, so the slide grows live under the finger rather
// than only jumping on a tap. Peek and the two-thirds expanded height are the two snap points; on
// release the sheet settles to whichever is nearer. A drag that barely moves is a tap, which
// toggles. `dragHeight` is the live inline height while a drag is in flight (it overrides the
// class height and the CSS transition is off), null the rest of the time so the snapped class
// height and its transition take over.
// Must equal the peek height class below, and both must equal the sum of the bands. See the header.
const PEEK_PX = 228
const dragging = ref(false)
const dragHeight = ref<number | null>(null)
let startY = 0
let startHeight = 0
let moved = 0

// The expanded height in px, mirroring the `68dvh` / 600px cap of the expanded class.
const expandedPx = () => Math.min(window.innerHeight * 0.68, 600)

// During a drag (and while the finger crosses toward expanding) the body shows its expanded layout,
// so the checklist and Start button fill in as the sheet rises rather than popping in at the end.
const sheetExpanded = computed(() => expanded.value || dragging.value)

const onGrabDown = (e: PointerEvent) => {
    startY = e.clientY
    startHeight = expanded.value ? expandedPx() : PEEK_PX
    moved = 0
    dragging.value = true
    dragHeight.value = startHeight
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

const onGrabMove = (e: PointerEvent) => {
    if (!dragging.value) return
    const dy = startY - e.clientY // dragging up is positive
    moved = Math.max(moved, Math.abs(dy))
    dragHeight.value = Math.min(expandedPx(), Math.max(PEEK_PX, startHeight + dy))
}

const onGrabUp = (e: PointerEvent) => {
    if (!dragging.value) return
    const h = dragHeight.value ?? PEEK_PX
    dragging.value = false
    dragHeight.value = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    // A near-still press is a tap: toggle. Otherwise snap to the nearer of peek / expanded.
    if (moved < 6) expanded.value = !expanded.value
    else expanded.value = h >= (PEEK_PX + expandedPx()) / 2
}

// The first required field left blank — the sentence the Answer tab and the action row both show.
// Null once every required field is answered, which is also what fills the Diagnosis step pill.
const missingLabel = computed(() => {
    for (const p of props.fieldPrompts) {
        if (p.required && !(props.responses?.[p.key] ?? '').trim()) return p.label
    }
    return null
})
const done = computed(() => props.status === 'completed')

// Distinct class colours on this image, for the action-row squares (max four).
const dots = computed(() =>
    props.classes
        .filter((c) => c.count > 0)
        .map((c) => c.color)
        .slice(0, 4),
)

// The `task` tab is labelled "Instructions": it carries the brief and the question/answer. The id
// stays `task` so the tab state, open rules and routing don't churn on a wording change.
const TABS: { id: WorkTab; label: string }[] = [
    { id: 'task', label: 'Instructions' },
    { id: 'label', label: 'Label' },
]
</script>

<template>
    <!-- Fixed peek height. The upward shadow does the edge, so no top border; the 1px top highlight
         keeps that edge legible against the dark canvas. -->
    <section
        class="tw:relative tw:z-20 tw:-mt-4 tw:flex tw:flex-col tw:overflow-hidden tw:rounded-t-2xl tw:bg-an-panel tw:transition-[height] tw:duration-300 tw:ease-[cubic-bezier(0.32,0.72,0,1)] tw:[touch-action:pan-x_pan-y] tw:shadow-[0_-14px_30px_rgba(13,17,23,0.30),0_-1px_0_rgba(255,255,255,0.05)] tw:motion-reduce:transition-none"
        :class="[
            expanded ? 'tw:h-[68dvh] tw:max-h-[600px]' : 'tw:h-[228px]',
            dragging ? 'tw:transition-none' : '',
        ]"
        :style="dragHeight !== null ? { height: `${dragHeight}px` } : undefined"
    >
        <!-- Grabber: drag it up to raise the sheet (the slide grows live under the finger) and down
             to lower it; on release it snaps to peek or expanded. A tap toggles. `touch-action:none`
             so the vertical drag is ours, not the page's. -->
        <button
            type="button"
            class="tw:flex tw:h-5 tw:shrink-0 tw:items-center tw:justify-center tw:[touch-action:none]"
            :aria-label="expanded ? 'Collapse to peek' : 'Expand sheet'"
            :aria-expanded="expanded"
            @pointerdown="onGrabDown"
            @pointermove="onGrabMove"
            @pointerup="onGrabUp"
            @pointercancel="onGrabUp"
        >
            <span class="tw:h-[5px] tw:w-[38px] tw:rounded-[3px] tw:bg-an-n-200" />
        </button>

        <!-- Tab row: plain text on a full-width hairline, active gets --text 600 + a 2px accent
             underline. Label carries the shape count; Answer an amber dot while a required field is
             unanswered, a teal tick once answered — the label text stays neutral either way. -->
        <div class="tw:flex tw:h-11 tw:shrink-0 tw:border-b tw:border-an-divider tw:px-2">
            <button
                v-for="t in TABS"
                :key="t.id"
                type="button"
                class="tw:-mb-px tw:flex tw:h-full tw:flex-1 tw:items-center tw:justify-center tw:gap-1.5 tw:border-b-2 tw:text-[13.5px] tw:transition-colors"
                :class="
                    tab === t.id
                        ? 'tw:border-an-accent tw:font-semibold tw:text-an-text'
                        : 'tw:border-transparent tw:font-medium tw:text-an-muted'
                "
                :aria-selected="tab === t.id"
                role="tab"
                @click="tab = t.id"
            >
                {{ t.label }}
                <!-- Label carries the shape count; Task an amber dot while a required field (the
                     answer now lives on Task) is unanswered, a teal tick once every one is answered.
                     The label text stays neutral either way — the dot is the signal. -->
                <span
                    v-if="t.id === 'label' && shapes.length"
                    class="tw:font-mono tw:text-[11px] tw:font-medium"
                    :class="tab === t.id ? 'tw:text-an-muted' : 'tw:text-an-faint'"
                >
                    {{ shapes.length }}
                </span>
                <span
                    v-else-if="t.id === 'task' && fieldPrompts.length && !done && missingLabel"
                    class="tw:size-1.5 tw:rounded-full tw:bg-an-warn"
                    aria-label="unanswered required field"
                />
                <Check
                    v-else-if="t.id === 'task' && fieldPrompts.length && !missingLabel"
                    class="tw:size-3.5 tw:text-an-accent"
                />
            </button>
        </div>

        <!-- Tab body: fixed 108px at peek (same on every tab, so a tab switch never resizes the
             canvas); flex-fills when expanded so the full brief and the Start button show.
             `py-1.5` rather than a top-only pad, so the two 44px rows sit between the tab hairline
             above and the action-row hairline below with equal air instead of resting on the latter. -->
        <div
            class="tw:px-3 tw:py-1.5"
            :class="sheetExpanded ? 'tw:min-h-0 tw:flex-1' : 'tw:h-[108px] tw:shrink-0'"
        >
            <!-- The swap slides the way the underline travels: Label is the right-hand tab, so
                 arriving there enters from the right and leaving it enters from the left. With only
                 two tabs the direction is a property of the DESTINATION, not of the history, so it
                 is read straight off `tab` and stays right whoever set it (the tab row, or the
                 parent's "Start annotating"). `out-in`, so one body exists at a time and neither
                 has to leave the flow. -->
            <Transition :name="tab === 'label' ? 'mc-tab-fwd' : 'mc-tab-back'" mode="out-in">
                <TaskTab
                    v-if="tab === 'task'"
                    :instructions="instructions"
                    :field-prompts="fieldPrompts"
                    :responses="responses"
                    :shapes-count="shapes.length"
                    :has-diagnosis="!missingLabel"
                    :done="done"
                    :expanded="sheetExpanded"
                    @update-response="(k, v) => emit('update-response', k, v)"
                    @start="onStart"
                />
                <LabelTab
                    v-else
                    :expanded="sheetExpanded"
                    :tool="tool"
                    :can-undo="canUndo"
                    :can-redo="canRedo"
                    :can-delete="Boolean(selectedId)"
                    :classes="classes"
                    :active-label-id="activeLabelId"
                    :shapes="shapes"
                    :selected-id="selectedId"
                    :hidden-ids="hiddenIds"
                    :palette="palette"
                    :fixed="fixed"
                    :locked="locked"
                    @update:tool="emit('update:tool', $event)"
                    @undo="emit('undo')"
                    @redo="emit('redo')"
                    @delete-selected="emit('delete-selected')"
                    @pick="emit('pick', $event)"
                    @create-class="(label, color) => emit('create-class', label, color)"
                    @edit-class="(id, label, color) => emit('edit-class', id, label, color)"
                    @select-shape="emit('select-shape', $event)"
                    @delete-shape="emit('delete-shape', $event)"
                />
            </Transition>
        </div>

        <!-- The action row, pinned at the bottom of the sheet on every tab. -->
        <ActionRow
            class="tw:mt-auto tw:border-t tw:border-an-divider"
            :label-count="shapes.length"
            :dots="dots"
            :status="status"
            :allow-skip="allowSkip"
            :missing-label="done ? null : missingLabel"
            @mark-done="emit('mark-done')"
            @skip="emit('skip')"
            @go-answer="tab = 'task'"
        />
    </section>
</template>
