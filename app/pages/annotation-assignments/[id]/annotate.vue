<script setup lang="ts">
import { toast } from 'vue-sonner'
import { watchDebounced } from '@vueuse/core'
import { ChevronLeft, Images, Menu, Send, Undo2 } from '@lucide/vue'
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
    DEFAULT_CLASS_COLOR,
    labelByName,
    toColorHex,
} from '~/core/helpers/annotationClasses'
import { extraClassesFromPalette, mergeDraftIntoFields } from '~/core/helpers/annotationDraft'
import { useAnnotationDraft } from '~/core/composables/useAnnotationDraft'
import { zoomPercent } from '~/core/helpers/viewportTransform'
import AnnotationCanvas, {
    type Tool,
} from '~/features/components/annotator/canvas/AnnotationCanvas.vue'
import AnnotatorShell from '~/features/components/annotator/AnnotatorShell.vue'
import ToolDock from '~/features/components/annotator/canvas/ToolDock.vue'
import PagerPill from '~/features/components/annotator/canvas/PagerPill.vue'
import HintBar from '~/features/components/annotator/canvas/HintBar.vue'
import ZoomPill from '~/features/components/shared/ZoomPill.vue'
import ClassPicker from '~/features/components/annotator/labels/ClassPicker.vue'
import AnnotateQueue from '~/features/components/annotation/AnnotateQueue.vue'
import AnnotatePanel from '~/features/components/annotation/AnnotatePanel.vue'
import WorkSheet, { type WorkTab } from '~/features/components/annotation/student/WorkSheet.vue'
import { useAnnotatorLayout } from '~/core/composables/useAnnotatorLayout'

const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)

// ---- responsive layout (tablet), the same shell /image-annotator uses ----
// `stacked` is the one-pane arrangement (compact, or a portrait tablet with no room to dock the
// labels): tools and classes move to bottom bars and the queue and side panel become sheets.
// The queue never collapses (leftOpen stays true) so the shell never enters focus mode.
const { layout, stacked, isTouchLayout } = useAnnotatorLayout()
const leftOpen = ref(true)
const rightOpen = ref(true)
const queueSheetOpen = ref(false)

// Whether Mark done / Skip advance to the next image after changing its status, or mark and stay.
// The pager only changes position, so it never fires here — one press is one move either way.
const autoAdvance = ref(true)

// The local-draft save indicator in the header. `saving` while a change is settling, `saved` once
// the debounced write below has run. Cosmetic: the work is on the student's machine, not the server.
const saveState = ref<'saved' | 'saving'>('saved')

// This route hides the app bar, so below 1280 - where the app nav is a Sheet keyed off `openMobile`
// - there is no trigger for it and the page could only be left with Back or the browser. A hamburger
// in the header opens it. On the desktop the sidebar is docked and visible, so this is not needed.
const sidebar = useSidebar()
const openNav = () => {
    if (sidebar.isMobile.value) sidebar.setOpenMobile(!sidebar.openMobile.value)
    else sidebar.open.value = !sidebar.open.value
}

