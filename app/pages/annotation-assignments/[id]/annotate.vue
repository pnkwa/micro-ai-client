<script setup lang="ts">
import { toast } from 'vue-sonner'
import { watchDebounced } from '@vueuse/core'
import { ArrowLeft, Check, Pentagon, Send, SkipForward, Square, Trash2, Undo2 } from '@lucide/vue'
import {
    annotationAssignmentService,
    type AnnotationAssignment,
    type AnnotationFieldStatus,
    type AnnotationSubmission,
    type SubmitFieldInput,
} from '~/services/annotationAssignmentService'
import { localId } from '~/core/helpers/localId'
import type { AnnotationLabel } from '~/services/annotationLabelService'
import { imageService } from '~/services/imageService'
import { isDegenerate, shouldCommit, type Shape } from '~/core/helpers/annotationShapes'
import {
    buildClasses,
    classColorAt,
    colorForShape,
    labelByName,
    toColorHex,
} from '~/core/helpers/annotationClasses'
import { extraClassesFromPalette, mergeDraftIntoFields } from '~/core/helpers/annotationDraft'
import { useAnnotationDraft } from '~/core/composables/useAnnotationDraft'
import { zoomPercent } from '~/core/helpers/viewportTransform'
import AnnotationCanvas, {
    type Tool,
} from '~/features/components/annotator/canvas/AnnotationCanvas.vue'
import ToolDock from '~/features/components/annotator/canvas/ToolDock.vue'
import PagerPill from '~/features/components/annotator/canvas/PagerPill.vue'
import HintBar from '~/features/components/annotator/canvas/HintBar.vue'
import ZoomPill from '~/features/components/shared/ZoomPill.vue'
import ClassPicker from '~/features/components/annotator/labels/ClassPicker.vue'

const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)

// Full-bleed, like /image-annotator: drop the app container's padding and the app bar so the
// picture owns the viewport. Both are removed on the way out.
const APP_FILL = 'mc-app-fill'
const HIDE_BAR = 'mc-hide-app-bar'
onMounted(() => document.documentElement.classList.add(APP_FILL, HIDE_BAR))
onBeforeUnmount(() => {
    document.documentElement.classList.remove(APP_FILL, HIDE_BAR)
    for (const f of fields.value) {
        if (f.url) URL.revokeObjectURL(f.url)
        if (f.thumb) URL.revokeObjectURL(f.thumb)
    }
})

// Per-image working state, held locally and submitted all at once (BE-ADR-039 v1). Nothing is saved
// to the server until Submit.
interface FieldState {
    imageId: number
    shapes: Shape[]
    responses: Record<string, string>
    status: AnnotationFieldStatus
    url: string | null
    thumb: string | null
}

const assignment = ref<AnnotationAssignment | null>(null)
const fields = ref<FieldState[]>([])
const currentIndex = ref(0)
const loading = ref(true)
const submitting = ref(false)
// Set when the workspace was opened on a RETURNED submission: shows the instructor's reason and
// signals "you are editing to resubmit".
const returnedReason = ref<string | null>(null)

// Local, per-student draft so a refresh or an accidental tab close keeps the work (nothing reaches
// the server until Submit). Restored in onMounted, autosaved on change, cleared on submit.
const draft = useAnnotationDraft(id)

// The fixed vocabulary, as a synthetic palette so the shared AnnotationCanvas / ClassPicker resolve
// colours by labelId exactly as they do for a staff annotator (BE-ADR-038 shape).
const palette = ref<AnnotationLabel[]>([])

const config = computed(() => assignment.value?.annotation ?? null)
// A fixed vocabulary the instructor authored: students pick from it only — no new classes, no
// recolouring, and colours follow the label_set.
const fixedLabelSet = computed(() => (config.value?.label_set.length ?? 0) > 0)
const current = computed<FieldState | null>(() => fields.value[currentIndex.value] ?? null)
const currentName = computed(() => `Image ${String(currentIndex.value + 1).padStart(2, '0')}`)

const tool = ref<Tool>('rectangle')
const selectedId = ref<string | null>(null)
const activeLabelId = ref<number | null>(null)
const hiddenIds = ref<Set<string>>(new Set())

// Which shape ids existed when the current image was opened, so auto-labelling (below) only touches
// shapes drawn from here on — a label cleared later stays cleared, and restored work is untouched.
let knownShapeIds = new Set<string>()
// Monotonic id source for student-added classes. Never reuses an id even after a class is pruned, so
// `palette.length + 1` can't collide with a surviving row.
let labelSeq = 0

