<script setup lang="ts">
import { toast } from 'vue-sonner'
import { zoomPercent as toPercent } from '~/core/helpers/viewportTransform'
import { MAX_ANNOTATIONS, toAnnotationPayload, type Shape } from '~/core/helpers/annotationShapes'
import { localId } from '~/core/helpers/localId'
import AnnotatorCanvas, { type Tool } from '~/features/components/annotator/AnnotatorCanvas.vue'
import AnnotatorFilmstrip, {
    type LocalImage,
} from '~/features/components/annotator/AnnotatorFilmstrip.vue'
import AnnotatorSidePanel from '~/features/components/annotator/AnnotatorSidePanel.vue'
import AnnotatorToolbar from '~/features/components/annotator/AnnotatorToolbar.vue'

/**
 * The image annotator (BE-ADR-030).
 *
 * *** NOT CONNECTED TO THE SERVER. *** Drawing, labelling, selection, undo/redo, pan and zoom all
 * work, on locally-picked files. Save LOGS the payload it would send rather than sending it, and
 * seeding from a model run is the one control still inert, because there is no run to copy without
 * a server.
 *
 * What connecting it changes, so the next person does not have to reconstruct it:
 *  - the filmstrip's SOURCE, not its shape: `imageService.list()` with lazy thumbnails
 *    (`useImageObjectUrls`), and `?annotated=false` to make it a worklist;
 *  - `GET /images/:id/annotations` fills `shapes` on open, and Save becomes
 *    `PUT /images/:id/annotations` with exactly the body logged today. It is replace-all in one
 *    transaction, which is why the payload is the complete set and why local ids are never sent;
 *  - the canvas must load the FULL-RESOLUTION image, never `?size=thumb`. Annotating a 256px
 *    downscale would bake the downscale into the exported dataset;
 *  - `POST /images/:id/annotations/seed-from-detection` fills the toolbar's Seed button, and 409s
 *    when annotations already exist.
 *
 * `role: 'instructor'` is this codebase's spelling of "any staff account", which is what the server
 * enforces (`@Roles(UserType.Staff)`) and includes TAs.
 */
definePageMeta({ role: 'instructor' })

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([
    { label: 'Image Library', to: '/image-library' },
    { label: 'Annotator' },
])

const route = useRoute()
const linkedImageId = computed(() => {
    const raw = Array.isArray(route.query.image) ? route.query.image[0] : route.query.image
    const id = Number(raw)
    return Number.isInteger(id) && id > 0 ? id : null
})

const panelOpen = ref(true)

/**
 * How much room the labels panel takes on the right, in CSS pixels.
 *
 * `w-80` (320px) plus its `right-3` offset and a little air. Passed to the canvas so the picture
 * centres beside the panel rather than under it; the panel itself still floats, so the canvas keeps
 * the full width the moment it is closed.
 */
const PANEL_INSET = 336
const tool = ref<Tool>('rectangle')

/**
 * `expert_curated` starts true for an INSTRUCTOR and false for everyone else.
 *
 * The flag means "vetted by a domain expert", and on this platform the instructor is that expert:
 * their pass over an image is the trusted one an export can ship as a subset. A TA's is not, and
 * `admin` is a systems role rather than a clinical one, so both start false and can tick the box
 * per shape.
 *
 * Read from the JWT first with the stored profile as fallback, which is the rule the auth
 * middleware uses - the token is the authority and the two cannot drift.
 */
const auth = useAuth()
const defaultCurated = computed(() => (auth.jwtUserInfo?.role ?? auth.user?.role) === 'instructor')

// ---- local images ------------------------------------------------------------------------------

const images = ref<LocalImage[]>([])
const selectedImageId = ref<string | null>(null)
const selectedImage = computed(
    () => images.value.find((image) => image.id === selectedImageId.value) ?? null,
)

const addImages = (files: File[]) => {
    for (const file of files) {
        const image: LocalImage = {
            id: localId(`img-${file.size}`),
            name: file.name,
            url: URL.createObjectURL(file),
        }
        images.value.push(image)
        selectedImageId.value ??= image.id
    }
}

