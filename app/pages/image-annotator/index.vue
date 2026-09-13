<script setup lang="ts">
import { toast } from 'vue-sonner'
import {
    ChevronDown,
    CircleCheck,
    Download,
    Images,
    Menu,
    PanelLeftOpen,
    PanelRight,
    Shapes,
    Sparkles,
    Upload,
    X,
} from '@lucide/vue'
import { onBeforeRouteLeave } from 'vue-router'
import { until, watchDebounced } from '@vueuse/core'
import { zoomPercent as toPercent } from '~/core/helpers/viewportTransform'
import {
    MAX_ANNOTATIONS,
    shapesFromDetection,
    diffAnnotations,
    hasUnsavedAnnotations,
    shouldCommit,
    toAnnotationPayload,
    toShapes,
    type Shape,
} from '~/core/helpers/annotationShapes'
import {
    serializeAnnotations,
    parseAnnotationsFile,
    shapesFromFile,
} from '~/core/helpers/annotationFile'
import { imageService, type LibraryImage } from '~/services/imageService'
import { albumService, type Album } from '~/services/albumService'
import { annotationService } from '~/services/annotationService'
import { annotationLabelService, type AnnotationLabel } from '~/services/annotationLabelService'
import {
    applyActiveLabel,
    buildClasses,
    classForDigit,
    colorForShape,
    DEFAULT_CLASS_COLOR,
    dominantLabelId,
    labelById,
    labelByName,
    toColorHex,
} from '~/core/helpers/annotationClasses'
// Imported explicitly rather than left to `imports.dirs: ['core/**']`, because auto-import resolves
// at BUILD time: a helper added while the dev server is running is typed but undefined at runtime.
import { isConflict } from '~/core/helpers/error'
import { localId } from '~/core/helpers/localId'
import {
    toDraftShapes,
    draftShapesToShapes,
    draftSignature,
    type DraftClass,
    type ImageAnnotationDraft,
} from '~/core/helpers/imageAnnotationDraft'
import { useImageAnnotationDraft } from '~/core/composables/useImageAnnotationDraft'
import { useImageObjectUrls } from '~/core/composables/useImageObjectUrls'
import { usePagedImages } from '~/core/composables/usePagedImages'
import { useDelayedFlag } from '~/core/composables/useDelayedFlag'
import { queueRowView, type QueueFilter } from '~/core/helpers/annotationQueue'
import { imageDisplayName } from '~/core/helpers/imageName'
import AnnotationCanvas, {
    type Tool,
} from '~/features/components/annotator/canvas/AnnotationCanvas.vue'
import AnnotatorShell from '~/features/components/annotator/AnnotatorShell.vue'
import AnnotatorHeader from '~/features/components/annotator/AnnotatorHeader.vue'
import AnnotationOverlay from '~/features/components/shared/AnnotationOverlay.vue'
import ImageQueue from '~/features/components/annotator/queue/ImageQueue.vue'
import FocusRail from '~/features/components/annotator/queue/FocusRail.vue'
import FocusOverlays from '~/features/components/annotator/canvas/FocusOverlays.vue'
import ToolDock from '~/features/components/annotator/canvas/ToolDock.vue'
import PagerPill from '~/features/components/annotator/canvas/PagerPill.vue'
import HintBar from '~/features/components/annotator/canvas/HintBar.vue'
import ZoomPill from '~/features/components/shared/ZoomPill.vue'
import BottomTools from '~/features/components/annotator/mobile/BottomTools.vue'
import ClassStrip from '~/features/components/annotator/mobile/ClassStrip.vue'
import { useAnnotatorLayout } from '~/core/composables/useAnnotatorLayout'
import ClassPicker from '~/features/components/annotator/labels/ClassPicker.vue'
import ShapeList from '~/features/components/annotator/labels/ShapeList.vue'
import ImageMetaCard from '~/features/components/annotator/labels/ImageMetaCard.vue'
import SeedFromRunDialog from '~/features/components/annotator/SeedFromRunDialog.vue'
import ShortcutSheet from '~/features/components/annotator/ShortcutSheet.vue'
import { useAnnotatorHotkeys } from '~/core/composables/useAnnotatorHotkeys'
import type { HotkeyAction } from '~/core/helpers/annotatorHotkeys'

/**
 * The image annotator (BE-ADR-030), against the live library.
 *
 * `role: 'instructor'` is this codebase's spelling of "any staff account", which is what the server
 * enforces (`@Roles(UserType.Staff)`) and includes TAs. There is deliberately no client-side rank:
 * RolesGuard is a flat OR over the claims with no hierarchy.
 */
definePageMeta({ role: 'instructor' })

const breadcrumb = useBreadcrumb()
// The app bar's trail is the ONLY one now, so it names the batch rather than the tool.
breadcrumb.setBreadcrumbs([
    { label: 'Image Library', to: '/image-library' },
    { label: 'All images' },
])

const route = useRoute()
const auth = useAuth()

/**
 * This route IS the viewport.
 *
 * `mc-app-fill` drops the app container's max-width and padding and stops the page scrolling. A
 * class on <html> removed on unmount, which is the shape the other full-screen pages already use.
 *
 * The app bar's own collapse trigger STAYS. An earlier version hid it and teleported a second
 * toggle in beside it, which was the duplicate reported the first time round; the bar should look
 * like it does on every other page, and the annotator's panels have F.
 */
const APP_FILL_CLASS = 'mc-app-fill'
const HIDE_BAR_CLASS = 'mc-hide-app-bar'
const HIDE_NAV_CLASS = 'mc-hide-app-nav'

/**
 * The app nav starts collapsed HERE and nowhere else.
 *
 * 300px of nav plus a 280px queue plus a 320px labels panel leaves the picture under half a
 * 1440px screen, which is worse than what this rebuild replaced. The person can still expand it;
 * it just should not open expanded on the one screen whose whole point is the image.
 *
 * *** WRITTEN THROUGH THE REF, NOT setOpen. *** `setOpen` persists to the `sidebar_state` cookie
 * for a week, so collapsing through it turned a route-scoped preference into an app-wide one: leave
 * the annotator by reloading or closing the tab and every other page opened collapsed, including
 * the Image Library. This collapse is a property of BEING on this route, so it lives only in memory
 * and the person's own saved preference is never touched.
 */
const sidebar = useSidebar()
let navWasOpen = true

onMounted(() => {
    document.documentElement.classList.add(APP_FILL_CLASS, HIDE_BAR_CLASS)
    navWasOpen = sidebar.open.value
    sidebar.open.value = false
})

onBeforeUnmount(() => {
    document.documentElement.classList.remove(APP_FILL_CLASS, HIDE_BAR_CLASS, HIDE_NAV_CLASS)
    sidebar.open.value = navWasOpen
})

const PAGE_SIZE = 30

/**
 * `expert_curated` starts true for an INSTRUCTOR and false for everyone else.
 *
 * The flag means "vetted by a domain expert", and here the instructor is that expert. A TA's pass
 * is not, and `admin` is a systems role rather than a clinical one. Read from the JWT first with
 * the stored profile as fallback, the rule the auth middleware uses.
 */
const defaultCurated = computed(() => (auth.jwtUserInfo?.role ?? auth.user?.role) === 'instructor')

// ---- the library strip ---------------------------------------------------------------------------

// The library is scoped to a chosen source and starts EMPTY: an album id, `'all'` for the whole
// library, or `null` for nothing yet. The shared pool can be large, so the annotator no longer
// pulls all of it on open; the student/instructor picks an album or opts into "All images".
const albums = ref<Album[]>([])
const source = ref<number | 'all' | null>(null)

// ---- panels, classes, per-shape view state -------------------------------------------------------

const leftOpen = ref(true)
const rightOpen = ref(true)
// On by default: the local cache holds work between writes, and the server save is throttled to a
// 20s idle so it is no longer chatty enough to want off. The header toggle still turns it off, and
// save-on-navigate + manual Save + the local cache cover that case.
const autoSave = ref(true)
const search = ref('')

// The strip is one paged listing (usePagedImages): images, total and the load/append/reset live
// there, and it refetches from page 1 whenever the filters below change. `source === null` means
// nothing is chosen yet, so it loads NOTHING rather than the whole shared pool. The chips filter what
// is loaded, not what is fetched, so they are deliberately not part of the query.
const {
    images,
    total,
    loading: imagesLoading,
    loadMore,
} = usePagedImages({
    perPage: PAGE_SIZE,
    filters: () =>
        source.value === null
            ? null
            : {
                  ...(typeof source.value === 'number' && { album_id: source.value }),
                  ...(search.value && { q: search.value }),
              },
})

const queueFilter = ref<QueueFilter>('all')

/**
 * The session's accumulated class VOCABULARY: the caller's own label rows (BE-ADR-038).
 *
 * It starts EMPTY and accumulates. A class enters it the first time it is seen this session - on an
 * opened image's boxes, an import, a seed, or a name typed on a chip - rather than the whole stored
 * palette loading up front. The colour is still authored and the id still real; `allLabels` below is
 * where an accumulated class finds both.
 *
 * This is the STORE, not what the picker shows: it resolves every box's colour and id and backs the
 * save. The picker renders `classes` below, which narrows this to the OPEN image so each image shows
 * its own class list.
 */
const palette = ref<AnnotationLabel[]>([])
/**
 * Every stored label the person owns, fetched once at setup and NOT shown directly. It is the source
 * `accumulateClasses` copies rows out of into `palette` as their class appears on a visited image,
 * so a box read back carries the real `label_id` and authored colour without a per-image lookup.
 */
const allLabels = ref<AnnotationLabel[]>([])
const activeLabelId = ref<number | null>(null)

/**
 * A newly named class no longer costs a server POST the moment it is typed (BE-ADR-030, FE side).
 * It lives as a LOCAL palette row with a NEGATIVE id until a save mints it (`flushPendingLabels`),
 * which cuts label create/link calls to one batch per save. Negative ids are disjoint from the
 * server's positive ones, so `isPending` is the whole of the distinction and lookups by text are
 * unaffected. Because save-on-navigate stays, pending rows only ever exist on the open image.
 */
let pendingSeq = 0
const isPending = (id: number | null): id is number => id !== null && id < 0

/**
 * Classes STAGED for the open image: armed via "New class" but not yet carrying a box here. Covers a
 * brand-new class AND an existing one (same name, same row/colour) brought onto this image again.
 * They show in the picker and stay armed until their first box, so creating several before drawing
 * does not drop all but the last, and re-using a class on a fresh image is not instantly disarmed.
 *
 * Reactive on purpose: `classes` and `prunePendingClasses` both read it, so its add/delete/clear must
 * re-run them on their own rather than riding on a coincidental `palette`/`shapes` change. It is
 * one-shot and image-scoped: an id leaves the moment a shape carries it, and the whole set is cleared
 * on image open so nothing is carried between images.
 */
const stagedClassIds = reactive(new Set<number>())

/** The label ids carried by boxes on the OPEN image. */
const labelIdsOnImage = computed(
    () => new Set(shapes.value.map((s) => s.labelId).filter((id): id is number => id !== null)),
)