const currentShapes = computed<Shape[]>({
    get: () => current.value?.shapes ?? [],
    set: (value) => {
        if (current.value) current.value.shapes = value
    },
})

const classes = computed(() => buildClasses(palette.value, currentShapes.value))

// ---- canvas view state (zoom / fit / visibility), read off the shared canvas' exposed API ----
const canvas = useTemplateRef<InstanceType<typeof AnnotationCanvas>>('canvas')
const zoomPct = computed(() =>
    canvas.value?.transform ? zoomPercent(canvas.value.transform) : 100,
)
const atFit = computed(() => Boolean(canvas.value?.atFit))
const canZoom = computed(() => Boolean(canvas.value?.ready))

// ---- per-image undo/redo history ----
// currentShapes swaps per image (unlike the single-image staff annotator), so each image keeps its
// own stack, stashed here across switches and keyed by imageId. History is in-memory only — a
// refresh keeps the work (the draft) but starts undo fresh.
const historyStore = new Map<number, { stack: Shape[][]; index: number }>()
const history = ref<Shape[][]>([[]])
const historyIndex = ref(0)

const snapshotShapes = (value: Shape[]): Shape[] =>
    value.map((s) => ({ ...s, polygon: s.polygon?.map((p) => ({ ...p })) ?? null }))

const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)
// A polygon still being drawn lives in the canvas, not the history, so undo must reach it first.
const canUndoAny = computed(() => Boolean(canvas.value?.hasDraft) || canUndo.value)

// Push a snapshot when a gesture ended with a real change (shouldCommit drops no-ops like a click
// that only selected). Editing after an undo forks, so the redo branch ahead is dropped.
function commit() {
    if (!shouldCommit(history.value[historyIndex.value], currentShapes.value)) return
    history.value = [
        ...history.value.slice(0, historyIndex.value + 1),
        snapshotShapes(currentShapes.value),
    ]
    historyIndex.value = history.value.length - 1
}

function restore(index: number) {
    historyIndex.value = index
    const previous = selectedId.value
    currentShapes.value = snapshotShapes(history.value[index]!)
    selectedId.value = currentShapes.value.some((s) => s.id === previous) ? previous : null
}

function undo() {
    if (canUndo.value) restore(historyIndex.value - 1)
}
function redo() {
    if (canRedo.value) restore(historyIndex.value + 1)
}
// Undo the in-progress polygon point first, else step the committed history.
function undoStep() {
    if (canvas.value?.hasDraft) canvas.value.undoDraftPoint()
    else undo()
}

// Reattach the history for the image now showing, stashing the one being left. Starts a fresh
// single-entry stack the first time an image is opened.
function loadHistoryForCurrent(previousImageId?: number) {
    if (previousImageId != null)
        historyStore.set(previousImageId, { stack: history.value, index: historyIndex.value })
    const saved = current.value ? historyStore.get(current.value.imageId) : undefined
    if (saved) {
        history.value = saved.stack
        historyIndex.value = saved.index
    } else {
        history.value = [snapshotShapes(currentShapes.value)]
        historyIndex.value = 0
    }
}

const allHidden = computed(
    () => currentShapes.value.length > 0 && hiddenIds.value.size === currentShapes.value.length,
)
function toggleAllHidden() {
    hiddenIds.value = allHidden.value ? new Set() : new Set(currentShapes.value.map((s) => s.id))
}

// Load a prior submission's work into the fresh skeleton (matched by imageId): boxes become editable
// shapes with their class resolved, answers and per-image status come back. Used for resubmitting a
// returned submission.
function prefillFromSubmission(sub: AnnotationSubmission) {
    const byId = new Map(sub.fields.map((f) => [f.image_id, f]))
    for (const field of fields.value) {
        const src = byId.get(field.imageId)
        if (!src) continue
        field.status = src.status
        field.responses = Object.fromEntries(
            Object.entries(src.responses ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)]),
        )
        field.shapes = src.annotations.map((box) => ({
            id: localId('shape'),
            labelId: (box.label ? labelByName(palette.value, box.label) : null)?.id ?? null,
            label: box.label ?? '',
            x: box.x,
            y: box.y,
            w: box.w,
            h: box.h,
            polygon: box.polygon ? box.polygon.map(([x, y]) => ({ x: x ?? 0, y: y ?? 0 })) : null,
            expert_curated: false,
        }))
    }
}

