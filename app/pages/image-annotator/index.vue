<script setup lang="ts">
import { toast } from 'vue-sonner'
import { PanelLeftOpen, PanelRight, Shapes, Sparkles } from '@lucide/vue'
import { onBeforeRouteLeave } from 'vue-router'
import { zoomPercent as toPercent } from '~/core/helpers/viewportTransform'
import {
    MAX_ANNOTATIONS,
    shapesFromDetection,
    diffAnnotations,
    hasUnsavedAnnotations,
    toAnnotationPayload,
    toShapes,
    type Shape,
} from '~/core/helpers/annotationShapes'
import { imageService, type LibraryImage } from '~/services/imageService'
import { annotationService } from '~/services/annotationService'
import {
    buildClasses,
    classForDigit,
    colorForShape,
    mergeClassLabels,
} from '~/core/helpers/annotationClasses'
import { queueRowView, type QueueFilter } from '~/core/helpers/annotationQueue'
import { metadataTitle } from '~/core/helpers/imageMetadata'
import AnnotationCanvas, {
    type Tool,
} from '~/features/components/annotator/canvas/AnnotationCanvas.vue'
import AnnotatorShell from '~/features/components/annotator/AnnotatorShell.vue'
import AnnotatorHeader from '~/features/components/annotator/AnnotatorHeader.vue'
import ImageQueue from '~/features/components/annotator/queue/ImageQueue.vue'
import FocusRail from '~/features/components/annotator/queue/FocusRail.vue'
import FocusOverlays from '~/features/components/annotator/canvas/FocusOverlays.vue'
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
    document.documentElement.classList.remove(APP_FILL_CLASS, HIDE_BAR_CLASS)
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

const images = ref<LibraryImage[]>([])
const total = ref(0)
const page = ref(1)
const imagesLoading = ref(false)

// ---- panels, classes, per-shape view state -------------------------------------------------------

const leftOpen = ref(true)
const rightOpen = ref(true)
const autoAdvance = ref(false)
const search = ref('')
const queueFilter = ref<QueueFilter>('all')

/**
 * The class list: append-only, because position decides colour and a colour that moves is worse
 * than an arbitrary one. Seeded from every image that gets opened and from anything typed.
 */
const classLabels = ref<string[]>([])
const activeClass = ref<string | null>(null)

const classes = computed(() => buildClasses(classLabels.value, shapes.value))

const rememberClasses = (from: Shape[]) => {
    classLabels.value = mergeClassLabels(classLabels.value, from)
    activeClass.value ??= classLabels.value[0] ?? null
}

const pickClass = (label: string) => {
    // With a shape selected the same gesture RECLASSES it, which is the point of the number keys:
    // draw, then press 2, without the pointer ever leaving the canvas.
    if (selectedShapeId.value) updateShape(selectedShapeId.value, { label })
    else activeClass.value = label
}

const createClass = (label: string) => {
    classLabels.value = mergeClassLabels(classLabels.value, [
        { id: 'new', label, x: 0, y: 0, w: 0, h: 0, polygon: null, expert_curated: false },
    ])
    pickClass(label)
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

const loadImages = async (append = false) => {
    imagesLoading.value = true
    try {
        const result = await imageService.list({
            page: page.value,
            per_page: PAGE_SIZE,
            ...(search.value && { q: search.value }),
        })
        images.value = append ? [...images.value, ...result.data] : result.data
        total.value = result.total
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not load the library'))
    } finally {
        imagesLoading.value = false
    }
}

const loadMore = () => {
    if (imagesLoading.value || images.value.length >= total.value) return
    page.value += 1
    void loadImages(true)
}

// Search is server-side (`?q=` over metadata.title), so a new term restarts the list. The three
// filter chips are NOT: they read `reviewed` from metadata and `seeded` from session state, neither
// of which `?annotated=` can express, so they narrow what is loaded rather than what is fetched.
watch(search, () => {
    page.value = 1
    void loadImages()
})

// ---- the image on the canvas ---------------------------------------------------------------------

const selectedImageId = ref<number | null>(null)
const selectedImage = ref<LibraryImage | null>(null)
const imageUrl = ref<string | null>(null)
const imageError = ref<string | null>(null)
const annotationsLoading = ref(false)

/** Re-fetch the bytes for the open image, for the canvas's failure state. */
const retryImage = async () => {
    const image = selectedImage.value
    if (!image) return
    revokeImage()
    imageError.value = null
    try {
        imageUrl.value = await imageService.blobUrl(image.id)
    } catch (error) {
        imageError.value = isForbidden(error)
            ? 'You are not allowed to view this image.'
            : 'Could not load this image.'
    }
}

const revokeImage = () => {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = null
}
onScopeDispose(revokeImage)

// ---- shapes and history --------------------------------------------------------------------------

const shapes = ref<Shape[]>([])
const selectedShapeId = ref<string | null>(null)
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
    // Everything after the current point is dropped: editing after an undo forks, and keeping the
    // abandoned branch reachable by Redo is how a redo puts back something you did not do.
    history.value = [...history.value.slice(0, historyIndex.value + 1), snapshot(shapes.value)]
    historyIndex.value = history.value.length - 1
}