/**
 * The classes the picker shows: SPECIFIC TO THE OPEN IMAGE, not the whole session's vocabulary.
 * Opening image A lists the classes A's boxes use; opening B lists B's, so each image shows its own
 * list. `palette` still holds the full accumulated vocabulary (it resolves a box's colour and id and
 * backs the save) — this only narrows what is DISPLAYED.
 *
 * Kept visible on top of the image's own classes: any just-created (pending, box-less) class made on
 * THIS image, so create-then-draw works in the moment before a box exists to carry it (that set is
 * cleared on image open, so it never carries a class over from another image). The armed class is
 * deliberately NOT force-shown: on a blank image the pick carries over from the previous one, and
 * listing it would make an empty image show the last image's class. It reappears the instant a box
 * on this image carries it. A class in the vocabulary but not on this image is reached by naming it
 * in "New class" again — the mint's 409 path adopts the existing row.
 */
const classes = computed(() => {
    const onImage = labelIdsOnImage.value
    const visible = palette.value.filter(
        (entry) => onImage.has(entry.id) || stagedClassIds.has(entry.id),
    )
    return buildClasses(visible, shapes.value)
})

/** The lookup `toShapes` and `shapesFromDetection` use to turn a label's text back into its id. */
const labelIdFor = (name: string) => labelByName(palette.value, name)?.id ?? null

/**
 * Reveal in the picker every class the given names use that it does not already hold, copying the
 * authored row out of `allLabels`. This is what grows the list with the images visited rather than
 * loading it whole: opening an image feeds it the names its boxes carry. A name `allLabels` does not
 * know (never saved, or minted this session) is skipped here and handled by its own mint path.
 */
const accumulateClasses = (names: Iterable<string | null | undefined>) => {
    const have = new Set(palette.value.map((entry) => entry.label))
    const added: AnnotationLabel[] = []
    for (const name of names) {
        const wanted = name?.trim()
        if (!wanted || have.has(wanted)) continue
        const row = allLabels.value.find((entry) => entry.label === wanted)
        if (!row) continue
        have.add(wanted)
        added.push(row)
    }
    if (added.length) palette.value = [...palette.value, ...added]
}

/**
 * A label with this name, minted if the palette does not already hold one.
 *
 * The single place a class comes into existence: typed on a chip, typed into "New class", or named
 * by a model when a run is seeded. Minted EAGERLY, at the moment the name is given, rather than
 * deferred to the save, which is what lets a shape carry a real `label_id` from the instant it is
 * named and keeps the save a pure write. The server does the same thing in `seed-from-detection`.
 *
 * *** A 409 IS THE ORDINARY RACE, NOT AN ERROR. *** `UNIQUE(owner_id, label)` means two chips named
 * in quick succession, or a name minted in another tab, come back conflicted; the palette is
 * re-read and the existing row used. Anything else is surfaced and the caller leaves the shape
 * unnamed rather than pretending it was labelled.
 */
const ensureLocalLabel = (name: string, colorHex?: string): AnnotationLabel | null => {
    const wanted = name.trim()
    if (!wanted) return null
    const held = labelByName(palette.value, wanted)
    if (held) return held
    // A pending, local-only row. No server call - the mint is deferred to the next save. The colour
    // offered when nobody picked one is the neutral grey default, the same for every class;
    // `toColorHex` normalizes whatever the caller passed.
    const created: AnnotationLabel = {
        id: --pendingSeq,
        label: wanted,
        color_hex: toColorHex(colorHex ?? DEFAULT_CLASS_COLOR),
        owner_id: null,
        created_at: '',
        updated_at: '',
    }
    palette.value = [...palette.value, created]
    return created
}

/**
 * Mint on the server the pending (local) classes these shapes carry, batched at save time, and
 * remap their ids. This is where the deferred label create/link calls finally happen - one per new
 * class per save instead of one the instant it was named. Holds the same 409-is-ordinary handling
 * the old eager `ensureLabel` did: a name already ours (another tab, a seed) comes back conflicted,
 * and the existing server row is adopted. Returns a local-id -> server-id map for `save` to apply.
 */
const flushPendingLabels = async (forShapes: Shape[]): Promise<Map<number, number>> => {
    const remap = new Map<number, number>()
    const pendingIds = [...new Set(forShapes.map((s) => s.labelId).filter(isPending))]
    for (const pid of pendingIds) {
        const row = palette.value.find((entry) => entry.id === pid)
        if (!row) continue
        let server: AnnotationLabel | null = null
        try {
            server = await annotationLabelService.create({
                label: row.label,
                color_hex: row.color_hex,
            })
        } catch (error) {
            if (isConflict(error)) {
                const full = await annotationLabelService.list()
                server = full.find((entry) => entry.label === row.label) ?? null
            }
            if (!server) throw error
        }
        remap.set(pid, server.id)
        // Replace the pending row in place, keeping its position so the picker does not reshuffle
        // mid-save; other pending rows (unused classes) are left for a later save.
        palette.value = palette.value.map((entry) => (entry.id === pid ? server! : entry))
    }
    return remap
}

const pickClass = (labelId: number) => {
    const label = labelById(palette.value, labelId)
    if (!label) return
    // With a shape selected the same gesture RECLASSES it, which is the point of the number keys:
    // draw, then press 2, without the pointer ever leaving the canvas.
    if (selectedShapeId.value)
        updateShape(selectedShapeId.value, { labelId: label.id, label: label.label })
    // Clicking the already-active class turns it off, so the next box drawn stays unlabelled - the
    // only way to draw without a class now that a new box inherits the active one (pick-then-draw).
    else activeLabelId.value = activeLabelId.value === label.id ? null : label.id
}

/**
 * A class typed straight onto a shape's chip on the canvas.
 *
 * Both halves, in one gesture: the class is created (locally, deferred to save) if it is new, and the
 * shape takes it. Deliberately does NOT move the active class - you named one shape, and silently
 * re-arming the next draw with it is a decision the person did not make.
 */
const labelShape = (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return updateShape(id, { labelId: null, label: '' })
    const label = ensureLocalLabel(trimmed)
    if (label) updateShape(id, { labelId: label.id, label: label.label })
}

const createClass = (name: string, colorHex?: string) => {
    const label = ensureLocalLabel(name, colorHex)
    if (!label) return
    // Apply to the selected shape ONLY when it is still unlabelled (the draw-then-name flow: draw a
    // box, then name it via "New class"). Never silently relabel a shape that ALREADY has a class,
    // because that orphans its old class and prune then drops it - which reads as "creating a new
    // class replaced the old one". Relabelling an already-classed box is done deliberately by picking
    // an existing class. Otherwise arm the class for the next draw and STAGE it until that box exists.
    const selected = selectedShapeId.value
        ? shapes.value.find((shape) => shape.id === selectedShapeId.value)
        : null
    if (selected && selected.labelId === null && !selected.label) {
        updateShape(selected.id, { labelId: label.id, label: label.label })
        return
    }
    activeLabelId.value = label.id
    // Stage it until its first box on THIS image, so it shows and stays armed instead of being pruned
    // or instantly disarmed for having no box yet. Covers a brand-new class AND an existing one (same
    // name reuses the same row/colour) brought onto this image again. Already-on-image needs nothing.
    if (!labelIdsOnImage.value.has(label.id)) stagedClassIds.add(label.id)
}

/**
 * Recolour a class from its own swatch.
 *
 * There is no separate management screen by decision: the swatch beside a class IS its colour, so
 * that is where the colour is changed. The write is the whole of it - every box carrying the class
 * is coloured by lookup, so replacing the row repaints the canvas, the shape list and the queue dots
 * at once, and it is library-wide and permanent rather than a view setting.
 */
const recolorClass = async (labelId: number, color: string) => {
    const hex = toColorHex(color)
    // A pending (local) class has no server row yet, so recolour is a local edit only - it rides
    // along when the class is minted at save time.
    if (isPending(labelId)) {
        palette.value = palette.value.map((entry) =>
            entry.id === labelId ? { ...entry, color_hex: hex } : entry,
        )
        return
    }
    const previous = palette.value
    // Optimistic, because a colour picker that lags behind the pointer feels broken. Rolled back on
    // failure rather than left showing a colour the server did not accept.
    palette.value = palette.value.map((entry) =>
        entry.id === labelId ? { ...entry, color_hex: hex } : entry,
    )
    try {
        const updated = await annotationLabelService.update(labelId, { color_hex: hex })
        palette.value = palette.value.map((entry) => (entry.id === labelId ? updated : entry))
    } catch (error) {
        palette.value = previous
        toast.error(apiErrorMessage(error, 'Could not recolour that class'))
    }
}

/**
 * Rename and recolour a class together, from the mobile strip's inline editor.
 *
 * The phone has no labels panel, so this is the whole of managing a class there: one write sets both
 * fields (`update` keeps an omitted field, but the editor always carries both). Optimistic like
 * `recolorClass`, and it also rewrites the DENORMALIZED label text on every shape carrying the class
 * in the open image, so the shape list and the on-canvas chips show the new name at once. That
 * rewrite is invisible to the dirty check: the save is keyed on `label_id` (BE-ADR-038), so
 * `toAnnotationPayload` is unchanged and no box reads as edited.
 */
const editClass = async (labelId: number, label: string, colorHex: string) => {
    const name = label.trim()
    if (!name) return
    const hex = toColorHex(colorHex)
    const previousName = labelById(palette.value, labelId)?.label ?? ''

    const applyLocally = (text: string, colour: string) => {
        palette.value = palette.value.map((entry) =>
            entry.id === labelId ? { ...entry, label: text, color_hex: colour } : entry,
        )
        shapes.value = shapes.value.map((shape) =>
            shape.labelId === labelId ? { ...shape, label: text } : shape,
        )
    }

    // A pending (local) class has no server row yet, so this is a local edit only - the name and
    // colour ride along when the class is minted at save time.
    if (isPending(labelId)) {
        applyLocally(name, hex)
        return
    }

    const previous = palette.value
    applyLocally(name, hex)
    try {
        const updated = await annotationLabelService.update(labelId, {
            label: name,
            color_hex: hex,
        })
        palette.value = palette.value.map((entry) => (entry.id === labelId ? updated : entry))
    } catch (error) {
        palette.value = previous
        shapes.value = shapes.value.map((shape) =>
            shape.labelId === labelId ? { ...shape, label: previousName } : shape,
        )
        toast.error(apiErrorMessage(error, 'Could not update that class'))
    }
}