onMounted(async () => {
    try {
        const a = await annotationAssignmentService.getById(id)
        assignment.value = a
        palette.value = a.annotation.label_set.map((c, i) => ({
            id: i + 1,
            label: c.label,
            color_hex: c.color,
            owner_id: null,
            created_at: '',
            updated_at: '',
        }))
        activeLabelId.value = palette.value[0]?.id ?? null
        fields.value = a.images.map((img) => ({
            imageId: img.image_id,
            shapes: [],
            responses: {},
            status: 'pending' as AnnotationFieldStatus,
            url: null,
            thumb: null,
        }))
        // A prior submission locks the workspace: only a RETURNED (rejected) one reopens for editing
        // and resubmission. A submission still awaiting review, or already graded, stays read-only —
        // so a refresh can't reopen it — and the student is sent to the read-only feedback page.
        const mine = await annotationAssignmentService.getMySubmission(id).catch(() => null)
        if (mine) {
            if (mine.status !== 'rejected') {
                await router.replace(`/annotation-assignments/submissions/${mine.id}`)
                return
            }
            prefillFromSubmission(mine)
            returnedReason.value = mine.rejection_reason
            toast.info('This submission was returned — edit it and resubmit')
        }
        // Fold a saved draft over the prior work (matched by imageId), then re-add the student's own
        // classes and resume on the image they left off.
        const saved = draft.load()
        if (saved) {
            const applied = mergeDraftIntoFields(fields.value, saved)
            for (const c of saved.extraClasses) {
                if (palette.value.some((p) => p.id === c.id)) continue
                palette.value.push({
                    id: c.id,
                    label: c.label,
                    color_hex: c.color_hex,
                    owner_id: null,
                    created_at: '',
                    updated_at: '',
                })
            }
            if (saved.currentIndex >= 0 && saved.currentIndex < fields.value.length) {
                currentIndex.value = saved.currentIndex
            }
            if (applied) toast.info('Draft restored')
        }
        await loadImage(currentIndex.value)
        void loadThumbs()

        // Only shapes drawn from now on get auto-labelled; everything restored is already known.
        seedKnownShapes()
        loadHistoryForCurrent() // seed undo history from the (possibly restored) first image
        labelSeq = palette.value.reduce((max, l) => Math.max(max, l.id), 0)
        pruneUnusedClasses() // clear any orphan classes carried in from a restored draft

        // New shapes inherit the highlighted class; unused student classes are garbage-collected.
        watch(currentShapes, labelNewShapes, { deep: true })
        watch([fields, activeLabelId], pruneUnusedClasses, { deep: true })

        // Autosave from here on — the load above is done, so the first fire persists real edits, not
        // the skeleton. Deep because the student mutates fields/shapes/responses in place; url/thumb
        // churn from lazy image loads also trips it but is filtered out of what gets written.
        watchDebounced(
            [fields, currentIndex, palette],
            () =>
                draft.save({
                    currentIndex: currentIndex.value,
                    fields: fields.value.map((f) => ({
                        imageId: f.imageId,
                        shapes: f.shapes,
                        responses: f.responses,
                        status: f.status,
                    })),
                    extraClasses: extraClassesFromPalette(
                        palette.value,
                        config.value?.label_set.length ?? 0,
                    ),
                }),
            { deep: true, debounce: 600, maxWait: 3000 },
        )
    } catch {
        toast.error('Could not load this assignment')
    } finally {
        loading.value = false
    }
})

async function loadImage(index: number) {
    const field = fields.value[index]
    if (!field || field.url) return
    try {
        field.url = await imageService.blobUrl(field.imageId)
    } catch {
        toast.error('Could not load an image')
    }
}

async function loadThumbs() {
    await Promise.all(
        fields.value.map(async (f) => {
            try {
                f.thumb = await imageService.blobUrl(f.imageId, 'thumb')
            } catch {
                /* the row falls back to a blank dark tile */
            }
        }),
    )
}

async function goTo(index: number) {
    if (index < 0 || index >= fields.value.length) return
    const previousImageId = current.value?.imageId
    selectedId.value = null
    hiddenIds.value = new Set()
    currentIndex.value = index
    seedKnownShapes()
    loadHistoryForCurrent(previousImageId)
    await loadImage(index)
}