const removeImage = (id: string) => {
    const index = images.value.findIndex((image) => image.id === id)
    if (index === -1) return
    URL.revokeObjectURL(images.value[index]!.url)
    images.value.splice(index, 1)
    if (selectedImageId.value === id) selectedImageId.value = images.value[0]?.id ?? null
}

// An object URL pins its blob in memory until it is revoked, and these are multi-MB frames.
onScopeDispose(() => {
    for (const image of images.value) URL.revokeObjectURL(image.url)
})

// ---- shapes and history -------------------------------------------------------------------------

const shapes = ref<Shape[]>([])
const selectedShapeId = ref<string | null>(null)

/**
 * Undo/redo over whole-set snapshots rather than a command log.
 *
 * The set is at most a thousand small objects and a snapshot is a structural clone, so the memory
 * argument for a command log does not apply here - and the correctness argument runs the other way:
 * every gesture (draw, move, resize, vertex drag, relabel, delete) would need its own inverse, and
 * the one that is wrong is the one nobody tests.
 */
const history = ref<Shape[][]>([[]])
const historyIndex = ref(0)

const snapshot = (value: Shape[]): Shape[] =>
    value.map((shape) => ({ ...shape, polygon: shape.polygon?.map((p) => ({ ...p })) ?? null }))

const commit = () => {
    // Everything after the current point is dropped: editing after an undo forks, and keeping the
    // abandoned branch reachable by Redo is how a redo puts back something you did not do.
    history.value = [...history.value.slice(0, historyIndex.value + 1), snapshot(shapes.value)]
    historyIndex.value = history.value.length - 1
}

const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

const undo = () => {
    if (!canUndo.value) return
    historyIndex.value -= 1
    shapes.value = snapshot(history.value[historyIndex.value]!)
    selectedShapeId.value = null
}

const redo = () => {
    if (!canRedo.value) return
    historyIndex.value += 1
    shapes.value = snapshot(history.value[historyIndex.value]!)
    selectedShapeId.value = null
}

// Switching image resets the drawing state. Once this talks to the server, this is the seam where
// unsaved work has to be guarded rather than dropped.
watch(selectedImageId, () => {
    shapes.value = []
    selectedShapeId.value = null
    history.value = [[]]
    historyIndex.value = 0
})

/** Mutate a shape WITHOUT touching the history. */
const patchShape = (id: string, patch: Partial<Shape>) => {
    const index = shapes.value.findIndex((shape) => shape.id === id)
    if (index === -1) return
    shapes.value[index] = { ...shapes.value[index]!, ...patch } as Shape
}

const updateShape = (id: string, patch: Partial<Shape>) => {
    patchShape(id, patch)
    commit()
}

/**
 * A label edit is one undo step, not one per keystroke.
 *
 * Typing "clue cell" through `updateShape` pushed ten snapshots, so undo walked back through the
 * word a character at a time and the real previous state was ten presses away. The keystrokes
 * mutate; the blur commits.
 */
const commitLabel = () => {
    const current = JSON.stringify(shapes.value)
    if (current !== JSON.stringify(history.value[historyIndex.value])) commit()
}

const removeShape = (id: string) => {
    shapes.value = shapes.value.filter((shape) => shape.id !== id)
    if (selectedShapeId.value === id) selectedShapeId.value = null
    commit()
}

const deleteSelected = () => selectedShapeId.value && removeShape(selectedShapeId.value)

useEventListener('keydown', (event: KeyboardEvent) => {
    const typing = (event.target as HTMLElement | null)?.tagName === 'INPUT'
    if (typing) return
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedShapeId.value) {
        event.preventDefault()
        deleteSelected()
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
    }
})

// ---- canvas plumbing ---------------------------------------------------------------------------

const canvas = useTemplateRef<InstanceType<typeof AnnotatorCanvas>>('canvas')