const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

const restore = (index: number) => {
    historyIndex.value = index
    const previous = selectedShapeId.value
    shapes.value = snapshot(history.value[index]!)
    selectedShapeId.value = shapes.value.some((shape) => shape.id === previous) ? previous : null
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

// The shell decides its own columns from the same composable; the page needs only the one flag
// the canvas keys on.
const { isTouchLayout } = useAnnotatorLayout()

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
 */
const confirmDiscard = () =>
    !isDirty.value || window.confirm('You have unsaved annotations on this image. Discard them?')

const openImage = async (image: LibraryImage) => {
    selectedImageId.value = image.id
    selectedImage.value = image
    imageError.value = null
    annotationsLoading.value = true
    revokeImage()
    resetHistory([])
    // Per-image view state. Hiding is a reading aid for one picture, and a seeded review does not
    // carry across to the next image.
    hiddenIds.value = new Set()
    seeded.value = {}

    try {
        // FULL RESOLUTION, never `?size=thumb`. Annotating a 256px downscale would bake the
        // downscale into the exported dataset.
        imageUrl.value = await imageService.blobUrl(image.id)
    } catch (error) {
        imageError.value = isForbidden(error)
            ? 'You are not allowed to view this image.'
            : 'Could not load this image.'
    }

    try {
        const loaded = toShapes(await annotationService.list(image.id))
        resetHistory(loaded)
        rememberClasses(loaded)
        rememberDots(image.id, loaded)
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not load the annotations'))
    } finally {
        annotationsLoading.value = false
    }
}

const selectImage = async (id: number) => {
    if (id === selectedImageId.value) return
    if (!confirmDiscard()) return
    const image = images.value.find((row) => row.id === id)
    if (image) await openImage(image)
}

/** `?image=<id>` is how the library's Annotate button arrives here. */
const linkedImageId = computed(() => {
    const raw = Array.isArray(route.query.image) ? route.query.image[0] : route.query.image
    const id = Number(raw)
    return Number.isInteger(id) && id > 0 ? id : null
})

await loadImages()

if (linkedImageId.value) {
    const inStrip = images.value.find((row) => row.id === linkedImageId.value)
    if (inStrip) {
        await openImage(inStrip)
    } else {
        // Linked to something outside the first page: fetch the row directly rather than paging
        // until it appears, and put it at the front so the strip shows what is on the canvas.
        try {
            const image = await imageService.get(linkedImageId.value)
            images.value = [image, ...images.value]
            await openImage(image)
        } catch (error) {
            toast.error(apiErrorMessage(error, 'Could not open that image'))
        }
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

/**
 * Class-colour squares per row.
 *
 * Only the OPEN image can have real ones: the listing carries `annotation_count` but not the
 * labels, so there is nothing to colour a closed row from without a request per row. Every other
 * row with shapes gets a single neutral square, which still says "this one has work on it" and does
 * not invent a class it cannot know.
 *
 * A per-row label summary on the image listing is the backend ask that would fix this properly.
 */

/**
 * Class colours seen on each image, cached the moment the image is opened.
 *
 * The listing carries `annotation_count` but NOT the labels, so a closed row cannot know its
 * classes without a request of its own. What it CAN know is any image visited this session: opening
 * one loads its shapes, and this remembers the colours so the row keeps them after moving on. A
 * per-row label summary on `GET /images` would colour the rest, but that is a server change and
 * this is not; until then a never-opened annotated row shows one neutral dot, which says "has work"
 * without inventing a class it does not know.
 */
const imageClassColors = ref<Record<number, string[]>>({})

const rememberDots = (imageId: number, forShapes: Shape[]) => {
    const colors = [
        ...new Set(
            forShapes.map((shape) => colorForShape(classLabels.value, shape)).filter(Boolean),
        ),
    ] as string[]
    imageClassColors.value = { ...imageClassColors.value, [imageId]: colors.slice(0, 4) }
}

const queueDots = computed(() => {
    const dots: Record<number, string[]> = {}
    for (const image of images.value) {
        if (image.id === selectedImageId.value) {
            dots[image.id] = [
                ...new Set(
                    classes.value.filter((klass) => klass.count > 0).map((klass) => klass.color),
                ),
            ].slice(0, 4)
        } else if (imageClassColors.value[image.id]?.length) {
            dots[image.id] = imageClassColors.value[image.id]!
        } else if (image.annotation_count > 0) {
            dots[image.id] = ['#C7CBD1']
        }
    }
    return dots
})

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

const save = async () => {
    const image = selectedImage.value
    if (!image || isSaving.value) return

    const payload = toAnnotationPayload(shapes.value)
    if (payload.annotations.length > MAX_ANNOTATIONS) {
        toast.error(`An image is limited to ${MAX_ANNOTATIONS} annotations.`)
        return
    }

    isSaving.value = true
    try {
        // Re-read the response rather than trusting local state: a polygon's extent is recomputed
        // server-side, so the stored box can differ from the one that was sent.
        const saved = await annotationService.replace(image.id, payload.annotations)
        const reloaded = toShapes(saved)
        resetHistory(reloaded)
        rememberClasses(reloaded)
        rememberDots(image.id, reloaded)
        // Saving ends the review: the ids the confidences were keyed to are gone, and a persisted
        // set is no longer "model output nobody has read".
        seeded.value = {}
        seededImages.value = new Set([...seededImages.value].filter((id) => id !== image.id))
        // The strip's badge is derived from this count, so the row has to move with the save.
        const index = images.value.findIndex((row) => row.id === image.id)
        const updated = { ...image, annotation_count: saved.length }
        if (index !== -1) images.value[index] = updated
        selectedImage.value = updated
        toast.success(`Saved ${saved.length} annotation(s).`)

        // Save-then-next, off by default. A batch worker wants it; someone fixing one image does
        // not, and having the queue jump after a corrective save is worse than an extra keystroke.
        if (autoAdvance.value) step(1)
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not save the annotations'))
    } finally {
        isSaving.value = false
    }
}

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
}: {
    model: string
    segmentModel?: string | null
}) => {
    const image = selectedImage.value
    if (!image || seeding.value) return
    seeding.value = true
    try {
        const detection = await imageService.detect(image.id, model, segmentModel)

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
        const { shapes: seededShapes, confidence } = shapesFromDetection(all, defaultCurated.value)
        resetHistory(seededShapes)
        rememberClasses(seededShapes)
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

// ---- the keyboard ----------------------------------------------------------------------------------

/**
 * Every binding routes through here, which is the point of one composable: the map is a tested
 * table, and this is the only place that says what each entry DOES.
 *
 * Disabled while a dialog is open, or `?` would close and reopen its own sheet and `s` would save
 * behind it.
 */
const modalOpen = computed(() => seedOpen.value || shortcutsOpen.value)

const onHotkey = (action: HotkeyAction) => {
    switch (action.type) {
        case 'tool':
            // `smart` is a stub by agreement: the binding and the dock button exist, the
            // segmentation behind them is a separate conversation.
            if (action.tool === 'smart') toast.info('Smart outline is not built yet.')
            else tool.value = action.tool
            return
        case 'class': {
            const picked = classForDigit(classes.value, action.digit)
            if (picked) pickClass(picked.label)
            return
        }
        case 'next-image':
            return step(1)
        case 'previous-image':
            return step(-1)
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

const tool = ref<Tool>('rectangle')

const zoomPercent = computed(() =>
    canvas.value?.transform ? toPercent(canvas.value.transform) : 100,
)
const canZoom = computed(() => Boolean(canvas.value?.ready))

/** The canvas already compares this with a tolerance; re-deriving it here would drift. */
const atFit = computed(() => Boolean(canvas.value?.atFit))

/** Where the open image sits in the queue, for the pager. 1-based; 0 when nothing is open. */
const position = computed(() =>
    selectedImageId.value === null
        ? 0
        : images.value.findIndex((row) => row.id === selectedImageId.value) + 1,
)

const currentName = computed(() =>
    selectedImage.value
        ? (metadataTitle(selectedImage.value.metadata) ?? `IMG_${selectedImage.value.id}`)
        : '',
)

const step = (delta: number) => {
    const next = images.value[position.value - 1 + delta]
    if (next) void selectImage(next.id)
}
</script>

<template>
    <AnnotatorShell v-model:left-open="leftOpen" v-model:right-open="rightOpen">
        <template #header>
            <AnnotatorHeader
                scope-label="All images"
                :count="total"
                :unsaved-edits="unsavedEdits"
                :can-save="canSave"
                :saving="isSaving"
                :can-seed="Boolean(selectedImage)"
                :last-run="lastRun"
                @toggle-nav="toggleNav"
                @seed="seedOpen = true"
                @save="save"
                @shortcuts="shortcutsOpen = true"
            />
        </template>

        <template #header-compact>
            <McButton
                variant="ghost"
                size="icon-sm"
                aria-label="Show the image queue"
                @click="queueSheetOpen = true"
            >
                <PanelLeft class="tw:h-4 tw:w-4" />
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
                :active="activeClass"
                @pick="pickClass"
                @create="toast.info('Add a class from the labels panel on a wider screen.')"
            />
        </template>

        <template #sheets>
            <McSheet v-model:open="queueSheetOpen">
                <McSheetContent side="left" class="tw:w-[320px] tw:p-0">
                    <ImageQueue
                        v-model:auto-advance="autoAdvance"
                        :images="images"
                        :views="queueViews"
                        :dots="queueDots"
                        :selected-id="selectedImageId"
                        :loading="imagesLoading"
                        :total="total"
                        :search="search"
                        :filter="queueFilter"
                        @select="
                            (id) => {
                                selectImage(id)
                                queueSheetOpen = false
                            }
                        "
                        @update:search="search = $event"
                        @update:filter="queueFilter = $event"
                        @more="loadMore"
                    />
                </McSheetContent>
            </McSheet>

            <McSheet v-model:open="shapesSheetOpen">
                <McSheetContent side="right" class="tw:flex tw:w-[320px] tw:flex-col tw:p-0">
                    <ShapeList
                        :shapes="shapes"
                        :class-labels="classLabels"
                        :selected-id="selectedShapeId"
                        :hidden-ids="hiddenIds"
                        :seeded="seeded"
                        :all-hidden="allHidden"
                        @select="selectedShapeId = $event"
                        @toggle-hidden="toggleHidden"
                        @toggle-all="toggleAllHidden"
                        @accept="acceptSeeded"
                        @reject="rejectSeeded"
                        @seed="seedOpen = true"
                        @draw-polygon="tool = 'polygon'"
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
                    />
                </McSheetContent>
            </McSheet>
        </template>

        <template #queue>
            <ImageQueue
                ref="queue"
                v-model:auto-advance="autoAdvance"
                :images="images"
                :views="queueViews"
                :dots="queueDots"
                :selected-id="selectedImageId"
                :loading="imagesLoading"
                :total="total"
                :search="search"
                :filter="queueFilter"
                @select="selectImage"
                @update:search="search = $event"
                @update:filter="queueFilter = $event"
                @more="loadMore"
                @collapse="leftOpen = false"
            />
        </template>

        <template #focus-rail>
            <FocusRail
                :images="images"
                :selected-id="selectedImageId"
                :position="position"
                @select="selectImage"
                @expand="toggleFocus"
            />
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
                :class-labels="classLabels"
                :hidden-ids="hiddenIds"
                :active-class="activeClass"
                :space-panning="spacePanning"
                :inset-right="0"
                @commit="commit"
                @retry="retryImage"
                @undo="undoStep"
            />

            <div
                v-if="annotationsLoading"
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
                :active-class="activeClass"
                :shapes="shapes"
                :class-labels="classLabels"
                :selected-shape-id="selectedShapeId"
                @save="save"
                @pick-class="pickClass"
                @select-shape="selectedShapeId = $event"
                @new-class="toast.info('Pick a class with 1-9, or leave focus mode to add one.')"
            />

            <template v-if="selectedImage">
                <ToolDock
                    :tool="tool"
                    :can-undo="canUndoAny"
                    :can-redo="canRedo"
                    :can-delete="Boolean(selectedShapeId)"
                    @update:tool="tool = $event"
                    @undo="undoStep"
                    @redo="redo"
                    @delete-selected="deleteSelected"
                />
                <PagerPill
                    :name="currentName"
                    :index="position"
                    :total="images.length"
                    @previous="step(-1)"
                    @next="step(1)"
                />
                <HintBar
                    :tool="tool"
                    :selected-count="selectedShapeId ? 1 : 0"
                    :drafting="Boolean(canvas?.hasDraft)"
                />
                <ZoomPill
                    :percent="zoomPercent"
                    :at-fit="atFit"
                    :enabled="canZoom"
                    :all-hidden="allHidden"
                    @zoom-in="canvas?.zoomIn()"
                    @zoom-out="canvas?.zoomOut()"
                    @fit="canvas?.fit()"
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
        </template>

        <template #labels>
            <ClassPicker
                :classes="classes"
                :active="activeClass"
                :has-selection="Boolean(selectedShapeId)"
                @pick="pickClass"
                @create="createClass"
            />
            <div class="tw:h-px tw:shrink-0 tw:bg-an-divider"></div>
            <ShapeList
                :shapes="shapes"
                :class-labels="classLabels"
                :selected-id="selectedShapeId"
                :hidden-ids="hiddenIds"
                :seeded="seeded"
                :all-hidden="allHidden"
                @select="selectedShapeId = $event"
                @toggle-hidden="toggleHidden"
                @toggle-all="toggleAllHidden"
                @accept="acceptSeeded"
                @reject="rejectSeeded"
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