// ---- labelling ----
function pickClass(labelId: number) {
    const klass = palette.value.find((l) => l.id === labelId)
    if (!klass) return
    if (selectedId.value) {
        const shape = currentShapes.value.find((s) => s.id === selectedId.value)
        if (shape) {
            shape.labelId = klass.id
            shape.label = klass.label
            commit()
        }
    } else {
        // Click the highlighted class again to switch it off — new shapes then stay unlabelled.
        activeLabelId.value = activeLabelId.value === labelId ? null : labelId
    }
}

// A class typed straight onto a shape's chip. Match it to the palette if it's a known class;
// otherwise create the class on the spot so it gets a colour and joins the list (rather than
// lingering as a colourless free-text label the student can't recolour or pick again).
function labelShape(shapeId: string, name: string) {
    const shape = currentShapes.value.find((s) => s.id === shapeId)
    if (!shape) return
    shape.label = name
    const trimmed = name.trim()
    if (!trimmed) {
        shape.labelId = null
    } else {
        const known = labelByName(palette.value, trimmed)
        // A fixed vocabulary never grows: an unknown label stays free text (and the server rejects
        // it at submit), rather than minting an off-list class.
        shape.labelId = known ? known.id : fixedLabelSet.value ? null : addClass(trimmed)
    }
    commit()
}

function deleteSelected() {
    if (!selectedId.value) return
    deleteShape(selectedId.value)
}

// Remove one shape from the current image — the per-row delete button in the labels list.
function deleteShape(sid: string) {
    currentShapes.value = currentShapes.value.filter((s) => s.id !== sid)
    if (selectedId.value === sid) selectedId.value = null
    if (hiddenIds.value.has(sid)) {
        const next = new Set(hiddenIds.value)
        next.delete(sid)
        hiddenIds.value = next
    }
    commit()
}

// Reset the "already seen" set to the shapes the current image opens with, so auto-labelling only
// touches shapes drawn from here on.
function seedKnownShapes() {
    knownShapeIds = new Set(currentShapes.value.map((s) => s.id))
}

// Give any newly drawn shape the highlighted class. The shared canvas leaves new shapes unlabelled
// (the staff flow names-after-draw); students here want pick-then-draw. Shapes already seen, and
// ones left deliberately unlabelled (no active class), are untouched.
function labelNewShapes() {
    for (const shape of currentShapes.value) {
        if (knownShapeIds.has(shape.id)) continue
        knownShapeIds.add(shape.id)
        if (activeLabelId.value == null || shape.labelId != null || shape.label) continue
        const klass = palette.value.find((l) => l.id === activeLabelId.value)
        if (klass) {
            shape.labelId = klass.id
            shape.label = klass.label
        }
    }
}

// Label ids a shape uses on ANY image — a class belongs in the list while it is used somewhere.
function usedLabelIdsEverywhere(): Set<number> {
    const used = new Set<number>()
    for (const f of fields.value)
        for (const s of f.shapes) if (s.labelId != null) used.add(s.labelId)
    return used
}

// Drop student-added classes no shape uses anywhere, keeping the one highlighted for drawing. The
// instructor's fixed vocabulary — the first `label_set` rows — always stays, so students can still
// pick the classes they are meant to use.
function pruneUnusedClasses() {
    const baseCount = config.value?.label_set.length ?? 0
    if (palette.value.length <= baseCount) return
    const used = usedLabelIdsEverywhere()
    const kept = palette.value.filter(
        (l, i) => i < baseCount || used.has(l.id) || l.id === activeLabelId.value,
    )
    if (kept.length !== palette.value.length) palette.value = kept
}

// Add a palette row and return its id. Colour defaults to the next along the cycle so consecutive
// classes don't arrive the same shade; the wire stores it bare (no '#').
function addClass(name: string, colorHex?: string): number {
    const id = ++labelSeq
    palette.value.push({
        id,
        label: name,
        color_hex: colorHex ?? toColorHex(classColorAt(palette.value.length)),
        owner_id: null,
        created_at: '',
        updated_at: '',
    })
    return id
}

// Explicit "New class" from the picker: create it and make it the active class for new shapes.
function createClass(name: string, colorHex?: string) {
    activeLabelId.value = addClass(name, colorHex)
}

// Clicking a class swatch recolours it. The native colour input hands back '#rrggbb'; store it bare.
function recolorClass(labelId: number, color: string) {
    const klass = palette.value.find((l) => l.id === labelId)
    if (klass) klass.color_hex = toColorHex(color)
}