/** Hidden shapes, by id. Cleared when the image changes; hiding is a per-image reading aid. */
const hiddenIds = ref<Set<string>>(new Set())
const allHidden = computed(
    () => shapes.value.length > 0 && hiddenIds.value.size === shapes.value.length,
)
const toggleHidden = (id: string) => {
    const next = new Set(hiddenIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    hiddenIds.value = next
}
const toggleAllHidden = () => {
    hiddenIds.value = allHidden.value ? new Set() : new Set(shapes.value.map((s) => s.id))
}

/**
 * Shapes seeded from a model and not yet accepted or rejected, with the model's confidence.
 *
 * SESSION-ONLY. Nothing on the server records that an annotation came from a model, and
 * `image_annotations` stores no confidence at all - the serializer synthesizes 1 so a fabricated
 * number never reaches the export. A reload therefore loses the review state, which is recorded as
 * a backend request rather than papered over.
 */
const seeded = ref<Record<string, number>>({})

const acceptSeeded = (id: string) => {
    const { [id]: _dropped, ...rest } = seeded.value
    seeded.value = rest
}

const rejectSeeded = (id: string) => {
    acceptSeeded(id)
    removeShape(id)
}

/** Images seeded this session and still holding unreviewed shapes, for the queue's amber state. */
const seededImages = ref<Set<number>>(new Set())

// ---- the image on the canvas ---------------------------------------------------------------------

const selectedImageId = ref<number | null>(null)
const selectedImage = ref<LibraryImage | null>(null)
const imageUrl = ref<string | null>(null)
const imageError = ref<string | null>(null)
// The open image's full-res blob, cached by id. Only the current image is loaded - no neighbour
// prefetch - and the previous one is forgotten as each opens, so a long batch never pins every image
// it visited. The pager thumbnails keep their own thumb-size cache separate from this.
const fullRes = useImageObjectUrls()
const annotationsLoading = ref(false)
// Only surface the "Loading annotations" line once the wait is real: stepping to a cached image
// resolves in a frame or two, and an overlay that blinks on and off in that time reads as a glitch.
const showAnnotationsLoading = useDelayedFlag(annotationsLoading)

/** Re-fetch the bytes for the open image, for the canvas's failure state. */
const retryImage = async () => {
    const image = selectedImage.value
    if (!image) return
    imageUrl.value = null
    imageError.value = null
    fullRes.forget(image.id) // drop the failed entry so this actually refetches
    await showFullRes(image)
}

/**
 * Load the open image's full-res bytes and put it on the canvas. Loads on demand - there is no
 * neighbour prefetch - and forgets every other cached image, so only the open one is held.
 */
const showFullRes = async (image: LibraryImage) => {
    await fullRes.load(image.id, undefined, image.content_hash)
    if (image.id !== selectedImageId.value) return // navigated on while this was loading
    // Drop any previously-opened image so the cache holds just this one.
    for (const id of Object.keys(fullRes.urls.value)) {
        if (Number(id) !== image.id) fullRes.forget(Number(id))
    }
    const failure = fullRes.errors.value[image.id]
    if (failure) {
        imageError.value =
            failure === 'forbidden'
                ? 'You are not allowed to view this image.'
                : 'Could not load this image.'
    } else {
        imageUrl.value = fullRes.urls.value[image.id] ?? null
    }
}

// ---- shapes and history --------------------------------------------------------------------------

const shapes = ref<Shape[]>([])
const selectedShapeId = ref<string | null>(null)

/**
 * The class the strip highlights: a selected shape's own class, else the armed class.
 *
 * In the shapes sheet the strip RECLASSES the selected shape (pickClass reroutes to it), so it must
 * mark that shape's current class rather than the armed one - and the highlight jumping to the tapped
 * chip is the confirmation the reclass took. Null for a selected-but-unlabelled shape, which is the
 * honest answer and leaves nothing marked.
 */
const selectedShapeLabelId = computed(() =>
    selectedShapeId.value
        ? (shapes.value.find((shape) => shape.id === selectedShapeId.value)?.labelId ?? null)
        : activeLabelId.value,
)

const history = ref<Shape[][]>([[]])
const historyIndex = ref(0)

const snapshot = (value: Shape[]): Shape[] =>
    value.map((shape) => ({ ...shape, polygon: shape.polygon?.map((p) => ({ ...p })) ?? null }))

/**
 * The set as it was last read from or written to the server.
 *
 * Compared as the PAYLOAD rather than as shapes, so local-only differences - a throwaway id, a
 * point object rebuilt by a snapshot - cannot read as unsaved work. What matters is whether what
 * would be sent has changed.
 */
/**
 * The set as the server last returned it, kept as SHAPES rather than a fingerprint.
 *
 * Ids are what make an edit countable: a moved box keeps its id, so it is one change rather than a
 * deletion plus an addition. Seeded from the loaded set, so a freshly opened image is never dirty.
 */
const baseline = ref<Shape[]>([])

const edits = computed(() => diffAnnotations(shapes.value, baseline.value))

const isDirty = computed(() =>
    hasUnsavedAnnotations({
        hasImage: selectedImageId.value !== null,
        shapes: shapes.value,
        baseline: baseline.value,
    }),
)

const resetHistory = (loaded: Shape[]) => {
    shapes.value = loaded
    history.value = [snapshot(loaded)]
    historyIndex.value = 0
    selectedShapeId.value = null
    baseline.value = snapshot(loaded)
}

const commit = () => {
    // A commit with nothing new in it is dropped entirely. See `shouldCommit`: the canvas emits a
    // commit at the end of every gesture that was not a pan, so a click that only selected a shape
    // used to truncate the redo branch and put an identical snapshot on the stack.
    if (!shouldCommit(history.value[historyIndex.value], shapes.value)) return
    // Everything after the current point is dropped: editing after an undo forks, and keeping the
    // abandoned branch reachable by Redo is how a redo puts back something you did not do.
    history.value = [...history.value.slice(0, historyIndex.value + 1), snapshot(shapes.value)]
    historyIndex.value = history.value.length - 1
}

// ---- pick-then-draw ------------------------------------------------------------------------------
// The staff flow used to be name-after-draw; a new box now inherits the active class instead, the
// way the student annotator does. `knownShapeIds` is the set that existed when the image opened (or
// after a seed/import/restore), so only boxes drawn from here on are auto-labelled and a class
// cleared or renamed later is left alone.
let knownShapeIds = new Set<string>()
const seedKnownShapes = () => {
    knownShapeIds = new Set(shapes.value.map((shape) => shape.id))
}
const labelNewShapes = () => {
    if (applyActiveLabel(shapes.value, knownShapeIds, palette.value, activeLabelId.value)) commit()
}
watch(shapes, labelNewShapes, { deep: true })

// Keep the palette's pending rows in step with what the picker shows, so a class never lingers
// invisibly (or as dead weight in the draft cache): a pending row stays only while it is on the open
// image or still staged, which is exactly the rule `classes` displays by. Only pending (never-saved,
// negative-id) rows are touched; a SAVED class is the accumulated vocabulary and is left alone. This
// is what makes "name a box, delete the box" drop the count-0 class, while a staged "New class"
// survives until its first box.
const prunePendingClasses = () => {
    const onImage = labelIdsOnImage.value
    // One-shot shield: once a staged row carries a box it becomes an ordinary pending row, so drop it
    // from the shield here — a later delete of that box then prunes it like any other.
    for (const id of stagedClassIds) if (onImage.has(id)) stagedClassIds.delete(id)
    const kept = palette.value.filter(
        (entry) => !isPending(entry.id) || onImage.has(entry.id) || stagedClassIds.has(entry.id),
    )
    if (kept.length !== palette.value.length) palette.value = kept
    // Disarm the pick once its class is no longer SHOWN — its boxes are gone (deleting an image's
    // last box of a class, or all of them) and it is not a staged new class. This keeps the invariant
    // that the armed class is always in the picker or nothing is armed, so the next box drawn on an
    // emptied image starts unlabelled instead of silently taking a class not on the image.
    if (
        activeLabelId.value !== null &&
        !onImage.has(activeLabelId.value) &&
        !stagedClassIds.has(activeLabelId.value)
    )
        activeLabelId.value = null
}
watch([shapes, activeLabelId], prunePendingClasses, { deep: true })

// ---- local cache (unsaved work) ------------------------------------------------------------------
// A per-image localStorage cache so a refresh or tab close does not lose boxes drawn inside the
// throttled autosave window; on reopen the page offers to restore it. See useImageAnnotationDraft.
const imgDraft = useImageAnnotationDraft()

/** The pending (local, not-yet-minted) classes, for the draft so a restore keeps their colours. */
const pendingClasses = (): DraftClass[] =>
    palette.value
        .filter((entry) => isPending(entry.id))
        .map((entry) => ({ label: entry.label, color: entry.color_hex }))

const writeDraft = () => {
    const id = selectedImageId.value
    if (id === null) return
    // Only while there is unsaved work: a clean image needs no cache, and clearing it here means an
    // undo back to the saved state drops the draft too.
    if (isDirty.value)
        imgDraft.save(id, { shapes: toDraftShapes(shapes.value), pendingClasses: pendingClasses() })
    else imgDraft.clear(id)
}

// Cheap and frequent (localStorage only); the throttled SERVER save is separate, below.
watchDebounced([shapes, palette], writeDraft, { deep: true, debounce: 300, maxWait: 1500 })

// A cached pass waiting on the restore prompt, and whether the prompt is open.
const pendingRestore = ref<ImageAnnotationDraft | null>(null)
const restoreOpen = ref(false)

const applyRestore = () => {
    const cached = pendingRestore.value
    restoreOpen.value = false
    pendingRestore.value = null
    if (!cached || cached.imageId !== selectedImageId.value) return
    // Recreate the pending classes locally (dedup by name) so the boxes can resolve their ids.
    for (const klass of cached.pendingClasses) ensureLocalLabel(klass.label, klass.color)
    shapes.value = draftShapesToShapes(
        cached.shapes,
        (name) => labelByName(palette.value, name)?.id ?? null,
        () => localId('shape'),
    )
    commit() // one undoable step; baseline stays the server set, so the image reads dirty
    seedKnownShapes()
    toast.success('Restored your unsaved work.')
}

const discardRestore = () => {
    if (pendingRestore.value) imgDraft.clear(pendingRestore.value.imageId)
    pendingRestore.value = null
    restoreOpen.value = false
}

const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

const restore = (index: number) => {
    historyIndex.value = index
    const previous = selectedShapeId.value
    shapes.value = snapshot(history.value[index]!)
    selectedShapeId.value = shapes.value.some((shape) => shape.id === previous) ? previous : null
}

/**
 * Take the server's version of the set WITHOUT throwing the history away.
 *
 * Saving used to call `resetHistory`, which is right for opening an image and wrong for saving one:
 * a save changes what is PERSISTED, not what you did, and undo should still reach the edits that
 * led here. It was survivable while saving was a deliberate act; with auto-save it happens every
 * second or so, which silently made undo useless.
 *
 * The current entry is replaced rather than appended, because the server's copy and the local one
 * are the same work - it recomputes a polygon's extent and reissues every id, so this is the same
 * state under different names. Anything ahead of it goes, exactly as an ordinary commit would.
 */
const adoptSaved = (saved: Shape[]) => {
    // Selection follows POSITION, not id. A replace-all write reissues every id, so the shape you
    // had selected is still on screen under a new name; dropping the selection on every save was
    // tolerable when you asked for the save and is not when it happens on a timer.
    const at = shapes.value.findIndex((shape) => shape.id === selectedShapeId.value)
    shapes.value = saved
    history.value = [...history.value.slice(0, historyIndex.value), snapshot(saved)]
    historyIndex.value = history.value.length - 1
    baseline.value = snapshot(saved)
    selectedShapeId.value = at === -1 ? null : (saved[at]?.id ?? null)
}

const undo = () => canUndo.value && restore(historyIndex.value - 1)
const redo = () => canRedo.value && restore(historyIndex.value + 1)

const canvas = useTemplateRef<InstanceType<typeof AnnotationCanvas>>('canvas')

/**
 * Undo, including the polygon still being drawn.
 *
 * A draft ring has no id and never enters the history, so plain undo cannot reach it - and reaching
 * PAST it to the last committed shape while its points are on screen is worse than doing nothing.
 */
const undoStep = () => {
    if (canvas.value?.hasDraft) canvas.value.undoDraftPoint()
    else undo()
}

const canUndoAny = computed(() => Boolean(canvas.value?.hasDraft) || canUndo.value)

/** Both panels away: the shell swaps to the dark two-column layout and the overlays take over. */
const focus = computed(() => !leftOpen.value && !rightOpen.value)

/*
 * The app nav goes while focus mode is on.
 *
 * A side effect on an element this page does not own, so it is a watcher rather than derived state:
 * the nav lives in the layout, above the router view. Cleared in onBeforeUnmount as well, since
 * leaving the route mid-focus would otherwise strand every other page without navigation.
 */
watchEffect(() => {
    document.documentElement.classList.toggle(HIDE_NAV_CLASS, focus.value)
})

// The shell decides its own columns from the same composable; the page needs the canvas flag plus
// `layout`, because in medium the queue is a drawer with no docked column and so needs its own way
// open from the header.
const { isTouchLayout, stacked, layout } = useAnnotatorLayout()

/** The queue as a drawer, and the shape list as a sheet, for the stacked layouts. */
const queueSheetOpen = ref(false)
const shapesSheetOpen = ref(false)

/**
 * The KEYBOARD route to delete, which is not the delete tool.
 *
 * The tool is cursor-driven. This acts on the current SELECTION, so it works without leaving the
 * tool being drawn with, and it is the only route for a shape selected from the labels panel.
 */
const deleteSelected = () => canvas.value?.deleteSelection()

const patchShape = (id: string, patch: Partial<Shape>) => {
    const index = shapes.value.findIndex((shape) => shape.id === id)
    if (index === -1) return
    shapes.value[index] = { ...shapes.value[index]!, ...patch } as Shape
}

const updateShape = (id: string, patch: Partial<Shape>) => {
    patchShape(id, patch)
    commit()
}

const removeShape = (id: string) => {
    shapes.value = shapes.value.filter((shape) => shape.id !== id)
    if (selectedShapeId.value === id) selectedShapeId.value = null
    commit()
}

// ---- selecting an image ----------------------------------------------------------------------------

/**
 * Guard before anything that throws away the current pass.
 *
 * The write is REPLACE-ALL, so leaving with unsaved shapes is not a partial save, it is no save at
 * all. `window.confirm` rather than a dialog because it also has to work from a route guard, which
 * cannot await a component that has already started unmounting.
 *
 * On a confirmed discard the local cache is CLEARED as well - otherwise the continuously-written
 * cache would offer the just-discarded work back on the next open. A refresh or tab close is not a
 * discard and keeps the cache (that is the safety net); only saying "yes, throw it away" clears it.
 */
const confirmDiscard = () => {
    if (!isDirty.value) return true
    const discard = window.confirm('You have unsaved annotations on this image. Discard them?')
    if (discard && selectedImageId.value !== null) imgDraft.clear(selectedImageId.value)
    return discard
}

const openImage = async (image: LibraryImage) => {
    selectedImageId.value = image.id
    selectedImage.value = image
    imageError.value = null
    annotationsLoading.value = true
    // Paint from the cache on the rare hit (re-opening the same image), else clear and load below.
    // FULL RESOLUTION, never `?size=thumb` - a 256px downscale would bake into the exported dataset.
    imageUrl.value = fullRes.urls.value[image.id] ?? null
    resetHistory([])
    // Per-image view state. Hiding is a reading aid for one picture, and a seeded review does not
    // carry across to the next image.
    hiddenIds.value = new Set()
    seeded.value = {}
    // A class typed into "New class" but never drawn on the image you made it on does NOT follow you
    // to the next image: dropping its shield here lets prunePendingClasses discard it, so each
    // image's list is its own (an undrawn, never-saved class is only a name, nothing to carry over).
    stagedClassIds.clear()
    // Drop any restore prompt still open for the image being left, so it cannot apply to this one.
    restoreOpen.value = false
    pendingRestore.value = null

    void showFullRes(image)

    try {
        const views = await annotationService.list(image.id)
        // Reveal the classes this image introduces before resolving its boxes, so each one finds its
        // id and colour in the now-grown palette instead of reading back unnamed.
        accumulateClasses(views.map((view) => view.label))
        const loaded = toShapes(views, labelIdFor)
        resetHistory(loaded)
        // The pick follows the image, and ONLY this image. It becomes the image's own dominant class,
        // or nothing when the image has no boxes — the pick is not carried over from the last image.
        // Otherwise the first box drawn on a blank image would silently take the previous image's
        // class, which is exactly the "old class shows up on a fresh image" bug.
        activeLabelId.value = dominantLabelId(loaded)
        seedKnownShapes() // the loaded set is "known"; pick-then-draw only touches new boxes
        // Unsaved work cached from a previous session? Offer to restore it, but only when it really
        // differs from the saved set - otherwise the cache is stale and is dropped silently.
        const cached = imgDraft.load(image.id)
        if (cached && draftSignature(cached.shapes) !== draftSignature(toDraftShapes(loaded))) {
            pendingRestore.value = cached
            restoreOpen.value = true
        } else if (cached) {
            imgDraft.clear(image.id)
        }
    } catch (error) {
        /*
         * A CLIENT BUG IS NOT A FAILED REQUEST, and this block used to report it as one: a
         * dead-zone `ReferenceError` came out as "Could not load the annotations" on every arrival
         * from the library, about a request that had in fact succeeded.
         *
         * Rethrowing was the first fix and the wrong one. `openImage` is awaited at the top level
         * of setup on the deep-link path, so a throw here does not surface an error - it stops the
         * page rendering at all. So the page survives and the toast carries the REAL message
         * instead, which is what points whoever sees it at this file rather than at the server.
         * (`no-console` is an error in this repo, so the toast is the only channel there is.)
         */
        const bug = error instanceof ReferenceError || error instanceof TypeError
        toast.error(
            bug
                ? `Something went wrong opening this image: ${(error as Error).message}`
                : apiErrorMessage(error, 'Could not load the annotations'),
        )
    } finally {
        annotationsLoading.value = false
    }
}

/**
 * Changing image SAVES first. It does not ask, and it does not discard.
 *
 * The confirm that used to live here was the wrong question. Walking the queue is the ordinary
 * motion of this page - down the list, one image at a time - and a dialog on every step is a
 * dialog people learn to dismiss without reading, which is exactly how work gets thrown away. There
 * is nothing to decide: the edits are wanted, or they would not have been drawn.
 *
 * A FAILED SAVE KEEPS YOU HERE. `save()` has already said why in a toast, and moving on would leave
 * the edits behind on an image nobody is looking at any more.
 *
 * `confirmDiscard` still guards leaving the ROUTE, where there is no next image to save into and
 * the browser is about to take the tab.
 */
const selectImage = async (id: number) => {
    if (id === selectedImageId.value) return
    // A save already in flight - the auto-save can fire on the idle timer, so a step lands inside
    // one occasionally. `save()` refuses to re-enter, so without this wait the step would see a
    // still-dirty image and refuse to move at all.
    if (isSaving.value) await until(isSaving).toBe(false)
    if (isDirty.value) {
        await save()
        if (isDirty.value) return
    }
    const image = images.value.find((row) => row.id === id)
    if (image) await openImage(image)
}

/**
 * `?image=<id>` is how the library's Annotate button arrives here. Selecting several sends the id
 * repeated (`?image=1&image=2&…`), so this reads a LIST: a single deep link is just the one-element
 * case. Order and duplicates are preserved-then-deduped so the first stays the one that opens.
 */
const linkedImageIds = computed(() => {
    const raw = route.query.image
    const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
    const ids = list.map((value) => Number(value)).filter((id) => Number.isInteger(id) && id > 0)
    return [...new Set(ids)]
})

// Albums for the source picker. The strip itself stays empty until a source is chosen (or a
// `?image=` link opens one image directly, handled below).
try {
    albums.value = await albumService.list()
} catch {
    // Non-fatal: without the list the picker just offers "All images", which still loads.
}

/*
 * The reference set of stored classes, before anything is drawn. NOT the picker: `palette` starts
 * empty and grows as visited images reveal their classes (accumulateClasses). This list only exists
 * so an accumulated class resolves to its authored id and colour, since an annotation read carries a
 * label's text but not its id.
 *
 * AWAITED, so the first image opened during setup (the library's `?image=` deep link) already has it
 * to draw from. Cheap enough to wait for: one person's palette is a bounded list, where the old
 * approach downloaded the entire labelled dataset to guess at the same thing.
 *
 * `hide_orphan` keeps this to classes actually in use, rather than everything ever typed. It is asked
 * ONCE, here, and nowhere else: a label is an orphan until a box carrying it has been SAVED, and
 * re-reading with the flag mid-session would drop exactly the class being used, which is why the
 * later reads in `flushPendingLabels` are unfiltered. Nothing that can appear on an image is lost:
 * every class on a saved box is by definition non-orphan and so present here.
 *
 * Not fatal, though. A list that fails to load leaves accumulation empty and the drawing tools
 * working, which is a worse pass but not a broken page.
 */
try {
    allLabels.value = await annotationLabelService.list({ hideOrphan: true })
} catch (error) {
    toast.error(apiErrorMessage(error, 'Could not load your classes'))
}

if (linkedImageIds.value.length) {
    // Fetch each linked row that is not already in the strip (a single deep link usually is not,
    // since the source starts empty) and put the whole batch at the front, so the filmstrip shows
    // exactly the selection the library handed over. Rows are fetched in parallel but placed back in
    // the requested order; a row that fails to load is dropped rather than sinking the whole batch.
    try {
        const have = new Map(images.value.map((row) => [row.id, row]))
        const settled = await Promise.allSettled(
            linkedImageIds.value.map(async (id) => have.get(id) ?? (await imageService.get(id))),
        )
        const batch = settled
            .filter(
                (result): result is PromiseFulfilledResult<LibraryImage> =>
                    result.status === 'fulfilled',
            )
            .map((result) => result.value)
        const failed = settled.length - batch.length
        if (failed) {
            toast.error(`Could not open ${failed} of ${settled.length} image(s).`)
        }
        const batchIds = new Set(batch.map((row) => row.id))
        images.value = [...batch, ...images.value.filter((row) => !batchIds.has(row.id))]
        const first = batch[0]
        if (first) await openImage(first)
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not open those images'))
    }
}

// ---- saving --------------------------------------------------------------------------------------

const isSaving = ref(false)

// ---- reviewed, and the queue's per-image status ---------------------------------------------------

/**
 * `metadata.reviewed`, which is where "this image is done" lives for now.
 *
 * `images.metadata` is an open flat bag with a PATCH, so this persists today without a schema
 * change. It is a placeholder for a first-class field, and it is the one piece of app state
 * currently hiding in a free-form column - flagged rather than forgotten.
 */
const isReviewed = (image: LibraryImage) => image.metadata?.reviewed === true

const markReviewed = async (value: boolean) => {
    const image = selectedImage.value
    if (!image) return
    try {
        const updated = await imageService.updateMetadata(image.id, { reviewed: value || null })
        selectedImage.value = updated
        const index = images.value.findIndex((row) => row.id === image.id)
        if (index !== -1) images.value[index] = updated
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not update the image'))
    }
}

/**
 * The image's metadata bag, edited from the meta card the same way the library's detail panel edits
 * it (BE-ADR-031). The patch is changed-keys-only (metadataPatch), a shallow merge the server
 * applies over whatever else the bag holds, so editing here and in the library cannot clobber each
 * other's keys.
 */
const saveMetadata = async (patch: Record<string, unknown>) => {
    const image = selectedImage.value
    if (!image) return
    try {
        const updated = await imageService.updateMetadata(image.id, patch)
        selectedImage.value = updated
        const index = images.value.findIndex((row) => row.id === image.id)
        if (index !== -1) images.value[index] = updated
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not save the metadata'))
    }
}

/** How many shapes differ from the last save, for the header and the queue row. */
/** A real count of what changed, not the shape total. See diffAnnotations. */
const unsavedEdits = computed(() => (selectedImageId.value === null ? 0 : edits.value.total))

const queueViews = computed(() =>
    Object.fromEntries(
        images.value.map((image) => [
            image.id,
            queueRowView({
                annotationCount: image.annotation_count,
                reviewed: isReviewed(image),
                seededUnreviewed: seededImages.value.has(image.id),
                unsavedEdits: image.id === selectedImageId.value ? unsavedEdits.value : 0,
            }),
        ]),
    ),
)

/*
 * ANY library image may be annotated. There is deliberately no curated check here.
 *
 * Annotating used to require the image to be in a `curated` album, which inverted the workflow it
 * was meant to protect: deciding a picture is worth labelling is usually what leads to curating it,
 * not the reverse. We reported that, BE-ADR-030 was amended on 2026-08-26, and the server dropped
 * the guard from both annotation writers. `curated` now gates question authoring and nothing else,
 * so `in_curated_album` is a badge in the library rather than a gate here.
 */
const canSave = computed(() => Boolean(selectedImage.value) && isDirty.value && !isSaving.value)

/**
 * `auto` marks the debounced writer, and the only thing it changes is the success toast.
 *
 * A person who pressed Save asked a question and is owed an answer. Auto-save asked nothing: it
 * fires every time the drawing pauses, so the same toast becomes a notification every few seconds
 * for something nobody requested. The header's "N unsaved" counter dropping to zero is the ambient
 * version of the same fact, and it is already on screen.
 *
 * FAILURES STILL TOAST EITHER WAY. A silent auto-save that silently fails is the one combination
 * that loses work.
 */
const save = async ({ auto = false }: { auto?: boolean } = {}) => {
    const image = selectedImage.value
    if (!image || isSaving.value) return

    if (toAnnotationPayload(shapes.value).annotations.length > MAX_ANNOTATIONS) {
        toast.error(`An image is limited to ${MAX_ANNOTATIONS} annotations.`)
        return
    }
    // *** AN UNNAMED SHAPE IS SAVED, NOT REFUSED. *** `label_id` is nullable on
    // `image_annotations` (BE-ADR-038), so a box with no class is a valid stored row rather than a
    // malformed one. This used to bounce the whole write over one, which cost more than it
    // protected: twenty outlines drawn and nineteen named meant none of them persisted. Naming is
    // now a step that can follow the geometry, and the toast below says how many are still owed.
    isSaving.value = true
    try {
        // Deferred label mint (BE-ADR-030, FE side): the pending (local) classes this image uses are
        // created on the server now, batched, and their ids remapped onto the shapes before the
        // annotation write - so a class costs one POST per save instead of one the moment it was named.
        const remap = await flushPendingLabels(shapes.value)
        if (remap.size) {
            shapes.value = shapes.value.map((s) =>
                isPending(s.labelId) && remap.has(s.labelId)
                    ? { ...s, labelId: remap.get(s.labelId)! }
                    : s,
            )
            if (isPending(activeLabelId.value) && remap.has(activeLabelId.value))
                activeLabelId.value = remap.get(activeLabelId.value)!
        }
        // Re-read the response rather than trusting local state: a polygon's extent is recomputed
        // server-side, so the stored box can differ from the one that was sent.
        const saved = await annotationService.replace(
            image.id,
            toAnnotationPayload(shapes.value).annotations,
        )
        const reloaded = toShapes(saved, labelIdFor)
        adoptSaved(reloaded)
        imgDraft.clear(image.id) // the work is on the server now; drop the local cache
        // Saving ends the review: the ids the confidences were keyed to are gone, and a persisted
        // set is no longer "model output nobody has read".
        seeded.value = {}
        seededImages.value = new Set([...seededImages.value].filter((id) => id !== image.id))
        // The strip's badge is derived from this count, so the row has to move with the save.
        const index = images.value.findIndex((row) => row.id === image.id)
        const updated = { ...image, annotation_count: saved.length }
        if (index !== -1) images.value[index] = updated
        selectedImage.value = updated
        // The unnamed ones are named in the toast rather than refused before it. They are saved
        // either way; what this buys is that someone who meant to name one finds out now, while
        // the image is still open, instead of at export.
        if (!auto) {
            const unnamed = saved.filter((row) => row.label === null).length
            toast.success(
                unnamed > 0
                    ? `Saved ${saved.length} annotation(s), ${unnamed} without a class.`
                    : `Saved ${saved.length} annotation(s).`,
            )
        }
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not save the annotations'))
    } finally {
        isSaving.value = false
    }
}

/**
 * Auto-save: write after the drawing has been idle for a while.
 *
 * DEBOUNCED to 20s of inactivity, deliberately long. The point is to cut server calls: the local
 * cache holds the work meanwhile (so a refresh is safe), and the write is REPLACE-ALL plus a batched
 * label mint, so firing it per pause the way a 1.5s debounce did was needless chatter. `maxWait`
 * still forces one through during a long unbroken pass so continuous work is not left entirely
 * unsaved waiting for a pause that never comes.
 *
 * Guarded on `canSave`, which already covers "an image is open", "there is something to save" and
 * "a save is not already in flight", so this cannot re-enter itself: the save resets the baseline,
 * `canSave` goes false, and the watcher has nothing left to fire on.
 */
watchDebounced(
    () =>
        [
            autoSave.value,
            canSave.value,
            edits.value.total,
            // Never mid-rename. A label field is open with a partial word in it, and a stray key
            // that lands in one is exactly how a class got rewritten during testing; persisting
            // that a second later turns a slip into stored data.
            Boolean(canvas.value?.editingLabel),
        ] as const,
    ([on, can, total, editing]) => {
        if (on && can && total > 0 && !editing) void save({ auto: true })
    },
    { debounce: 20000, maxWait: 60000 },
)

// Flush the local cache synchronously if the tab is closing mid-edit - the throttled server save
// may not have fired yet, and a beforeunload cannot await a network write. The next open recovers
// it via the restore prompt. NOT called on unmount: an SPA route leave runs `confirmDiscard`, and
// re-caching there would resurrect work the person just chose to discard; the 300ms writer has
// already cached anything worth keeping.
const flushDraftOnUnload = () => writeDraft()
onMounted(() => window.addEventListener('beforeunload', flushDraftOnUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', flushDraftOnUnload))

onBeforeRouteLeave(() => confirmDiscard())

// ---- seeding from a run ----------------------------------------------------------------------------

const shortcutsOpen = ref(false)
const seedOpen = ref(false)
const seeding = ref(false)
/** The last model seeded from, shown in the header so it is readable without opening anything. */
const lastRun = ref<string | null>(null)

/**
 * Run a model, then copy its boxes in.
 *
 * Two calls rather than one because the server splits them, and re-running is cheap: an identical
 * image under an identical model pair reuses the stored result and never reaches the worker
 * (BE-ADR-024). That is what makes "pick a model and run" a better affordance than a list of past
 * runs - it reaches the same cached output without anyone having to choose between rows.
 */
const runAndSeed = async ({
    model,
    segmentModel,
    minConfidence,
}: {
    model: string
    segmentModel?: string | null
    minConfidence?: number
}) => {
    const image = selectedImage.value
    if (!image || seeding.value) return
    seeding.value = true
    try {
        const detection = await imageService.detect(image.id, model, segmentModel, minConfidence)

        // Checked here rather than left to the server's 400, because "the model found nothing" is
        // an ordinary outcome for these detectors and deserves plain words. YOLO26m returns nothing
        // on roughly a quarter of fields even at the lowered floor, and a blank result is a CORRECT
        // answer that reads exactly like a failure.
        const boxes = detection.steps.reduce((total, step) => total + step.boxes.length, 0)
        if (!boxes) {
            toast.error('That model found nothing in this image. Try another, or draw by hand.')
            return
        }

        // Seeded from the run's OWN boxes rather than through the seed endpoint, because those
        // carry the confidence and annotations do not. See shapesFromDetection.
        const all = detection.steps.flatMap((step) => step.boxes)
        // Each model class becomes a palette label first (locally now - the server mint is deferred
        // to save), so a seeded box carries a `label_id` from the start.
        for (const name of new Set(all.map((box) => box.label))) ensureLocalLabel(name)
        const { shapes: seededShapes, confidence } = shapesFromDetection(
            all,
            defaultCurated.value,
            labelIdFor,
        )
        resetHistory(seededShapes)
        seedKnownShapes() // seeded shapes already carry classes; keep pick-then-draw off them
        seeded.value = confidence
        seededImages.value = new Set(seededImages.value).add(image.id)
        lastRun.value = model
        seedOpen.value = false
        toast.success(`Seeded ${boxes} box(es). Accept or reject each, then save.`)
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not run that model'))
    } finally {
        seeding.value = false
    }
}

// ---- import / export (BE-ADR-030) ----------------------------------------------------------------

/**
 * Save one image's boxes to a portable, normalized file, and load one back onto WHATEVER image is
 * open the "template onto any image" flow. Export is a plain client-side download; import overlays
 * the file's boxes onto the current set and mints any label the palette does not yet hold, exactly
 * as a seeded run does. The ordinary save path (replace-all PUT) then persists it.
 *
 * The dataset/training export is a different feature living server-side (COCO, many images); this is
 * the per-image interchange a person keeps or shares.
 */
const importInput = useTemplateRef<HTMLInputElement>('import-input')

const exportAnnotations = () => {
    const image = selectedImage.value
    if (!image || !shapes.value.length) return
    const file = serializeAnnotations(
        shapes.value,
        image.id,
        (shape) => colorForShape(palette.value, shape)?.replace(/^#/, '') ?? null,
    )
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `annotations-img${image.id}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${file.annotations.length} box(es).`)
}

const onImportFile = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const picked = input.files?.[0]
    // Cleared at once so re-importing the SAME file fires `change` again.
    input.value = ''
    if (!picked) return
    const image = selectedImage.value
    if (!image) return

    let parsed
    try {
        parsed = parseAnnotationsFile(JSON.parse(await picked.text()))
    } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not read that file.')
        return
    }
    if (!parsed.annotations.length) {
        toast.error('That file has no boxes to import.')
        return
    }
    if (shapes.value.length + parsed.annotations.length > MAX_ANNOTATIONS) {
        toast.error(`That would exceed the ${MAX_ANNOTATIONS}-box limit for one image.`)
        return
    }

    // Create a palette label per name first (locally, keeping the file's colour), so an imported box
    // carries a `label_id`; the server mint is deferred to save with every other pending class.
    for (const entry of parsed.annotations) {
        if (entry.label) ensureLocalLabel(entry.label, entry.color ?? undefined)
    }
    const imported = shapesFromFile(parsed.annotations, labelIdFor)
    // Overlaid, not replaced: a template drops ON TOP of whatever is there. `commit` makes it one
    // undoable step and marks the image dirty for the ordinary save.
    shapes.value = [...shapes.value, ...imported]
    commit()
    seedKnownShapes() // imported shapes carry their own classes; keep pick-then-draw off them
    toast.success(`Imported ${imported.length} box(es). Review, then save.`)
}

// ---- the keyboard ----------------------------------------------------------------------------------

/**
 * Every binding routes through here, which is the point of one composable: the map is a tested
 * table, and this is the only place that says what each entry DOES.
 *
 * Disabled while a dialog is open, or `?` would close and reopen its own sheet and `s` would save
 * behind it.
 */
const modalOpen = computed(() => seedOpen.value || shortcutsOpen.value || restoreOpen.value)

const onHotkey = (action: HotkeyAction) => {
    switch (action.type) {
        case 'tool':
            tool.value = action.tool
            return
        case 'class': {
            const picked = classForDigit(classes.value, action.digit)
            if (picked) pickClass(picked.id)
            return
        }
        // A row, which is one image in list mode and a whole line of three in grid mode.
        case 'next-image':
            return step(queueColumns.value)
        case 'previous-image':
            return step(-queueColumns.value)
        // Sideways, which only exists in grid mode: in a list it would be a step of zero.
        case 'next-column':
            return queueColumns.value > 1 ? step(1) : undefined
        case 'previous-column':
            return queueColumns.value > 1 ? step(-1) : undefined
        case 'save':
            return void save()
        case 'review':
            return void markReviewed(!(selectedImage.value?.metadata?.reviewed === true))
        case 'fit':
            return canvas.value?.fit()
        case 'visibility':
            return toggleAllHidden()
        case 'focus':
            return toggleFocus()
        case 'close-shape':
            return canvas.value?.closePolygon()
        case 'cancel-shape':
            return canvas.value?.cancelDraft()
        case 'delete':
            return deleteSelected()
        case 'undo':
            return undoStep()
        case 'redo':
            return redo()
        case 'shortcuts':
            shortcutsOpen.value = true
            return
        case 'search':
            queue.value?.focusSearch()
            leftOpen.value = true
    }
}

const { spacePanning } = useAnnotatorHotkeys({
    onAction: onHotkey,
    enabled: computed(() => !modalOpen.value),
})

/**
 * Focus mode collapses BOTH panels, and restores both.
 *
 * Distinct from the header's toggle, which collapses the queue alone: "give me more canvas" and
 * "hide the list I am working through" are different intentions and one control cannot mean both.
 */
/**
 * Toggle the app nav from the annotator's own toolbar.
 *
 * Through the ref, not `setOpen`, so it does not write the week-long `sidebar_state` cookie - this
 * is a preference for the current visit, and the value the user had on arrival is restored on the
 * way out. `navWasOpen` tracks the intent so that restore is correct.
 */
const toggleNav = () => {
    // Below 1280 the app nav is a Sheet keyed off `openMobile`, not the docked `open` a desktop
    // toggles - without this branch the button on a phone or tablet flipped a state nothing shows,
    // which is why the page could only be left with the browser's back button.
    if (sidebar.isMobile.value) {
        sidebar.setOpenMobile(!sidebar.openMobile.value)
        return
    }
    const next = !sidebar.open.value
    sidebar.open.value = next
    navWasOpen = next
}

const toggleFocus = () => {
    const focused = !leftOpen.value && !rightOpen.value
    leftOpen.value = focused
    rightOpen.value = focused
    // The app nav counts as chrome too: focus mode that leaves 300px of navigation on screen has
    // not given the picture the space it promised. Through the ref again, so toggling focus mode
    // does not overwrite the saved preference.
    sidebar.open.value = focused ? navWasOpen : false
}

const queue = useTemplateRef<InstanceType<typeof ImageQueue>>('queue')

// ---- view plumbing ---------------------------------------------------------------------------------

/**
 * SELECT, not rectangle, is what the annotator opens on.
 *
 * Under the rectangle tool a one-finger drag DRAWS rather than pans (two fingers navigate), so on a
 * tablet every exploratory swipe across a fresh slide left a box behind before any decision to draw
 * had been made. Select pans on one finger, which is what looking at an image wants.
 *
 * The cost lands on the desktop, where a drag has always drawn and the mouse pans with Space: one
 * keystroke, `R`, before the first box of a session. The hotkeys are live here (unlike the student
 * workspace, which has none), and the tool then persists across images, so it is paid once.
 */
const tool = ref<Tool>('select')

const zoomPercent = computed(() =>
    canvas.value?.transform ? toPercent(canvas.value.transform) : 100,
)
const canZoom = computed(() => Boolean(canvas.value?.ready))

/** The canvas already compares this with a tolerance; re-deriving it here would drift. */
const atFit = computed(() => Boolean(canvas.value?.atFit))

/** Where the open image sits in the queue, for the pager. 1-based; 0 when nothing is open. */
/**
 * THE ORDER EVERYTHING ON THIS PAGE AGREES ON: oldest first, by id.
 *
 * `images` arrives in the server's order, which is newest first. The queue was quietly sorting it
 * back to ascending for display while the pager, `J`/`K` and the arrow keys stepped through the
 * server's order - so "next image" moved to the row ABOVE the one highlighted, and `23 / 24` counted
 * from the wrong end. One order, defined here, used by the list, the rail, the pager and the keys.
 */
const orderedImages = computed(() => [...images.value].sort((a, b) => a.id - b.id))

const position = computed(() =>
    selectedImageId.value === null
        ? 0
        : orderedImages.value.findIndex((row) => row.id === selectedImageId.value) + 1,
)

// The pager's filmstrip on a touch layout: the WHOLE loaded batch as square thumbnails, scrolled
// like an iPhone photo strip. Thumbnails are loaded lazily as a cell scrolls into view (revealThumb)
// rather than all at once, because a batch can run to hundreds of frames.
const pagerThumbs = useImageObjectUrls()
const revealThumb = (id: number) => {
    const image = orderedImages.value.find((row) => row.id === id)
    if (image) void pagerThumbs.load(image.id, 'thumb', image.content_hash)
}
const pagerStrip = computed(() =>
    orderedImages.value.map((image) => ({
        id: image.id,
        thumb: pagerThumbs.urls.value[image.id] ?? null,
        active: image.id === selectedImageId.value,
        // A failed thumb fetch shows a broken tile rather than a skeleton that never resolves.
        failed: Boolean(pagerThumbs.errors.value[image.id]),
    })),
)

// A short slide when the image changes: the new one eases in from the side it came from, so a step
// through the batch reads as motion rather than a hard swap. Played on the canvas WRAPPER via the
// Web Animations API so the canvas keeps its viewport and shapes - a re-key/remount would reset both.
const canvasSlide = useTemplateRef<HTMLElement>('canvasSlide')
watch(position, (to, from) => {
    if (!from || !to || to === from) return
    const el = canvasSlide.value
    if (!el || typeof el.animate !== 'function') return
    const from0 = to > from ? 6 : -6 // next comes in from the right, previous from the left
    // SLIDE ONLY, no opacity fade: fading over the dark canvas ground dimmed the whole panel toward
    // black and read as a blink. A pure push keeps the picture fully opaque the whole way in.
    el.animate(
        [{ transform: `translateX(${from0}%)` }, { transform: 'translateX(0)' }],
        // Decelerates into place (easeOutQuint), a touch longer than a hard swap so it reads as motion.
        { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
})

const currentName = computed(() =>
    selectedImage.value
        ? imageDisplayName(selectedImage.value.metadata, selectedImage.value.id)
        : '',
)

/**
 * How many images a row holds, straight from the queue rather than assumed here.
 *
 * The page owns the keyboard and holds no DOM, so the shape of the list is the queue's to report.
 * One when it is a list, three when it is a grid, and the arrow arithmetic is the same either way.
 *
 * Falls back to 1 wherever the docked queue is not mounted: focus mode, which has a rail instead,
 * and the stacked layouts, where the queue is a drawer with its own instance and its own mode. Both
 * are places a keyboard is unlikely to be the input anyway, and stepping by one is the safe reading
 * when the shape of the list is unknown.
 */
const queueColumns = computed(() => queue.value?.columns ?? 1)

const step = (delta: number) => {
    const next = orderedImages.value[position.value - 1 + delta]
    if (next) void selectImage(next.id)
}
</script>

<template>
    <AnnotatorShell v-model:left-open="leftOpen" v-model:right-open="rightOpen">
        <template #header>
            <AnnotatorHeader
                v-model:auto-save="autoSave"
                page-label="Image Annotator"
                :count="total"
                :unsaved-edits="unsavedEdits"
                :can-save="canSave"
                :saving="isSaving"
                :show-queue-toggle="layout === 'medium'"
                @toggle-nav="toggleNav"
                @open-queue="queueSheetOpen = true"
                @save="save()"
                @shortcuts="shortcutsOpen = true"
            >
                <template #actions>
                    <!-- Import, Export and Seed used to be three buttons on the toolbar. They are
                         one image's occasional data operations, not the primary loop (draw, class,
                         save), so they fold into a single menu that says what each one does rather
                         than spending three slots and their tooltips on the bar. -->
                    <McDropdownMenu>
                        <McDropdownMenuTrigger as-child>
                            <McButton
                                variant="outline"
                                size="sm"
                                title="Import, export, or seed this image's boxes"
                            >
                                <Shapes class="tw:h-4 tw:w-4" />
                                Boxes
                                <span
                                    v-if="lastRun"
                                    class="tw:ml-0.5 tw:max-w-24 tw:truncate tw:font-mono tw:text-[11px] tw:text-an-faint"
                                >
                                    {{ lastRun }}
                                </span>
                                <ChevronDown class="tw:h-3.5 tw:w-3.5 tw:text-an-faint" />
                            </McButton>
                        </McDropdownMenuTrigger>
                        <McDropdownMenuContent align="end" class="tw:w-72">
                            <McDropdownMenuItem
                                class="tw:items-start tw:gap-2.5 tw:py-2"
                                :disabled="!selectedImage"
                                @select="seedOpen = true"
                            >
                                <Sparkles class="tw:mt-0.5 tw:h-4 tw:w-4" />
                                <span class="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
                                    <span class="tw:text-[12.5px] tw:font-medium tw:text-an-text">
                                        Seed from run
                                    </span>
                                    <span class="tw:text-[11px] tw:text-an-faint">
                                        Run a model over this image and place its boxes for review.
                                    </span>
                                </span>
                            </McDropdownMenuItem>
                            <McDropdownMenuSeparator />
                            <McDropdownMenuItem
                                class="tw:items-start tw:gap-2.5 tw:py-2"
                                :disabled="!selectedImage"
                                @select="importInput?.click()"
                            >
                                <Upload class="tw:mt-0.5 tw:h-4 tw:w-4" />
                                <span class="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
                                    <span class="tw:text-[12.5px] tw:font-medium tw:text-an-text">
                                        Import
                                    </span>
                                    <span class="tw:text-[11px] tw:text-an-faint">
                                        Load boxes from a JSON file onto this image.
                                    </span>
                                </span>
                            </McDropdownMenuItem>
                            <McDropdownMenuItem
                                class="tw:items-start tw:gap-2.5 tw:py-2"
                                :disabled="!selectedImage || shapes.length === 0"
                                @select="exportAnnotations"
                            >
                                <Download class="tw:mt-0.5 tw:h-4 tw:w-4" />
                                <span class="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
                                    <span class="tw:text-[12.5px] tw:font-medium tw:text-an-text">
                                        Export
                                    </span>
                                    <span class="tw:text-[11px] tw:text-an-faint">
                                        Download this image's boxes to a JSON file.
                                    </span>
                                </span>
                            </McDropdownMenuItem>
                        </McDropdownMenuContent>
                    </McDropdownMenu>
                    <input
                        ref="import-input"
                        type="file"
                        accept="application/json,.json"
                        class="tw:hidden"
                        @change="onImportFile"
                    />
                    <div class="tw:mx-1 tw:h-5 tw:w-px tw:bg-an-divider"></div>
                </template>
            </AnnotatorHeader>
        </template>

        <template #header-compact>
            <!-- App navigation: the way OFF this page. A hamburger - the ordinary "menu" affordance
                 on a phone or tablet - distinct from the Images button beside it, so the two no
                 longer read as one duplicated sidebar. Opens the app-nav sheet (see toggleNav). -->
            <McButton
                variant="ghost"
                size="icon-sm"
                aria-label="Open the navigation menu"
                @click="toggleNav"
            >
                <Menu class="tw:h-4 tw:w-4" />
            </McButton>
            <div class="tw:flex tw:min-w-0 tw:flex-col">
                <span class="tw:truncate tw:font-mono tw:text-[12px] tw:text-an-text">
                    {{ currentName || 'No image' }}
                </span>
                <span class="tw:font-mono tw:text-[10.5px] tw:text-an-faint">
                    {{ position }} / {{ images.length }} · {{ shapes.length }} shapes
                </span>
            </div>
            <div class="tw:flex-1"></div>
            <McButton
                variant="ghost"
                size="icon-sm"
                :disabled="!selectedImage"
                aria-label="Seed from a model run"
                @click="seedOpen = true"
            >
                <Sparkles class="tw:h-4 tw:w-4" />
            </McButton>
            <!-- Grouped with Shapes on the right - the two panel-openers side by side - and off the
                 left, where it sat next to the hamburger and read as a second navigation. The queue
                 itself now slides up from the bottom rather than in from the left (see #sheets). -->
            <McButton
                variant="ghost"
                size="icon-sm"
                aria-label="Show the image queue"
                @click="queueSheetOpen = true"
            >
                <Images class="tw:h-4 tw:w-4" />
            </McButton>
            <McButton
                variant="ghost"
                size="icon-sm"
                aria-label="Shapes"
                @click="shapesSheetOpen = true"
            >
                <Shapes class="tw:h-4 tw:w-4" />
            </McButton>
            <McButton size="sm" :disabled="!canSave" :loading="isSaving" @click="save">
                Save
            </McButton>
        </template>

        <template #bottom-tools>
            <BottomTools
                :tool="tool"
                :can-undo="canUndoAny"
                :can-redo="canRedo"
                :can-delete="Boolean(selectedShapeId)"
                @update:tool="tool = $event"
                @undo="undoStep"
                @redo="redo"
                @delete-selected="deleteSelected"
            />
        </template>

        <template #bottom-classes>
            <ClassStrip
                :classes="classes"
                :active="activeLabelId"
                @pick="pickClass"
                @create="createClass"
                @edit="editClass"
            />
        </template>

        <template #sheets>
            <McSheet v-model:open="queueSheetOpen">
                <!--
                    `hide-close`, because the queue header already carries one: the sheet's own X
                    is pinned to the same top-right corner as the list/grid toggle, so the two sat
                    on top of each other, and the panel's collapse button is the dismiss anyway.
                -->
                <McSheetContent
                    side="bottom"
                    class="mc-slide-up tw:flex tw:max-h-[80dvh] tw:flex-col tw:rounded-t-2xl tw:p-0 tw:[touch-action:pan-x_pan-y]"
                    hide-close
                >
                    <ImageQueue
                        :images="orderedImages"
                        :views="queueViews"
                        :selected-id="selectedImageId"
                        :loading="imagesLoading"
                        :total="total"
                        :search="search"
                        :filter="queueFilter"
                        :albums="albums"
                        :source="source"
                        @select="
                            (id) => {
                                selectImage(id)
                                queueSheetOpen = false
                            }
                        "
                        @update:search="search = $event"
                        @update:filter="queueFilter = $event"
                        @update:source="source = $event"
                        @more="loadMore"
                        @collapse="queueSheetOpen = false"
                    />
                </McSheetContent>
            </McSheet>

            <McSheet v-model:open="shapesSheetOpen">
                <!-- Full screen height: shape mode is where the picture is judged against the list,
                     so it gets the whole viewport rather than a partial sheet. -->
                <McSheetContent
                    side="bottom"
                    class="mc-slide-up tw:flex tw:h-dvh tw:flex-col tw:bg-black tw:p-0 tw:[touch-action:pan-x_pan-y]"
                    hide-close
                >
                    <!-- The image itself, boxes drawn on it, above the list: the sheet covers the
                         canvas, so without this a shape is judged from its row alone. The picture is
                         the point of the review, so it leads - the same image-plus-overlay preview
                         the detection result and the library inspector show. A quarter of the screen,
                         so most of the height is the list. -->
                    <div
                        class="tw:relative tw:h-[25dvh] tw:shrink-0 tw:overflow-hidden tw:bg-black"
                    >
                        <img
                            v-if="imageUrl"
                            :src="imageUrl"
                            :alt="currentName"
                            class="tw:h-full tw:w-full tw:object-contain"
                        />
                        <svg
                            v-if="canvas?.natural && shapes.length"
                            class="tw:pointer-events-none tw:absolute tw:inset-0 tw:h-full tw:w-full"
                            :viewBox="`0 0 ${canvas.natural.w} ${canvas.natural.h}`"
                            preserveAspectRatio="xMidYMid meet"
                        >
                            <AnnotationOverlay
                                :shapes="shapes"
                                :natural="canvas.natural"
                                :palette="palette"
                            />
                        </svg>
                        <!-- A gradient at the foot of the picture, darkening into the shape card so
                             the seam between the two reads as one surface rather than a hard cut. -->
                        <div
                            class="tw:pointer-events-none tw:absolute tw:inset-x-0 tw:bottom-0 tw:h-16 tw:bg-gradient-to-t tw:from-black/55 tw:to-transparent"
                        ></div>
                        <!-- Close, top-right over the picture where a dismiss is looked for. -->
                        <button
                            type="button"
                            class="tw:absolute tw:top-2 tw:right-2 tw:flex tw:h-8 tw:w-8 tw:items-center tw:justify-center tw:rounded-full tw:bg-black/55 tw:text-white tw:backdrop-blur tw:hover:bg-black/70"
                            aria-label="Close shapes"
                            @click="shapesSheetOpen = false"
                        >
                            <X class="tw:h-4 tw:w-4" />
                        </button>
                    </div>
                    <!-- The list is the sheet's own surface: rounded at the top and pulled up over
                         the image, with an upward shadow so the curved edge lifts off the picture -
                         the picture full-bleed above, the shapes a card rising over it (the iOS
                         media-then-sheet shape). -->
                    <div
                        class="tw:relative tw:z-10 tw:-mt-4 tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:rounded-t-2xl tw:bg-an-panel tw:shadow-[0_-8px_24px_rgba(0,0,0,0.22)]"
                    >
                        <ShapeList
                            :shapes="shapes"
                            :palette="palette"
                            :selected-id="selectedShapeId"
                            :hidden-ids="hiddenIds"
                            :seeded="seeded"
                            :all-hidden="allHidden"
                            @select="selectedShapeId = $event"
                            @toggle-hidden="toggleHidden"
                            @toggle-all="toggleAllHidden"
                            @accept="acceptSeeded"
                            @reject="rejectSeeded"
                            @relabel="labelShape"
                            @seed="((shapesSheetOpen = false), (seedOpen = true))"
                            @draw-polygon="((shapesSheetOpen = false), (tool = 'polygon'))"
                        />
                        <ImageMetaCard
                            :image="selectedImage"
                            :reviewed="
                                selectedImage ? selectedImage.metadata?.reviewed === true : false
                            "
                            :saving="isSaving"
                            :position="position"
                            :dimensions="canvas?.natural ?? null"
                            :seeded-by="Object.keys(seeded).length ? lastRun : null"
                            @update:reviewed="markReviewed"
                            @save="saveMetadata"
                        />
                        <!-- The class strip is covered by this full-screen sheet, so reclassing a
                             shape - select a row, tap a class - would be unreachable without it here.
                             `pickClass` reroutes a tap to the selected shape (BE-ADR-038), so the same
                             strip that arms a class also reassigns the one being reviewed; the caption
                             appears only while a shape is selected, when that is what a tap now does. -->
                        <p
                            v-if="selectedShapeId"
                            class="tw:shrink-0 tw:bg-an-panel tw:px-3 tw:pt-2 tw:text-[11px] tw:font-medium tw:text-an-faint"
                        >
                            Tap a class to reassign the selected shape
                        </p>
                        <ClassStrip
                            :classes="classes"
                            :active="selectedShapeLabelId"
                            @pick="pickClass"
                            @create="createClass"
                            @edit="editClass"
                        />
                    </div>
                </McSheetContent>
            </McSheet>
        </template>

        <!-- Docked pager, a full-width strip above the canvas. The shell renders this slot only on a
             stacked phone; there the floating PagerPill in #canvas is suppressed, so the filmstrip
             sits beside the picture instead of over its top edge. -->
        <template #pager>
            <PagerPill
                v-if="selectedImage"
                docked
                :name="currentName"
                :index="position"
                :total="images.length"
                :strip="pagerStrip"
                @previous="step(-1)"
                @next="step(1)"
                @select="selectImage"
                @reveal="revealThumb"
            />
        </template>

        <!-- Docked zoom strip below the canvas on a stacked phone (the floating ZoomPill in #canvas
             is suppressed there), so the controls sit beside the picture, not over its bottom edge. -->
        <template #zoom>
            <ZoomPill
                v-if="selectedImage"
                docked
                focusable
                :percent="zoomPercent"
                :at-fit="atFit"
                :enabled="canZoom"
                :all-hidden="allHidden"
                @zoom-in="canvas?.zoomIn()"
                @zoom-out="canvas?.zoomOut()"
                @fit="canvas?.fit()"
                @focus="toggleFocus"
                @toggle-visibility="toggleAllHidden"
            />
        </template>

        <template #queue>
            <ImageQueue
                ref="queue"
                :images="orderedImages"
                :views="queueViews"
                :selected-id="selectedImageId"
                :loading="imagesLoading"
                :total="total"
                :search="search"
                :filter="queueFilter"
                :albums="albums"
                :source="source"
                @select="selectImage"
                @update:search="search = $event"
                @update:filter="queueFilter = $event"
                @update:source="source = $event"
                @more="loadMore"
                @collapse="leftOpen = false"
            />
        </template>

        <template #focus-rail>
            <FocusRail
                :images="orderedImages"
                :selected-id="selectedImageId"
                :position="position"
                @select="selectImage"
                @expand="toggleFocus"
            />
        </template>

        <!--
            The right rail restores exactly what focus mode took away on that side: the shape list,
            seeding, and the one per-image verdict. Nothing else - the point of the mode is that the
            rest is gone.
        -->
        <template #focus-rail-right>
            <div class="tw:flex tw:h-full tw:w-full tw:flex-col tw:items-center tw:gap-1 tw:py-2.5">
                <button
                    type="button"
                    class="tw:flex tw:h-[34px] tw:w-[34px] tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-icon tw:hover:bg-white/10 tw:hover:text-white"
                    aria-label="Show the shapes panel"
                    title="Show the shapes panel (F)"
                    @click="rightOpen = true"
                >
                    <Shapes class="tw:h-[17px] tw:w-[17px]" />
                </button>
                <button
                    type="button"
                    class="tw:flex tw:h-[34px] tw:w-[34px] tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-rail-icon tw:hover:bg-white/10 tw:hover:text-white tw:disabled:opacity-35 tw:disabled:hover:bg-transparent"
                    :disabled="!selectedImage"
                    aria-label="Seed from a model run"
                    title="Seed from a model run"
                    @click="seedOpen = true"
                >
                    <Sparkles class="tw:h-[17px] tw:w-[17px]" />
                </button>
                <button
                    type="button"
                    class="tw:flex tw:h-[34px] tw:w-[34px] tw:items-center tw:justify-center tw:rounded-lg tw:transition-colors tw:hover:bg-white/10 tw:disabled:opacity-35 tw:disabled:hover:bg-transparent"
                    :class="
                        selectedImage?.metadata?.reviewed === true
                            ? 'tw:text-an-accent'
                            : 'tw:text-an-d-rail-icon tw:hover:text-white'
                    "
                    :disabled="!selectedImage"
                    aria-label="Mark this image reviewed"
                    title="Mark reviewed (M)"
                    @click="markReviewed(!(selectedImage?.metadata?.reviewed === true))"
                >
                    <CircleCheck class="tw:h-[17px] tw:w-[17px]" />
                </button>

                <div class="tw:flex-1"></div>

                <button
                    type="button"
                    class="tw:flex tw:h-[34px] tw:w-[34px] tw:items-center tw:justify-center tw:rounded-lg tw:text-an-d-rail-icon tw:hover:bg-white/10 tw:hover:text-white"
                    aria-label="Keyboard shortcuts"
                    title="Keyboard shortcuts (?)"
                    @click="shortcutsOpen = true"
                >
                    <span
                        class="tw:rounded tw:border tw:border-white/12 tw:bg-white/10 tw:px-[5px] tw:py-[3px] tw:font-mono tw:text-[10px] tw:leading-none"
                    >
                        ?
                    </span>
                </button>
            </div>
        </template>

        <!-- A collapsed panel becomes a rail rather than vanishing, so the way back is on screen. -->
        <template #queue-rail>
            <button
                type="button"
                class="tw:flex tw:h-12 tw:w-full tw:items-center tw:justify-center tw:text-an-n-400 tw:hover:text-an-muted"
                aria-label="Show the image queue"
                @click="leftOpen = true"
            >
                <PanelLeftOpen class="tw:h-4 tw:w-4" />
            </button>
        </template>

        <template #canvas>
            <!-- Wrapper the image-change slide plays on: animating this rather than the canvas keeps
                 the canvas mounted, so the viewport, zoom and shapes are not reset by a navigation. -->
            <div ref="canvasSlide" class="tw:absolute tw:inset-0">
                <AnnotationCanvas
                    ref="canvas"
                    v-model:shapes="shapes"
                    v-model:selected-id="selectedShapeId"
                    :src="imageUrl"
                    :name="currentName"
                    :seeded="seeded"
                    :touch-layout="isTouchLayout"
                    :tool="tool"
                    :default-curated="defaultCurated"
                    :palette="palette"
                    :hidden-ids="hiddenIds"
                    :space-panning="spacePanning"
                    :inset-right="0"
                    @commit="commit"
                    @label-shape="labelShape"
                    @retry="retryImage"
                    @undo="undoStep"
                />
            </div>

            <div
                v-if="showAnnotationsLoading"
                class="tw:pointer-events-none tw:absolute tw:inset-0 tw:z-20 tw:flex tw:items-center tw:justify-center tw:bg-an-canvas/50 tw:text-sm tw:text-an-d-text"
            >
                Loading annotations...
            </div>

            <p
                v-else-if="imageError"
                class="tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:px-6 tw:text-center tw:text-sm tw:text-an-d-text"
            >
                {{ imageError }}
            </p>

            <FocusOverlays
                v-if="focus && selectedImage"
                :name="currentName"
                :unsaved-edits="unsavedEdits"
                :can-save="canSave"
                :saving="isSaving"
                :classes="classes"
                :active-label-id="activeLabelId"
                :shapes="shapes"
                :palette="palette"
                :selected-shape-id="selectedShapeId"
                :seeded="seeded"
                @save="save()"
                @pick-class="pickClass"
                @select-shape="selectedShapeId = $event"
                @new-class="toast.info('Pick a class with 1-9, or leave focus mode to add one.')"
            />

            <template v-if="selectedImage">
                <!--
                    THE DOCK AND THE BOTTOM BAR ARE THE SAME FOUR TOOLS, so only one of them ever
                    renders. `stacked` is the shell's own question about which layout it laid out,
                    which is why it comes from the composable rather than being asked twice: asked
                    twice, a phone showed both, a vertical dock over the picture and a bar under it.
                -->
                <ToolDock
                    v-if="!stacked"
                    :centered="focus"
                    :tool="tool"
                    :can-undo="canUndoAny"
                    :can-redo="canRedo"
                    :can-delete="Boolean(selectedShapeId)"
                    @update:tool="tool = $event"
                    @undo="undoStep"
                    @redo="redo"
                    @delete-selected="deleteSelected"
                />
                <!-- Floats over the canvas on desktop and on a wide (landscape) touch layout. On a
                     stacked phone it is docked into its own shell row instead (see #pager), so it
                     does not cover the top of the picture. -->
                <PagerPill
                    v-if="!focus && !stacked"
                    :name="currentName"
                    :index="position"
                    :total="images.length"
                    :strip="pagerStrip"
                    @previous="step(-1)"
                    @next="step(1)"
                    @select="selectImage"
                    @reveal="revealThumb"
                />
                <!--
                    Not on a stacked layout. It names keys and mouse gestures a finger does not
                    have, and at that width it sits directly under the zoom pill: two overlays on
                    the same bottom edge, one of them describing a keyboard nobody is holding.
                -->
                <HintBar
                    v-if="!focus && !stacked"
                    :tool="tool"
                    :selected-count="selectedShapeId ? 1 : 0"
                    :drafting="Boolean(canvas?.hasDraft)"
                />
                <!-- Floats over the canvas on desktop and on a wide (landscape) touch layout. On a
                     stacked phone it is docked into its own shell row instead (see #zoom). -->
                <ZoomPill
                    v-if="!focus && !stacked"
                    focusable
                    :percent="zoomPercent"
                    :at-fit="atFit"
                    :enabled="canZoom"
                    :all-hidden="allHidden"
                    @zoom-in="canvas?.zoomIn()"
                    @zoom-out="canvas?.zoomOut()"
                    @fit="canvas?.fit()"
                    @focus="toggleFocus"
                    @toggle-visibility="toggleAllHidden"
                />
            </template>

            <!--
                The page owns both dialogs; the children are content only, as CreateClass does it.
                Portaled to the body, so their place in this tree is arbitrary - they live inside a
                slot to keep the template single-rooted.
            -->
            <McDialog v-model:open="seedOpen">
                <McDialogContent class="tw:sm:max-w-lg">
                    <SeedFromRunDialog
                        :running="seeding"
                        :has-annotations="shapes.length > 0"
                        @close="seedOpen = false"
                        @seed="runAndSeed"
                    />
                </McDialogContent>
            </McDialog>

            <McDialog v-model:open="shortcutsOpen">
                <McDialogContent class="tw:sm:max-w-2xl">
                    <ShortcutSheet @close="shortcutsOpen = false" />
                </McDialogContent>
            </McDialog>

            <McDialog v-model:open="restoreOpen">
                <McDialogContent>
                    <McDialogHeader>
                        <McDialogTitle>Restore unsaved work?</McDialogTitle>
                    </McDialogHeader>
                    <p class="tw:px-1 tw:text-sm tw:text-an-muted">
                        This image has annotations you drew but did not save last time. Restore
                        them, or discard and keep the saved version.
                    </p>
                    <McDialogFooter>
                        <McButton variant="outline" @click="discardRestore">Discard</McButton>
                        <McButton @click="applyRestore">Restore</McButton>
                    </McDialogFooter>
                </McDialogContent>
            </McDialog>
        </template>

        <template #labels>
            <ClassPicker
                :classes="classes"
                :active="activeLabelId"
                @pick="pickClass"
                @create="createClass"
                @recolor="recolorClass"
                @rename="editClass"
            />
            <div class="tw:h-px tw:shrink-0 tw:bg-an-divider"></div>
            <ShapeList
                :shapes="shapes"
                :palette="palette"
                :selected-id="selectedShapeId"
                :hidden-ids="hiddenIds"
                :seeded="seeded"
                :all-hidden="allHidden"
                @select="selectedShapeId = $event"
                @toggle-hidden="toggleHidden"
                @toggle-all="toggleAllHidden"
                @accept="acceptSeeded"
                @reject="rejectSeeded"
                @relabel="labelShape"
                @seed="seedOpen = true"
                @draw-polygon="tool = 'polygon'"
            />
            <ImageMetaCard
                :image="selectedImage"
                :reviewed="selectedImage ? selectedImage.metadata?.reviewed === true : false"
                :saving="isSaving"
                :position="position"
                :dimensions="canvas?.natural ?? null"
                :seeded-by="Object.keys(seeded).length ? lastRun : null"
                @update:reviewed="markReviewed"
                @save="saveMetadata"
            />
        </template>

        <template #labels-rail>
            <button
                type="button"
                class="tw:flex tw:h-12 tw:w-full tw:items-center tw:justify-center tw:text-an-n-400 tw:hover:text-an-muted"
                aria-label="Show the labels panel"
                @click="rightOpen = true"
            >
                <PanelRight class="tw:h-4 tw:w-4" />
            </button>
        </template>
    </AnnotatorShell>
</template>