// Full-bleed, like /image-annotator: drop the app container's padding and the app bar so the
// picture owns the viewport. Both are removed on the way out.
const APP_FILL = 'mc-app-fill'
const HIDE_BAR = 'mc-hide-app-bar'
// Collapse the app nav to its 64px icon rail while on this route, so 300px of nav does not eat the
// picture beside the 280px queue and 320px panel. Written THROUGH THE REF, not `setOpen`, so it
// stays route-scoped and never touches the person's saved `sidebar_state` (the image-annotator rule).
let navWasOpen = true
onMounted(() => {
    document.documentElement.classList.add(APP_FILL, HIDE_BAR)
    navWasOpen = sidebar.open.value
    sidebar.open.value = false
})
onBeforeUnmount(() => {
    document.documentElement.classList.remove(APP_FILL, HIDE_BAR)
    sidebar.open.value = navWasOpen
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
// Flips true once loadThumbs has settled, so the filmstrip can tell a thumb still loading (skeleton)
// from one whose fetch failed (broken tile) - both leave `thumb` null.
const thumbsLoaded = ref(false)
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
// A fixed vocabulary the instructor authored: students pick from it only no new classes, no
// recolouring, and colours follow the label_set.
const fixedLabelSet = computed(() => (config.value?.label_set.length ?? 0) > 0)
const current = computed<FieldState | null>(() => fields.value[currentIndex.value] ?? null)
const currentName = computed(() => `Image ${String(currentIndex.value + 1).padStart(2, '0')}`)

// The touch filmstrip: the whole batch as square thumbnails, built from the thumbs loadThumbs
// already fetched into each field. `failed` only once loading has settled, so an in-flight thumb
// shows a skeleton rather than a broken tile. `done` and `skipped` badge each cell with its status
// (teal tick / amber skip, the queue's own colours), so what is left to do is readable from the
// strip without opening the queue. They are the two ends of `status`; a pending image gets neither.
const pagerStrip = computed(() =>
    fields.value.map((f, i) => ({
        id: f.imageId,
        thumb: f.thumb,
        active: i === currentIndex.value,
        failed: thumbsLoaded.value && !f.thumb,
        done: f.status === 'completed',
        skipped: f.status === 'skipped',
    })),
)

const tool = ref<Tool>('rectangle')
const selectedId = ref<string | null>(null)

/**
 * The current image is finished, so its annotations are locked until the student undoes that.
 *
 * "Done" ought to mean the work under it has stopped moving. Without this it did not: the rectangle
 * tool is armed by default and a one-finger drag under it DRAWS rather than pans, so a student who
 * marked an image done, scrolled the filmstrip back to look at it, and dragged to inspect would
 * quietly add boxes to work they believed was settled — and nothing on screen would say so.
 *
 * Locked, not hidden: the picture still pans, pinches, zooms and double-taps to fit, so a finished
 * image stays fully inspectable. The way out is the one button the action row already shows on a
 * completed image, "Undo done", which is why no separate unlock control is needed.
 */
const locked = computed(() => current.value?.status === 'completed')
const activeLabelId = ref<number | null>(null)
const hiddenIds = ref<Set<string>>(new Set())

// Which shape ids existed when the current image was opened, so auto-labelling (below) only touches
// shapes drawn from here on a label cleared later stays cleared, and restored work is untouched.
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

// Which WorkSheet tab is showing (compact / portrait). Opens on Instructions so the student reads
// the brief and answers before drawing; "Start annotating" hands off to Label.
const workTab = ref<WorkTab>('task')

/**
 * A short slide when the image changes, so stepping through the batch reads as motion rather than a
 * hard swap: without it the picture is simply different from one frame to the next, and on a phone
 * (where the filmstrip scrolls under a fixed frame rather than the pages turning) there was nothing
 * at all to say a navigation had happened.
 *
 * Played on the canvas WRAPPER through the Web Animations API, not by re-keying the canvas: the
 * canvas has to stay mounted or the navigation would reset its viewport, zoom and shapes.
 *
 * SLIDE ONLY, no opacity fade. Fading over the dark canvas ground dims the whole panel toward black
 * and reads as a blink; a pure push keeps the picture fully opaque the whole way in. Same animation,
 * direction and curve as /image-annotator, so a step feels the same on both annotators.
 */
const canvasSlide = useTemplateRef<HTMLElement>('canvasSlide')
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
watch(currentIndex, (to, from) => {
    if (to === from || reducedMotion.value) return
    const el = canvasSlide.value
    if (!el || typeof el.animate !== 'function') return
    // The next image comes in from the right, the previous one from the left, so the motion agrees
    // with the direction the filmstrip just travelled.
    const offset = to > from ? 6 : -6
    el.animate([{ transform: `translateX(${offset}%)` }, { transform: 'translateX(0)' }], {
        duration: 300,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)', // decelerates into place
    })
})

// ---- canvas view state (zoom / fit / visibility), read off the shared canvas' exposed API ----
const canvas = useTemplateRef<InstanceType<typeof AnnotationCanvas>>('canvas')
const zoomPct = computed(() =>
    canvas.value?.transform ? zoomPercent(canvas.value.transform) : 100,
)
const atFit = computed(() => Boolean(canvas.value?.atFit))
const canZoom = computed(() => Boolean(canvas.value?.ready))

// ---- per-image undo/redo history ----
// currentShapes swaps per image (unlike the single-image staff annotator), so each image keeps its
// own stack, stashed here across switches and keyed by imageId. History is in-memory only a
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
        // and resubmission. A submission still awaiting review, or already graded, stays read-only
        // so a refresh can't reopen it and the student is sent to the read-only feedback page.
        const mine = await annotationAssignmentService.getMySubmission(id).catch(() => null)
        if (mine) {
            if (mine.status !== 'rejected') {
                await router.replace(`/annotation-assignments/submissions/${mine.id}`)
                return
            }
            prefillFromSubmission(mine)
            returnedReason.value = mine.rejection_reason
            toast.info('This submission was returned: edit it and resubmit')
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

        // Autosave from here on the load above is done, so the first fire persists real edits, not
        // the skeleton. Deep because the student mutates fields/shapes/responses in place; url/thumb
        // churn from lazy image loads also trips it but is filtered out of what gets written.
        watchDebounced(
            [fields, currentIndex, palette],
            () => {
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
                })
                saveState.value = 'saved'
            },
            { deep: true, debounce: 600, maxWait: 3000 },
        )

        // The indicator's "saving" edge, fired immediately on a real edit (the debounced write above
        // flips it back to "saved"). Set up after the load so restoring a draft doesn't read as saving.
        watch([fields, palette], () => (saveState.value = 'saving'), { deep: true })
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
                /* a failed thumb stays null; the filmstrip shows a broken tile once settled */
            }
        }),
    )
    thumbsLoaded.value = true
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
    if (locked.value) return
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
        // Click the highlighted class again to switch it off new shapes then stay unlabelled.
        activeLabelId.value = activeLabelId.value === labelId ? null : labelId
    }
}