const shapeColor = (s: Shape) => colorForShape(palette.value, s) ?? 'var(--color-an-n-250)'
const shapeMeta = (s: Shape) => (s.polygon ? `polygon · ${s.polygon.length} pts` : 'rectangle')

// ---- per-image status ----
const requiredPrompts = computed(() =>
    (config.value?.field_prompts ?? []).filter((p) => p.required),
)

function missingRequired(field: FieldState): string | null {
    for (const prompt of requiredPrompts.value) {
        const value = field.responses[prompt.key]
        if (!value || !value.trim()) return prompt.label
    }
    return null
}

function markDone() {
    if (!current.value) return
    // Toggle: clicking a completed image again reverts it to pending (the button reads "Mark done"
    // and turns solid), and stays put rather than advancing.
    if (current.value.status === 'completed') {
        current.value.status = 'pending'
        return
    }
    const missing = missingRequired(current.value)
    if (missing) return toast.error(`"${missing}" is required`)
    current.value.status = 'completed'
    if (currentIndex.value < fields.value.length - 1) void goTo(currentIndex.value + 1)
}

function skip() {
    if (!current.value) return
    if (!config.value?.allow_skip) return toast.error('Skipping is not allowed')
    current.value.status = 'skipped'
    if (currentIndex.value < fields.value.length - 1) void goTo(currentIndex.value + 1)
}

// ---- progress + submit ----
const doneCount = computed(() => fields.value.filter((f) => f.status === 'completed').length)
const skippedCount = computed(() => fields.value.filter((f) => f.status === 'skipped').length)
const addressed = computed(() => doneCount.value + skippedCount.value)
const required = computed(() => config.value?.required_count ?? fields.value.length)
const canSubmit = computed(() => addressed.value >= required.value)

async function submit() {
    if (!canSubmit.value || submitting.value) return
    submitting.value = true
    try {
        const payload: SubmitFieldInput[] = fields.value
            .filter((f) => f.status !== 'pending')
            .map((f) => ({
                imageId: f.imageId,
                status: f.status,
                responses: f.responses,
                annotations: f.shapes
                    .filter((s) => !isDegenerate(s))
                    .map((s) => ({
                        label: s.label || null,
                        x: s.x,
                        y: s.y,
                        w: s.w,
                        h: s.h,
                        ...(s.polygon ? { polygon: s.polygon.map((p) => [p.x, p.y]) } : {}),
                    })),
            }))
        const submission = await annotationAssignmentService.submit(id, payload)
        draft.clear() // the work is on the server now; leave no stale draft behind
        toast.success('Submitted')
        await router.push(`/annotation-assignments/submissions/${submission.id}`)
    } catch {
        toast.error('Could not submit — check the highlighted fields')
    } finally {
        submitting.value = false
    }
}

const percent = computed(() =>
    fields.value.length ? Math.round((addressed.value / fields.value.length) * 100) : 0,
)

const statusText = (field: FieldState) =>
    field.status === 'completed'
        ? 'done'
        : field.status === 'skipped'
          ? 'skipped'
          : field.shapes.length > 0
            ? `${field.shapes.length} box${field.shapes.length === 1 ? '' : 'es'}`
            : 'to do'

// The class-colour squares on a row, mirroring QueueRow (up to four distinct colours).
const fieldDots = (field: FieldState) =>
    [
        ...new Set(
            field.shapes
                .map((s) => colorForShape(palette.value, s))
                .filter((c): c is string => Boolean(c)),
        ),
    ].slice(0, 4)

// The trailing count badge (QueueRow shape): the box count, coloured by status. Hidden at zero.
const fieldBadge = (field: FieldState) =>
    field.shapes.length > 0 ? String(field.shapes.length) : null

const fieldBadgeClass = (field: FieldState) =>
    field.status === 'completed'
        ? 'tw:bg-an-accent-tint tw:text-an-accent-hover'
        : field.status === 'skipped'
          ? 'tw:bg-an-warn-tint tw:text-an-warn'
          : 'tw:bg-an-n-100 tw:text-an-n-600'

const metaClass = (field: FieldState) =>
    field.status === 'pending' && field.shapes.length === 0
        ? 'tw:text-an-n-300'
        : 'tw:text-an-n-500'
</script>