const zoomPercent = computed(() =>
    canvas.value?.transform ? toPercent(canvas.value.transform) : 100,
)
const canZoom = computed(() => Boolean(canvas.value?.ready))

// A degenerate shape is discarded the moment it is made, so anything in the list is savable.
// `toAnnotationPayload` still filters, as the guarantee at the wire boundary rather than a case
// expected to fire.
const canSave = computed(() => Boolean(selectedImage.value) && shapes.value.length > 0)

/**
 * What Save WOULD send.
 *
 * Logged rather than sent, deliberately, until the annotator is wired to the server. The body is
 * built by the same `toAnnotationPayload` that will feed the real request, so what appears in the
 * console is the payload itself and not a description of one.
 */
const save = () => {
    if (!selectedImage.value) return
    const payload = toAnnotationPayload(shapes.value)

    if (payload.annotations.length > MAX_ANNOTATIONS) {
        toast.error(`An image is limited to ${MAX_ANNOTATIONS} annotations.`)
        return
    }

    /*
     * TEMPORARY, and the reason `no-console` is suppressed on the next line only: this stands in
     * for `PUT /images/:id/annotations` until the annotator is wired up. Delete the log and the
     * directive together when the request replaces it.
     *
     * The directive has to stay on ONE short line - prettier reflows a long one across two, which
     * silently stops eslint seeing it as a directive at all.
     */
    // eslint-disable-next-line no-console
    console.log('PUT /images/:id/annotations', {
        image: selectedImage.value.name,
        linkedImageId: linkedImageId.value,
        body: payload,
    })

    toast.success(`Logged ${payload.annotations.length} annotation(s) to the console.`)
}
</script>

<template>
    <div
        class="tw:flex tw:h-[calc(100vh-80px)] tw:flex-col tw:overflow-hidden tw:rounded-lg tw:border tw:border-navy-15 tw:bg-white"
    >
        <AnnotatorToolbar
            v-model:tool="tool"
            :panel-open="panelOpen"
            :zoom-percent="zoomPercent"
            :can-zoom="canZoom"
            :can-undo="canUndo"
            :can-redo="canRedo"
            :can-delete="Boolean(selectedShapeId)"
            :can-save="canSave"
            @toggle-panel="panelOpen = !panelOpen"
            @zoom-in="canvas?.zoomIn()"
            @zoom-out="canvas?.zoomOut()"
            @fit="canvas?.fit()"
            @actual-size="canvas?.actualSize()"
            @undo="undo"
            @redo="redo"
            @delete-selected="deleteSelected"
            @save="save"
        />

        <p
            v-if="linkedImageId"
            class="tw:shrink-0 tw:border-b tw:border-navy-15 tw:bg-warning/10 tw:px-3 tw:py-1.5 tw:text-xs tw:text-navy-80"
        >
            Opened for library image {{ linkedImageId }}, but the annotator is not connected to the
            server yet. Add a local copy below to draw on it.
        </p>

        <div class="tw:relative tw:flex tw:min-h-0 tw:flex-1">
            <AnnotatorCanvas
                ref="canvas"
                v-model:shapes="shapes"
                v-model:selected-id="selectedShapeId"
                :src="selectedImage?.url ?? null"
                :tool="tool"
                :default-curated="defaultCurated"
                :inset-right="panelOpen ? PANEL_INSET : 0"
                @commit="commit"
            />
            <AnnotatorSidePanel
                :open="panelOpen"
                :shapes="shapes"
                :selected-id="selectedShapeId"
                @close="panelOpen = false"
                @select="selectedShapeId = $event"
                @remove="removeShape"
                @update-label="patchShape($event.id, { label: $event.label })"
                @commit-label="commitLabel"
                @update-curated="updateShape($event.id, { expert_curated: $event.expert_curated })"
            />
        </div>

        <AnnotatorFilmstrip
            :images="images"
            :selected-id="selectedImageId"
            @add="addImages"
            @select="selectedImageId = $event"
            @remove="removeImage"
        />
    </div>
</template>