// A class typed straight onto a shape's chip. Match it to the palette if it's a known class;
// otherwise create the class on the spot so it gets a colour and joins the list (rather than
// lingering as a colourless free-text label the student can't recolour or pick again).
function labelShape(shapeId: string, name: string) {
    if (locked.value) return
    const shape = currentShapes.value.find((s) => s.id === shapeId)
    if (!shape) return
    const trimmed = name.trim()
    const known = labelByName(palette.value, trimmed)
    // A fixed vocabulary is PICK-ONLY: an off-list name is dropped, not applied. The canvas already
    // keeps the free-text chip shut for these assignments (lockLabels), so this only fires from a
    // stray path — but the shape must never carry a class the instructor did not author.
    if (fixedLabelSet.value && !known) return
    shape.label = name
    if (!trimmed) {
        shape.labelId = null
    } else {
        shape.labelId = known ? known.id : addClass(trimmed)
    }
    commit()
}

function deleteSelected() {
    if (locked.value || !selectedId.value) return
    deleteShape(selectedId.value)
}

// Remove one shape from the current image the per-row delete button in the labels list.
function deleteShape(sid: string) {
    if (locked.value) return
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

// Label ids a shape uses on ANY image a class belongs in the list while it is used somewhere.
function usedLabelIdsEverywhere(): Set<number> {
    const used = new Set<number>()
    for (const f of fields.value)
        for (const s of f.shapes) if (s.labelId != null) used.add(s.labelId)
    return used
}

// Drop student-added classes no shape uses anywhere, keeping the one highlighted for drawing. The
// instructor's fixed vocabulary the first `label_set` rows always stays, so students can still
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

// Add a palette row and return its id. Colour defaults to a neutral grey (the same for every class,
// recoloured deliberately from the swatch); the wire stores it bare (no '#').
function addClass(name: string, colorHex?: string): number {
    const id = ++labelSeq
    palette.value.push({
        id,
        label: name,
        color_hex: colorHex ?? toColorHex(DEFAULT_CLASS_COLOR),
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

// Editing a class from the mobile strip: rename and recolour together. The student's palette is
// local to this submission, so there is no server write - but the label TEXT is denormalized onto
// each shape and the save sends that text, not an id (unlike the staff annotator), so a rename must
// rewrite every shape carrying the class across ALL images or the save would keep the old name.
function editClass(labelId: number, name: string, colorHex: string) {
    const label = name.trim()
    if (!label) return
    const klass = palette.value.find((l) => l.id === labelId)
    if (!klass) return
    klass.label = label
    klass.color_hex = toColorHex(colorHex)
    for (const field of fields.value)
        for (const shape of field.shapes) if (shape.labelId === labelId) shape.label = label
}

// The per-image form (AnnotatePanel) writes back through here so it never mutates a prop directly.
function setResponse(key: string, value: string) {
    if (locked.value) return
    if (current.value) current.value.responses[key] = value
}

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
    // Toggle: on a completed image the button reads "Undo done" and this reverts it to pending,
    // staying put rather than advancing. Reverting is the ONLY thing a second press does, which is
    // why the button names it instead of reading "Done" and looking like a state badge.
    if (current.value.status === 'completed') {
        current.value.status = 'pending'
        return
    }
    // A required answer is missing, so send the student to the tab that holds it rather than only
    // raising a toast: the toast names the field but leaves them to find it, and on a phone the
    // field may be one tab away behind a sheet showing the tool row.
    const missing = missingRequired(current.value)
    if (missing) {
        workTab.value = 'task'
        return toast.error(`"${missing}" is required`)
    }
    current.value.status = 'completed'
    if (autoAdvance.value && currentIndex.value < fields.value.length - 1)
        void goTo(currentIndex.value + 1)
}

function skip() {
    if (!current.value) return
    if (!config.value?.allow_skip) return toast.error('Skipping is not allowed')
    current.value.status = 'skipped'
    if (autoAdvance.value && currentIndex.value < fields.value.length - 1)
        void goTo(currentIndex.value + 1)
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
        toast.error('Could not submit: check the highlighted fields')
    } finally {
        submitting.value = false
    }
}

const percentCompleted = computed(() =>
    fields.value.length ? Math.round((doneCount.value / fields.value.length) * 100) : 0,
)
const percentSkipped = computed(() =>
    fields.value.length ? Math.round((skippedCount.value / fields.value.length) * 100) : 0,
)
</script>

<template>
    <AnnotatorShell v-model:left-open="leftOpen" v-model:right-open="rightOpen">
        <!-- desktop header (full, and medium-landscape) -->
        <template #header>
            <McButton variant="ghost" size="icon-sm" aria-label="Back" @click="router.back()">
                <ChevronLeft class="tw:size-4" />
            </McButton>
            <!-- In medium the app nav is a sheet with no trigger of its own, so a hamburger opens it;
                 the queue is a drawer too and takes the Images icon. Neither is needed at Full, where
                 the sidebar is docked and the queue a column. -->
            <McButton
                v-if="layout === 'medium'"
                variant="ghost"
                size="icon-sm"
                aria-label="Open the navigation menu"
                @click="openNav"
            >
                <Menu class="tw:size-4" />
            </McButton>
            <McButton
                v-if="layout === 'medium'"
                variant="ghost"
                size="icon-sm"
                aria-label="Show the image queue"
                @click="queueSheetOpen = true"
            >
                <Images class="tw:size-4" />
            </McButton>
            <span class="tw:min-w-0 tw:truncate tw:text-sm tw:font-medium tw:text-an-text">
                {{ assignment?.name ?? 'Annotate' }}
            </span>
            <span
                class="tw:shrink-0 tw:rounded-[5px] tw:border tw:border-an-n-150 tw:bg-an-n-50 tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-faint"
            >
                {{ fields.length }} images
            </span>
            <!-- Assignment progress lives in the header, not the queue: it is assignment state, and
                 the queue column is list state. -->
            <span
                class="tw:shrink-0 tw:rounded-[5px] tw:bg-an-n-50 tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-an-n-600"
            >
                {{ doneCount }} / {{ fields.length }} done · {{ skippedCount }} skipped
            </span>
            <div class="tw:flex-1" />

            <!-- Whether Mark done / Skip advance after changing status, or mark and stay. -->
            <label
                class="tw:flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:text-[11.5px] tw:text-an-muted"
                title="Advance to the next image after Mark done or Skip"
            >
                <input v-model="autoAdvance" type="checkbox" class="tw:accent-an-accent" />
                Auto-advance
            </label>
            <!-- Local draft indicator: the work is saved to this device until Submit. -->
            <span
                class="tw:flex tw:shrink-0 tw:items-center tw:gap-1 tw:text-[11.5px] tw:text-an-faint"
            >
                <template v-if="saveState === 'saving'">
                    <span class="tw:size-1.5 tw:rounded-full tw:bg-an-warn" />
                    Saving…
                </template>
                <template v-else>Saved</template>
            </span>
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
        </template>

        <!-- compact header (portrait tablet / phone): the filmstrip navigates, so no hamburger and no
             queue icon, and the WorkSheet's Label tab holds the classes and the shape list, so no
             labels icon either — just where you are, how far along, and Submit. -->
        <template #header-compact>
            <McButton variant="ghost" size="icon-sm" aria-label="Back" @click="router.back()">
                <ChevronLeft class="tw:size-4" />
            </McButton>
            <div class="tw:flex tw:min-w-0 tw:flex-col">
                <span class="tw:truncate tw:font-mono tw:text-[12px] tw:text-an-text">
                    {{ currentName }}
                </span>
                <span class="tw:font-mono tw:text-[10.5px] tw:text-an-faint">
                    {{ doneCount }} / {{ fields.length }} done · {{ currentShapes.length }} box{{
                        currentShapes.length === 1 ? '' : 'es'
                    }}
                </span>
            </div>
            <div class="tw:flex-1" />
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
                        : `${Math.max(required - addressed, 0)} left`
                }}
            </McButton>
        </template>

        <!-- Docked pager strip above the canvas, rendered by the shell only on a stacked phone (the
             floating PagerPill in #canvas is suppressed there) so it sits beside the picture. -->
        <template #pager>
            <PagerPill
                v-if="current"
                docked
                :name="currentName"
                :index="currentIndex + 1"
                :total="fields.length"
                :strip="pagerStrip"
                @previous="goTo(currentIndex - 1)"
                @next="goTo(currentIndex + 1)"
                @select="(id) => goTo(fields.findIndex((f) => f.imageId === id))"
            />
        </template>

        <!-- Docked zoom strip below the canvas on a stacked phone (the floating ZoomPill in #canvas
             is suppressed there), so the controls sit beside the picture. -->
        <template #zoom>
            <ZoomPill
                docked
                :percent="zoomPct"
                :at-fit="atFit"
                :enabled="canZoom"
                :all-hidden="allHidden"
                @zoom-in="canvas?.zoomIn()"
                @zoom-out="canvas?.zoomOut()"
                @fit="canvas?.fit()"
                @toggle-visibility="toggleAllHidden"
            />
        </template>

        <template #queue>
            <AnnotateQueue
                :fields="fields"
                :palette="palette"
                :current-index="currentIndex"
                :percent-complete="percentCompleted"
                :percent-skipped="percentSkipped"
                @select="goTo"
            />
        </template>

        <template #canvas>
            <!-- Canvas and its floating overlays sit DIRECTLY in the shell's relative <main>, exactly
                 like /image-annotator: an extra flex-column wrapper here (added for a docked pager
                 that is gone) changed the filmstrip's containing block and left it unable to
                 touch-scroll on iPad. The stacked brief band is gone too — instructions and the
                 fill-in form live in the WorkSheet's tabs, so the picture is never pushed down.
                 This wrapper is also what the image-change slide plays on (see `canvasSlide`):
                 animating it rather than the canvas keeps the canvas mounted, so a navigation does
                 not reset the viewport, the zoom or the shapes. -->
            <div ref="canvasSlide" class="tw:absolute tw:inset-0">
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
                    :touch-layout="isTouchLayout"
                    :lock-labels="fixedLabelSet"
                    :readonly="locked"
                    :inset-bottom="stacked ? 16 : 0"
                    @label-shape="labelShape"
                    @commit="commit"
                    @undo="undoStep"
                />
            </div>

            <!-- returned-for-changes banner, pinned over the top of the canvas -->
            <div
                v-if="returnedReason !== null"
                class="tw:absolute tw:inset-x-0 tw:top-0 tw:z-10 tw:flex tw:items-start tw:gap-2 tw:border-b tw:border-warning/30 tw:bg-warning/10 tw:px-3 tw:py-2 tw:text-[12.5px] tw:text-an-text tw:backdrop-blur"
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
                class="tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:text-an-d-text"
            >
                Loading…
            </div>

            <!-- Centre the dock on the left in the touch layout, where the filmstrip floats
                 full-width across the top: top-left would put the first tool under it. On desktop the
                 pager is a top-right pill, so the dock keeps the top-left corner. -->
            <ToolDock
                v-if="!stacked"
                :centered="isTouchLayout"
                :disabled="locked"
                :tool="tool"
                :can-undo="canUndoAny"
                :can-redo="canRedo"
                :can-delete="Boolean(selectedId)"
                @update:tool="tool = $event"
                @undo="undoStep"
                @redo="redo"
                @delete-selected="deleteSelected"
            />
            <!-- Floats over the canvas on desktop (a top-right text pill) and on a wide landscape
                 touch layout (the centred filmstrip), same as /image-annotator so the strip scrolls
                 the same way. On a stacked phone it docks into the shell's own #pager row instead, so
                 it does not cover the top of the picture. -->
            <PagerPill
                v-if="!stacked"
                :name="currentName"
                :index="currentIndex + 1"
                :total="fields.length"
                :strip="pagerStrip"
                @previous="goTo(currentIndex - 1)"
                @next="goTo(currentIndex + 1)"
                @select="(id) => goTo(fields.findIndex((f) => f.imageId === id))"
            />
            <!-- No hint while the image is locked: every line it can show names a gesture the
                 canvas is currently refusing. -->
            <HintBar
                v-if="!stacked && !locked"
                :tool="tool"
                :selected-count="selectedId ? 1 : 0"
                :drafting="Boolean(canvas?.hasDraft)"
            />
            <!-- Floats over the canvas except on a stacked phone, where it docks into its own shell
                 row (see #zoom) so it does not cover the bottom of the picture. -->
            <ZoomPill
                v-if="!stacked"
                :percent="zoomPct"
                :at-fit="atFit"
                :enabled="canZoom"
                :all-hidden="allHidden"
                @zoom-in="canvas?.zoomIn()"
                @zoom-out="canvas?.zoomOut()"
                @fit="canvas?.fit()"
                @toggle-visibility="toggleAllHidden"
            />
        </template>

        <template #labels>
            <AnnotatePanel
                :instructions="assignment?.instructions"
                :field-prompts="config?.field_prompts ?? []"
                :responses="current?.responses ?? null"
                :status="current?.status ?? null"
                :shapes="currentShapes"
                :selected-id="selectedId"
                :hidden-ids="hiddenIds"
                :palette="palette"
                :allow-skip="Boolean(config?.allow_skip)"
                :lock-labels="fixedLabelSet"
                @update-response="setResponse"
                @select-shape="selectedId = $event"
                @delete-shape="deleteShape"
                @relabel="labelShape"
                @mark-done="markDone"
                @skip="skip"
            >
                <template #classes>
                    <ClassPicker
                        :classes="classes"
                        :active="activeLabelId"
                        :fixed="fixedLabelSet"
                        @pick="pickClass"
                        @create="createClass"
                        @recolor="recolorClass"
                        @rename="editClass"
                    />
                </template>
            </AnnotatePanel>
        </template>

        <!-- tablet/phone: the one bottom sheet — Task / Label / Answer. Replaces the old instructions
             band, tool row, class strip and action bar. The shell mounts it only when stacked. -->
        <template #worksheet>
            <WorkSheet
                v-model:tab="workTab"
                :instructions="assignment?.instructions"
                :field-prompts="config?.field_prompts ?? []"
                :responses="current?.responses ?? null"
                :status="current?.status ?? null"
                :shapes="currentShapes"
                :classes="classes"
                :active-label-id="activeLabelId"
                :selected-id="selectedId"
                :hidden-ids="hiddenIds"
                :palette="palette"
                :tool="tool"
                :can-undo="canUndoAny"
                :can-redo="canRedo"
                :allow-skip="Boolean(config?.allow_skip)"
                :fixed="fixedLabelSet"
                :locked="locked"
                @update:tool="tool = $event"
                @undo="undoStep"
                @redo="redo"
                @delete-selected="deleteSelected"
                @pick="pickClass"
                @create-class="createClass"
                @edit-class="editClass"
                @select-shape="selectedId = $event"
                @delete-shape="deleteShape"
                @update-response="setResponse"
                @mark-done="markDone"
                @skip="skip"
                @start="workTab = 'label'"
            />
        </template>

        <template #sheets>
            <McSheet v-model:open="queueSheetOpen">
                <McSheetContent
                    side="left"
                    class="mc-slide-left tw:w-[300px] tw:p-0 tw:[touch-action:pan-x_pan-y]"
                    hide-close
                >
                    <AnnotateQueue
                        :fields="fields"
                        :palette="palette"
                        :current-index="currentIndex"
                        :percent-complete="percentCompleted"
                        :percent-skipped="percentSkipped"
                        @select="
                            (i) => {
                                goTo(i)
                                queueSheetOpen = false
                            }
                        "
                    />
                </McSheetContent>
            </McSheet>
        </template>
    </AnnotatorShell>
</template>