<template>
    <div class="tw:flex tw:h-dvh tw:flex-col tw:overflow-hidden tw:bg-an-chrome">
        <!-- header -->
        <header
            class="tw:flex tw:h-12 tw:shrink-0 tw:items-center tw:gap-2 tw:border-b tw:border-an-border tw:bg-an-panel tw:px-2"
        >
            <McButton variant="ghost" size="icon-sm" aria-label="Back" @click="router.back()">
                <ArrowLeft class="tw:size-4" />
            </McButton>
            <span class="tw:min-w-0 tw:truncate tw:text-sm tw:font-medium tw:text-an-text">
                {{ assignment?.name ?? 'Annotate' }}
            </span>
            <span
                class="tw:shrink-0 tw:rounded-[5px] tw:border tw:border-an-n-150 tw:bg-an-n-50 tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-faint"
            >
                {{ fields.length }} images
            </span>
            <div class="tw:flex-1" />

            <McButton v-if="config?.allow_skip" variant="outline" size="sm" @click="skip">
                <SkipForward class="tw:mr-1 tw:size-4" />
                Skip image
            </McButton>
            <McButton
                size="sm"
                :disabled="!canSubmit || submitting"
                :loading="submitting"
                @click="submit"
            >
                <Send class="tw:mr-1 tw:size-4" />
                {{
                    canSubmit
                        ? returnedReason !== null
                            ? 'Resubmit'
                            : 'Submit'
                        : `Submit · ${Math.max(required - addressed, 0)} left`
                }}
            </McButton>
        </header>

        <!-- returned-for-changes banner -->
        <div
            v-if="returnedReason !== null"
            class="tw:flex tw:shrink-0 tw:items-start tw:gap-2 tw:border-b tw:border-warning/30 tw:bg-warning/10 tw:px-3 tw:py-2 tw:text-[12.5px] tw:text-an-text"
        >
            <Undo2 class="tw:mt-0.5 tw:size-4 tw:shrink-0 tw:text-warning" />
            <span>
                <b>Returned for changes.</b>
                <template v-if="returnedReason">{{ returnedReason }}</template>
                <template v-else>Edit your work and resubmit.</template>
            </span>
        </div>

        <div
            v-if="loading"
            class="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:text-an-muted"
        >
            Loading…
        </div>

        <div v-else class="tw:flex tw:min-h-0 tw:flex-1">
            <!-- queue -->
            <aside
                class="tw:flex tw:w-[280px] tw:shrink-0 tw:flex-col tw:border-r tw:border-an-border tw:bg-an-panel"
            >
                <!-- progress (ImageQueue style) -->
                <div class="tw:shrink-0 tw:px-3 tw:pt-3 tw:pb-3">
                    <div class="tw:mb-1.5 tw:flex tw:items-baseline tw:gap-1.5">
                        <div class="tw:flex tw:flex-col">
                            <div>
                                <span
                                    class="tw:font-mono tw:text-[11px] tw:font-semibold tw:tabular-nums tw:text-an-text"
                                >
                                    {{ doneCount }} / {{ fields.length }}
                                </span>
                                <span class="tw:text-[11px] tw:text-an-faint tw:px-1">done</span>
                            </div>

                            <div>
                                <span
                                    class="tw:text-an-warn tw:font-mono tw:text-[11px] tw:font-semibold tw:tabular-nums tw:text-an-text"
                                >
                                    {{ skippedCount }}
                                </span>
                                <span class="tw:text-[11px] tw:text-an-faint tw:px-1">skipped</span>
                            </div>
                        </div>
                        <div class="tw:flex-1"></div>
                        <span class="tw:font-mono tw:tabular-nums tw:text-an-faint">
                            {{ percent }}%
                        </span>
                    </div>
                    <div class="tw:h-1 tw:overflow-hidden tw:rounded-full tw:bg-an-n-150">
                        <div
                            class="tw:h-full tw:rounded-full tw:bg-an-accent tw:transition-[width]"
                            :style="{ width: `${percent}%` }"
                        ></div>
                    </div>
                </div>

                <div class="tw:h-px tw:shrink-0 tw:bg-an-divider"></div>

                <ul
                    class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-px tw:overflow-y-auto tw:p-1.5"
                >
                    <li v-for="(field, i) in fields" :key="field.imageId">
                        <button
                            type="button"
                            class="tw:flex tw:h-14 tw:w-full tw:items-center tw:gap-2.5 tw:rounded-lg tw:py-0 tw:pr-2 tw:pl-[7px] tw:text-left tw:transition-colors"
                            :class="
                                i === currentIndex
                                    ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-an-accent'
                                    : 'tw:hover:bg-an-n-50'
                            "
                            @click="goTo(i)"
                        >
                            <span
                                class="tw:h-[42px] tw:w-[42px] tw:shrink-0 tw:overflow-hidden tw:rounded-md tw:bg-an-canvas"
                            >
                                <img
                                    v-if="field.thumb"
                                    :src="field.thumb"
                                    class="tw:h-full tw:w-full tw:object-cover"
                                    alt=""
                                />
                                <McSkeleton v-else class="tw:h-full tw:w-full tw:rounded-none" />
                            </span>

                            <span class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-[3px]">
                                <span
                                    class="tw:truncate tw:font-mono tw:text-[11.5px] tw:font-medium tw:text-an-n-700"
                                >
                                    Image {{ String(i + 1).padStart(2, '0') }}
                                </span>
                                <span class="tw:flex tw:items-center tw:gap-1.5">
                                    <span
                                        v-for="(dot, di) in fieldDots(field)"
                                        :key="di"
                                        class="tw:h-1.5 tw:w-1.5 tw:shrink-0 tw:rounded-[2px]"
                                        :style="{ background: dot }"
                                    ></span>
                                    <span
                                        class="tw:truncate tw:text-[10.5px]"
                                        :class="metaClass(field)"
                                    >
                                        {{ statusText(field) }}
                                    </span>
                                </span>
                            </span>

                            <span
                                v-if="fieldBadge(field) !== null"
                                class="tw:flex tw:h-[19px] tw:min-w-[19px] tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[5px] tw:px-1.5 tw:font-mono tw:text-[10.5px] tw:font-semibold tw:tabular-nums"
                                :class="fieldBadgeClass(field)"
                            >
                                {{ fieldBadge(field) }}
                            </span>
                        </button>
                    </li>
                </ul>
            </aside>

            <!-- canvas -->
            <main class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
                <div class="tw:relative tw:min-h-0 tw:flex-1 tw:overflow-hidden tw:bg-an-canvas">
                    <AnnotationCanvas
                        v-if="current"
                        ref="canvas"
                        v-model:shapes="currentShapes"
                        v-model:selected-id="selectedId"
                        :src="current.url"
                        :name="currentName"
                        :tool="tool"
                        :default-curated="false"
                        :palette="palette"
                        :hidden-ids="hiddenIds"
                        @label-shape="labelShape"
                        @commit="commit"
                        @undo="undoStep"
                    />

                    <ToolDock
                        :tool="tool"
                        :can-undo="canUndoAny"
                        :can-redo="canRedo"
                        :can-delete="Boolean(selectedId)"
                        @update:tool="tool = $event"
                        @undo="undoStep"
                        @redo="redo"
                        @delete-selected="deleteSelected"
                    />

                    <PagerPill
                        :name="currentName"
                        :index="currentIndex + 1"
                        :total="fields.length"
                        @previous="goTo(currentIndex - 1)"
                        @next="goTo(currentIndex + 1)"
                    />
                    <HintBar
                        :tool="tool"
                        :selected-count="selectedId ? 1 : 0"
                        :drafting="Boolean(canvas?.hasDraft)"
                    />
                    <ZoomPill
                        :percent="zoomPct"
                        :at-fit="atFit"
                        :enabled="canZoom"
                        :all-hidden="allHidden"
                        @zoom-in="canvas?.zoomIn()"
                        @zoom-out="canvas?.zoomOut()"
                        @fit="canvas?.fit()"
                        @toggle-visibility="toggleAllHidden"
                    />
                </div>
            </main>

            <!-- labels -->
            <aside
                class="tw:flex tw:w-[320px] tw:shrink-0 tw:flex-col tw:border-l tw:border-an-border tw:bg-an-panel"
            >
                <div class="tw:flex tw:min-h-0 tw:flex-col">
                    <div class="tw:flex tw:items-center tw:gap-2 tw:pt-3 tw:pr-3 tw:pl-3.5">
                        <span
                            class="tw:text-[11.5px] tw:font-semibold tw:tracking-[-0.1px] tw:text-an-text"
                        >
                            Instruuction
                        </span>
                    </div>
                    <span class="tw:pt-3 tw:pr-3 tw:pb-2 tw:pl-3.5">
                        {{ assignment?.instructions || 'Box every finding and label it.' }}
                    </span>
                </div>
                <!-- per-image fill-in form (field_prompts) -->
                <div
                    v-if="current && (config?.field_prompts.length ?? 0) > 0"
                    class="tw:shrink-0 tw:border-t tw:border-an-border tw:bg-an-panel tw:px-4 tw:py-3"
                >
                    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-4">
                        <div
                            v-for="prompt in config?.field_prompts ?? []"
                            :key="prompt.key"
                            class="tw:flex tw:min-w-[240px] tw:flex-1 tw:items-center tw:gap-2"
                        >
                            <label
                                class="tw:shrink-0 tw:text-[13px] tw:font-medium tw:text-an-text"
                            >
                                {{ prompt.label }}
                                <span v-if="prompt.required" class="tw:text-danger">*</span>
                            </label>
                            <textarea
                                v-if="prompt.type === 'textarea'"
                                v-model="current.responses[prompt.key]"
                                rows="1"
                                class="tw:flex-1 tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:py-1.5 tw:text-sm tw:outline-none tw:focus:border-an-accent"
                            />
                            <input
                                v-else
                                v-model="current.responses[prompt.key]"
                                :type="prompt.type === 'number' ? 'number' : 'text'"
                                class="tw:h-9 tw:flex-1 tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:text-sm tw:outline-none tw:focus:border-an-accent"
                            />
                        </div>
                    </div>
                </div>
                <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-y-auto">
                    <ClassPicker
                        :classes="classes"
                        :active="activeLabelId"
                        :fixed="fixedLabelSet"
                        @pick="pickClass"
                        @create="createClass"
                        @recolor="recolorClass"
                    />

                    <div class="tw:mx-3 tw:h-px tw:shrink-0 tw:bg-an-divider" />

                    <!-- shapes on this image (ShapeRow shape) -->
                    <section class="tw:flex tw:flex-col tw:gap-1 tw:p-3">
                        <div class="tw:mb-1 tw:flex tw:items-center tw:gap-2">
                            <span class="tw:text-[11.5px] tw:font-semibold tw:text-an-text">
                                Your labels
                            </span>
                            <span class="tw:font-mono tw:text-[10px] tw:text-an-faint">
                                {{ currentShapes.length }}
                            </span>
                        </div>

                        <div
                            v-for="s in currentShapes"
                            :key="s.id"
                            class="tw:flex tw:h-[42px] tw:cursor-pointer tw:items-center tw:gap-[9px] tw:rounded-[8px] tw:px-2"
                            :class="[
                                s.id === selectedId
                                    ? 'tw:bg-an-n-50 tw:ring-1 tw:ring-inset tw:ring-an-accent/40'
                                    : 'tw:hover:bg-an-n-50',
                                hiddenIds.has(s.id) ? 'tw:opacity-45' : '',
                            ]"
                            @click="selectedId = s.id"
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
                                <span
                                    class="tw:block tw:truncate tw:text-[13px]"
                                    :class="
                                        s.label ? 'tw:text-an-text' : 'tw:text-an-n-300 tw:italic'
                                    "
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
                                @click.stop="deleteShape(s.id)"
                            >
                                <Trash2 class="tw:size-[15px]" />
                            </button>
                        </div>

                        <p
                            v-if="!currentShapes.length"
                            class="tw:px-1 tw:py-2 tw:text-[11px] tw:text-an-faint"
                        >
                            Pick a class, then drag a box on the image.
                        </p>
                    </section>
                </div>

                <div class="tw:shrink-0 tw:border-t tw:border-an-divider tw:bg-an-chrome tw:p-3">
                    <!-- Once a box is drawn, Skip stops making sense, so it goes and Done takes the
                         row. Done reads as outline once the image is already marked complete. -->
                    <div class="tw:flex tw:gap-2">
                        <McButton
                            class="tw:flex-1"
                            :variant="current?.status === 'completed' ? 'outline' : 'default'"
                            @click="markDone"
                        >
                            <Check class="tw:mr-1 tw:size-4" />
                            {{ current?.status === 'completed' ? 'Done' : 'Mark done' }}
                        </McButton>
                        <McButton
                            v-if="!currentShapes.length"
                            variant="outline"
                            class="tw:flex-1"
                            :disabled="!config?.allow_skip"
                            @click="skip"
                        >
                            <SkipForward class="tw:mr-1 tw:size-4" />
                            Skip
                        </McButton>
                    </div>
                </div>
            </aside>
        </div>
    </div>
</template>
