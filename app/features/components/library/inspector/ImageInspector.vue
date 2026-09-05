<script setup lang="ts">
import { toast } from 'vue-sonner'
import {
    ChevronLeft,
    ChevronRight,
    Eye,
    EyeOff,
    FolderMinus,
    FolderPlus,
    ImageOff,
    Loader2,
    MoreHorizontal,
    Pencil,
    Play,
    Trash2,
    X,
} from '@lucide/vue'
import { imageService, type LibraryImage } from '~/services/imageService'
import type { Album } from '~/services/albumService'
import {
    detectionService,
    type DetectionWithSubmitter,
    type ModelSpec,
} from '~/services/detectionService'
import { annotationService } from '~/services/annotationService'
import type { AnnotationLabel } from '~/services/annotationLabelService'
import { toShapes, type Shape } from '~/core/helpers/annotationShapes'
import { colorForShape } from '~/core/helpers/annotationClasses'
import type { QueueRowView } from '~/core/helpers/annotationQueue'
import { formatDayTime } from '~/core/helpers/dateFormat'
import {
    duplicateNote,
    imageDisplayName,
    sanitizeTitle,
    splitExtension,
    titleError,
} from '~/core/helpers/imageName'
import AnnotationOverlay from '~/features/components/shared/AnnotationOverlay.vue'
import MetadataEditor from './MetadataEditor.vue'
import ModelRunList from './ModelRunList.vue'

/**
 * The docked panel: one image, or the whole selection.
 *
 * *** IT SHRINKS THE GRID, IT NEVER COVERS IT. *** The sheet this replaces was a takeover with a
 * scrim, which is why nobody left it open: you lost the grid, so you closed it, so you never walked
 * a batch with it up. Docked, the arrows move the selection underneath and the panel just follows.
 *
 * STICKY, AND THE CONTENT SWAPS. Clicking a second card replaces what is in here rather than
 * closing and reopening, so nothing animates and the scroll position of the page behind stays put.
 *
 * Everything it writes goes out as an EVENT rather than a request, except the reads it needs for
 * itself. The page owns the image list, so a rename or a filing that happened here has to reach the
 * card too, and a panel that wrote directly would leave the grid describing the previous state.
 */
const props = defineProps<{
    /** The single image, when exactly one is selected. */
    image: LibraryImage | null
    /** Everything selected. More than one switches the whole panel into its batch state. */
    selection: LibraryImage[]
    albums: Album[]
    models: ModelSpec[]
    palette: AnnotationLabel[]
    /** From `queueRowView`, so the panel and the card cannot disagree about status. */
    view?: QueueRowView | null
    /** Thumbnails already fetched by the grid, keyed by id, for the batch state's 3-up row. */
    thumbnails: Record<number, string>
    /** Position in the filtered set, 1-based, for the `17 / 22` pill. */
    position?: { index: number; total: number } | null
    /**
     * The names already in view, for the duplicate NOTE under a rename.
     *
     * The images on screen rather than the selection: "another image here is also called this" is
     * about the album being looked at, and comparing against the selection would stay silent for
     * the case that actually happens, which is renaming one image onto a neighbour nobody selected.
     */
    siblingNames?: string[]
    /** The album currently being viewed, if any: names the "Remove from …" action, and gates it. */
    albumName?: string | null
}>()

const emit = defineEmits<{
    close: []
    previous: []
    next: []
    annotate: [imageId: number]
    rename: [image: LibraryImage, title: string]
    changed: [image: LibraryImage]
    'add-to-album': [albumId: number]
    'remove-from-album': []
    download: []
    delete: []
    'metadata-all': [patch: Record<string, unknown>]
}>()

const multi = computed(() => props.selection.length > 1)

// ---- the single image ----------------------------------------------------------------------------

const detail = ref<LibraryImage | null>(null)
const imageUrl = ref<string | null>(null)
const imageError = ref<'forbidden' | 'unavailable' | null>(null)
const shapes = ref<Shape[]>([])
const natural = ref<{ w: number; h: number } | null>(null)
const fileSize = ref<number | null>(null)
const fileType = ref<string | null>(null)
const runs = ref<DetectionWithSubmitter[]>([])
const runsLoading = ref(false)
const showShapes = ref(true)
const selectedModel = ref('')
const isRunning = ref(false)

const revoke = () => {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = null
}

/**
 * Full resolution, NOT `?size=thumb`.
 *
 * This is where someone decides whether a picture is worth curating, and a 256px downscale of a
 * microscopy field cannot answer that. It is also where the annotations are drawn, and the
 * coordinates were measured against these pixels.
 */
const loadImage = async (row: LibraryImage) => {
    revoke()
    imageError.value = null
    natural.value = null
    fileSize.value = null
    fileType.value = null
    try {
        const url = await imageService.blobUrl(row.id, undefined, row.content_hash)
        imageUrl.value = url
        // Size and format come off the blob we already hold, because the row carries neither.
        // Requested as `byte_size` and `mime_type` on 2026-08-30; until then this is free, and it
        // is only ever done for the ONE image on screen.
        const blob = await fetch(url).then((response) => response.blob())
        fileSize.value = blob.size
        fileType.value = blob.type
    } catch (error) {
        imageError.value = isForbidden(error) ? 'forbidden' : 'unavailable'
    }
}

/** Dimensions, read off the decoded image. The row does not carry them either. */
const onImageLoad = (event: Event) => {
    const img = event.target as HTMLImageElement
    natural.value = { w: img.naturalWidth, h: img.naturalHeight }
}

const labelIdFor = (label: string): number | null =>
    props.palette.find((row) => row.label === label)?.id ?? null

const load = async (row: LibraryImage) => {
    detail.value = row
    shapes.value = []
    runs.value = []
    void loadImage(row)
    try {
        // The single read is what carries `albums[]`; the grid row does not.
        detail.value = await imageService.get(row.id)
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not load the image details'))
    }
    try {
        shapes.value = toShapes(await annotationService.list(row.id), labelIdFor)
    } catch {
        // The overlay is a description of the picture, not the picture. A failure here leaves the
        // preview intact rather than emptying the panel.
    }
    runsLoading.value = true
    try {
        runs.value = await detectionService.listForImage(row.id)
    } catch {
        // Same reasoning: the runs list is an affordance.
    } finally {
        runsLoading.value = false
    }
}

// The panel follows the selection, which is an event rather than derived state: it fires requests.
watch(
    () => props.image?.id,
    (id) => {
        if (props.image && id) void load(props.image)
        else {
            detail.value = null
            revoke()
        }
    },
    { immediate: true },
)

onScopeDispose(revoke)

// ---- what the panel shows ------------------------------------------------------------------------

const caption = computed(() =>
    detail.value ? imageDisplayName(detail.value.metadata, detail.value.id) : '',
)
const parts = computed(() => splitExtension(caption.value))

const editing = ref(false)
const draft = ref('')
const nameInput = useTemplateRef<HTMLInputElement>('nameInput')

const startRename = async () => {
    draft.value = parts.value.base
    editing.value = true
    await nextTick()
    nameInput.value?.focus()
    nameInput.value?.select()
}

const nameError = computed(() => (editing.value ? titleError(draft.value) : null))

/** A note, never a refusal: the id is the identity, and two slides can share a name. */
const duplicate = computed(() =>
    editing.value ? duplicateNote(draft.value, props.siblingNames ?? []) : null,
)

// The page owns the key map, so F2 arrives as a call rather than as a second keydown listener on
// the window competing with the first.
defineExpose({ startRename })

const commitRename = () => {
    if (!editing.value || !detail.value) return
    editing.value = false
    const next = sanitizeTitle(draft.value) + parts.value.ext
    if (nameError.value || next === caption.value) return
    emit('rename', detail.value, next)
}

const classRows = computed(() => {
    const tally = new Map<string, { label: string; color: string; count: number }>()
    for (const shape of shapes.value) {
        const label = shape.label.trim() || 'Unlabelled'
        const existing = tally.get(label)
        if (existing) existing.count += 1
        else
            tally.set(label, {
                label,
                color: colorForShape(props.palette, shape) ?? '#c7cbd1',
                count: 1,
            })
    }
    return [...tally.values()].sort((a, b) => b.count - a.count)
})

const filedIn = computed(() => detail.value?.albums ?? [])

const addableAlbums = computed(() => {
    const already = new Set(filedIn.value.map((album) => album.id))
    return props.albums.filter((album) => !already.has(album.id))
})

const detectors = computed(() =>
    props.models
        .filter((model) => model.task === 'detect' || model.task === 'classify')
        .map((model) => ({ value: model.name, label: model.displayName })),
)

/**
 * One stroke width for the whole overlay, scaled to the picture rather than to the panel.
 *
 * The SVG is in IMAGE coordinates, so a fixed `2` would be two pixels of a 4000px frame: invisible
 * in a 400px box. Dividing the long edge keeps the outline the same visual weight whatever the
 * picture's resolution.
 */
const strokeWidth = computed(() => Math.max(natural.value?.w ?? 0, natural.value?.h ?? 0) / 320)

/** `2.4 MB`, from the blob. Binary units, because that is what a file manager shows beside it. */
const humanSize = computed(() => {
    const bytes = fileSize.value
    if (bytes === null) return null
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
})

const runModel = async () => {
    if (!detail.value || !selectedModel.value) return
    isRunning.value = true
    try {
        await imageService.detect(detail.value.id, selectedModel.value)
        runs.value = await detectionService.listForImage(detail.value.id)
        toast.success('Model run finished')
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not run the model'))
    } finally {
        isRunning.value = false
    }
}

const saveMetadata = async (patch: Record<string, unknown>) => {
    if (!detail.value) return
    try {
        const updated = await imageService.updateMetadata(detail.value.id, patch)
        detail.value = updated
        emit('changed', updated)
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not save the metadata'))
    }
}

// ---- the batch -----------------------------------------------------------------------------------

/**
 * What a batch has in common, from data the page already holds.
 *
 * A combined CLASS tally is deliberately absent: it would need every image's annotations, which is
 * one request per selected image. The status line answers the question people actually ask of a
 * batch, which is how much of it is done, and `annotation_count` is already on every row.
 */
const batchStatus = computed(() => {
    let reviewed = 0
    let started = 0
    let empty = 0
    for (const row of props.selection) {
        if (row.metadata?.reviewed === true) reviewed += 1
        else if (row.annotation_count > 0) started += 1
        else empty += 1
    }
    return [
        reviewed ? `${reviewed} reviewed` : '',
        started ? `${started} in progress` : '',
        empty ? `${empty} unlabelled` : '',
    ]
        .filter(Boolean)
        .join(' · ')
})

const batchShapes = computed(() =>
    props.selection.reduce((total, row) => total + row.annotation_count, 0),
)

const batchKey = ref('')
const batchValue = ref('')

const applyToAll = () => {
    const key = batchKey.value.trim()
    if (!key) return
    emit('metadata-all', { [key]: batchValue.value })
    batchKey.value = ''
    batchValue.value = ''
}
</script>

<template>
    <!-- ============ the batch ============ -->
    <template v-if="multi">
        <div
            class="tw:flex tw:h-11 tw:shrink-0 tw:items-center tw:gap-2 tw:border-b tw:border-an-divider tw:pr-2 tw:pl-3.5"
        >
            <span class="tw:flex-1 tw:font-mono tw:text-[12.5px] tw:font-medium tw:text-an-text">
                {{ selection.length }} selected
            </span>
            <McDropdownMenu>
                <McDropdownMenuTrigger as-child>
                    <button
                        type="button"
                        class="tw:flex tw:h-7 tw:w-7 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-500 tw:hover:bg-an-n-100 tw:hover:text-an-text"
                        aria-label="More actions"
                    >
                        <MoreHorizontal class="tw:h-4 tw:w-4" />
                    </button>
                </McDropdownMenuTrigger>
                <McDropdownMenuContent align="end">
                    <!-- Only when an album is being viewed, and named, so it is clear which one the
                         images are leaving rather than a vague "this album". -->
                    <McDropdownMenuItem v-if="albumName" @select="emit('remove-from-album')">
                        <FolderMinus class="tw:h-4 tw:w-4" />
                        Remove from {{ albumName }}
                    </McDropdownMenuItem>
                    <McDropdownMenuSeparator v-if="albumName" />
                    <McDropdownMenuItem variant="destructive" @select="emit('delete')">
                        <Trash2 class="tw:h-4 tw:w-4" />
                        Delete {{ selection.length }} images
                    </McDropdownMenuItem>
                </McDropdownMenuContent>
            </McDropdownMenu>
            <button
                type="button"
                class="tw:flex tw:h-7 tw:w-7 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-500 tw:hover:bg-an-n-100 tw:hover:text-an-text"
                aria-label="Close"
                @click="emit('close')"
            >
                <X class="tw:h-4 tw:w-4" />
            </button>
        </div>

        <div class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto">
            <!-- Three thumbnails, not a grid: enough to confirm WHAT is selected without turning
                 the panel into a second copy of the one behind it. -->
            <div class="tw:flex tw:gap-1.5 tw:p-3.5">
                <span
                    v-for="row in selection.slice(0, 3)"
                    :key="row.id"
                    class="tw:aspect-[4/3] tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:rounded-md tw:bg-an-canvas"
                >
                    <img
                        v-if="thumbnails[row.id]"
                        :src="thumbnails[row.id]"
                        alt=""
                        class="tw:h-full tw:w-full tw:object-cover"
                    />
                </span>
                <span
                    v-if="selection.length > 3"
                    class="tw:flex tw:aspect-[4/3] tw:min-w-0 tw:flex-1 tw:items-center tw:justify-center tw:rounded-md tw:bg-an-n-100 tw:font-mono tw:text-[12px] tw:text-an-n-500"
                >
                    +{{ selection.length - 3 }}
                </span>
            </div>

            <div class="tw:border-b tw:border-an-divider tw:px-3.5 tw:pb-3.5">
                <McDropdownMenu>
                    <McDropdownMenuTrigger as-child>
                        <McButton size="sm" class="tw:w-full tw:justify-center">
                            <FolderPlus class="tw:h-3.5 tw:w-3.5" />
                            Add to album
                        </McButton>
                    </McDropdownMenuTrigger>
                    <McDropdownMenuContent align="start">
                        <McDropdownMenuItem
                            v-for="album in albums"
                            :key="album.id"
                            @select="emit('add-to-album', album.id)"
                        >
                            {{ album.kind === 'curated' ? `${album.name} (curated)` : album.name }}
                        </McDropdownMenuItem>
                    </McDropdownMenuContent>
                </McDropdownMenu>

                <div class="tw:mt-2 tw:flex tw:gap-2">
                    <McButton
                        size="sm"
                        variant="outline"
                        class="tw:flex-1"
                        @click="emit('annotate', selection[0]!.id)"
                    >
                        <Pencil class="tw:h-3.5 tw:w-3.5" />
                        Annotate
                    </McButton>
                    <McButton
                        size="sm"
                        variant="outline"
                        class="tw:flex-1"
                        @click="emit('download')"
                    >
                        Download
                    </McButton>
                </div>
                <!-- Disabled and honest: `POST /images/:id/detect` takes ONE image and blocks on
                     the worker, so a batch would be serial GPU round trips with nothing to cancel. -->
                <McButton size="sm" variant="outline" class="tw:mt-2 tw:w-full" disabled>
                    <Play class="tw:h-3.5 tw:w-3.5" />
                    Run model over the batch (coming soon)
                </McButton>
            </div>

            <div class="tw:border-b tw:border-an-divider tw:p-3.5">
                <h4
                    class="tw:mb-2.5 tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-an-n-400 tw:uppercase"
                >
                    In common
                </h4>
                <dl class="tw:grid tw:grid-cols-[104px_1fr] tw:gap-x-2.5 tw:gap-y-2 tw:text-[12px]">
                    <dt class="tw:text-an-n-500">Status</dt>
                    <dd class="tw:text-an-n-700">{{ batchStatus }}</dd>
                    <dt class="tw:text-an-n-500">Shapes</dt>
                    <dd class="tw:font-mono tw:text-an-n-700 tw:tabular-nums">{{ batchShapes }}</dd>
                </dl>
            </div>

            <div class="tw:p-3.5">
                <h4
                    class="tw:mb-2.5 tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-an-n-400 tw:uppercase"
                >
                    Metadata
                </h4>
                <p class="tw:mb-2 tw:text-[11.5px] tw:text-an-n-500">
                    Adds one field to all {{ selection.length }}.
                </p>
                <div class="tw:flex tw:items-center tw:gap-1.5">
                    <input
                        v-model="batchKey"
                        placeholder="key"
                        class="tw:h-7 tw:w-[112px] tw:shrink-0 tw:rounded-md tw:border tw:border-an-n-200 tw:bg-an-n-50 tw:px-2 tw:font-mono tw:text-[12px] tw:outline-none tw:focus:border-an-accent"
                    />
                    <input
                        v-model="batchValue"
                        placeholder="value"
                        class="tw:h-7 tw:min-w-0 tw:flex-1 tw:rounded-md tw:border tw:border-an-n-200 tw:bg-an-n-50 tw:px-2 tw:text-[12px] tw:outline-none tw:focus:border-an-accent"
                        @keydown.enter="applyToAll"
                    />
                    <McButton
                        size="sm"
                        variant="outline"
                        :disabled="!batchKey.trim()"
                        @click="applyToAll"
                    >
                        Apply
                    </McButton>
                </div>
            </div>
        </div>
    </template>

    <!-- ============ one image ============ -->
    <template v-else-if="detail">
        <div
            class="tw:relative tw:flex tw:h-11 tw:shrink-0 tw:items-center tw:gap-2 tw:border-b tw:border-an-divider tw:pr-2 tw:pl-3.5"
        >
            <span v-if="editing" class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-1">
                <input
                    ref="nameInput"
                    v-model="draft"
                    class="tw:h-[26px] tw:min-w-0 tw:flex-1 tw:rounded-md tw:border tw:border-an-accent tw:bg-an-panel tw:px-1.5 tw:font-mono tw:text-[12.5px] tw:shadow-[0_0_0_3px_rgba(14,147,132,0.14)] tw:outline-none"
                    @keydown.enter.prevent="commitRename"
                    @keydown.esc.prevent="editing = false"
                    @blur="commitRename"
                />
                <span v-if="parts.ext" class="tw:font-mono tw:text-[12.5px] tw:text-an-n-300">
                    {{ parts.ext }}
                </span>
            </span>
            <!-- A refusal (empty, or too long) and a NOTE (a name already in use) read differently
                 on purpose: only the first stops the write. -->
            <span
                v-if="editing && (nameError || duplicate)"
                class="tw:absolute tw:top-11 tw:left-3.5 tw:z-10 tw:rounded-md tw:border tw:border-an-divider tw:bg-an-panel tw:px-2 tw:py-1 tw:text-[11px] tw:shadow-sm"
                :class="nameError ? 'tw:text-danger' : 'tw:text-an-n-400'"
            >
                {{ nameError ?? duplicate }}
            </span>
            <!-- The name IS the control: click it, or the pencil that appears beside it. -->
            <button
                v-else
                type="button"
                class="tw:group tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-1.5 tw:text-left"
                @click="startRename"
            >
                <span
                    class="tw:truncate tw:font-mono tw:text-[12.5px] tw:font-medium tw:text-an-text"
                >
                    {{ caption }}
                </span>
                <Pencil
                    class="tw:h-3 tw:w-3 tw:shrink-0 tw:text-an-n-300 tw:opacity-0 tw:transition-opacity tw:group-hover:opacity-100"
                />
            </button>

            <McDropdownMenu>
                <McDropdownMenuTrigger as-child>
                    <button
                        type="button"
                        class="tw:flex tw:h-7 tw:w-7 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-500 tw:hover:bg-an-n-100 tw:hover:text-an-text"
                        aria-label="More actions"
                    >
                        <MoreHorizontal class="tw:h-4 tw:w-4" />
                    </button>
                </McDropdownMenuTrigger>
                <McDropdownMenuContent align="end">
                    <McDropdownMenuItem @select="emit('download')">
                        Download original
                    </McDropdownMenuItem>
                    <McDropdownMenuItem @select="startRename">Rename</McDropdownMenuItem>
                    <McDropdownMenuSeparator />
                    <!-- Destructive lives HERE and nowhere else. The full-width red button that
                         used to sit one tab stop below Run is gone. -->
                    <McDropdownMenuItem variant="destructive" @select="emit('delete')">
                        <Trash2 class="tw:h-4 tw:w-4" />
                        Delete image
                    </McDropdownMenuItem>
                </McDropdownMenuContent>
            </McDropdownMenu>
            <button
                type="button"
                class="tw:flex tw:h-7 tw:w-7 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-500 tw:hover:bg-an-n-100 tw:hover:text-an-text"
                aria-label="Close"
                @click="emit('close')"
            >
                <X class="tw:h-4 tw:w-4" />
            </button>
        </div>

        <div class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto">
            <!-- The preview: FIT, on the canvas ground, with the annotations actually drawn. The
                 old sheet advertised four shapes on the card and then showed none of them. -->
            <div class="tw:relative tw:aspect-[4/3] tw:bg-an-canvas">
                <img
                    v-if="imageUrl"
                    :src="imageUrl"
                    :alt="caption"
                    class="tw:h-full tw:w-full tw:object-contain"
                    @load="onImageLoad"
                />
                <div
                    v-else-if="imageError"
                    class="tw:flex tw:h-full tw:w-full tw:flex-col tw:items-center tw:justify-center tw:gap-1.5 tw:text-an-d-disabled"
                >
                    <EyeOff v-if="imageError === 'forbidden'" class="tw:h-5 tw:w-5" />
                    <ImageOff v-else class="tw:h-5 tw:w-5" />
                    <span class="tw:text-[11px]">
                        {{
                            imageError === 'forbidden'
                                ? 'Not available to you'
                                : 'Image unavailable'
                        }}
                    </span>
                </div>
                <!--
                    A SPINNER on the dark ground, not a skeleton. This is the FULL-RESOLUTION
                    picture - multi-megabyte microscopy frames - so the wait is seconds rather than
                    a flicker, and a shimmer over black reads as a panel that has failed rather than
                    one that is working.
                -->
                <div v-else class="tw:flex tw:h-full tw:w-full tw:items-center tw:justify-center">
                    <Loader2 class="tw:h-6 tw:w-6 tw:animate-spin tw:text-an-d-disabled" />
                </div>

                <!--
                    `preserveAspectRatio` matches `object-contain`, so the overlay letterboxes
                    exactly the way the picture does. Without it the shapes stretch into the black
                    bars and sit off the cells they describe.
                -->
                <svg
                    v-if="showShapes && natural && shapes.length"
                    class="tw:pointer-events-none tw:absolute tw:inset-0 tw:h-full tw:w-full"
                    :viewBox="`0 0 ${natural.w} ${natural.h}`"
                    preserveAspectRatio="xMidYMid meet"
                >
                    <AnnotationOverlay
                        :shapes="shapes"
                        :natural="natural"
                        :palette="palette"
                        :width-for="() => strokeWidth"
                    />
                </svg>

                <button
                    v-if="shapes.length"
                    type="button"
                    class="tw:absolute tw:top-2 tw:right-2 tw:flex tw:h-[26px] tw:items-center tw:gap-1.5 tw:rounded-[7px] tw:border tw:border-white/15 tw:bg-black/70 tw:px-2 tw:text-[11px] tw:text-an-d-icon tw:hover:text-white"
                    :aria-pressed="showShapes"
                    @click="showShapes = !showShapes"
                >
                    <Eye v-if="showShapes" class="tw:h-3.5 tw:w-3.5" />
                    <EyeOff v-else class="tw:h-3.5 tw:w-3.5" />
                    Shapes
                </button>

                <!-- Prev/next on the picture, so walking a batch never needs the grid. -->
                <button
                    type="button"
                    class="tw:absolute tw:top-1/2 tw:left-2 tw:flex tw:h-[34px] tw:w-[26px] tw:-translate-y-1/2 tw:items-center tw:justify-center tw:rounded-[7px] tw:border tw:border-white/15 tw:bg-black/60 tw:text-an-d-strong tw:hover:bg-black/80"
                    aria-label="Previous image"
                    @click="emit('previous')"
                >
                    <ChevronLeft class="tw:h-3.5 tw:w-3.5" />
                </button>
                <button
                    type="button"
                    class="tw:absolute tw:top-1/2 tw:right-2 tw:flex tw:h-[34px] tw:w-[26px] tw:-translate-y-1/2 tw:items-center tw:justify-center tw:rounded-[7px] tw:border tw:border-white/15 tw:bg-black/60 tw:text-an-d-strong tw:hover:bg-black/80"
                    aria-label="Next image"
                    @click="emit('next')"
                >
                    <ChevronRight class="tw:h-3.5 tw:w-3.5" />
                </button>
                <span
                    v-if="position"
                    class="tw:absolute tw:bottom-2 tw:left-2 tw:flex tw:h-[22px] tw:items-center tw:rounded-md tw:border tw:border-white/15 tw:bg-black/70 tw:px-1.5 tw:font-mono tw:text-[10.5px] tw:text-an-d-text tw:tabular-nums"
                >
                    {{ position.index }} / {{ position.total }}
                </span>
            </div>

            <div class="tw:border-b tw:border-an-divider tw:p-3.5">
                <McButton class="tw:w-full tw:justify-center" @click="emit('annotate', detail.id)">
                    <Pencil class="tw:h-3.5 tw:w-3.5" />
                    Annotate
                </McButton>
                <div class="tw:mt-2 tw:flex tw:gap-2">
                    <McSelect
                        v-model="selectedModel"
                        :options="detectors"
                        option-value="value"
                        option-label="label"
                        placeholder="Pick a model"
                        class="tw:min-w-0 tw:flex-1"
                    />
                    <McButton
                        size="sm"
                        variant="outline"
                        :disabled="!selectedModel || isRunning"
                        :loading="isRunning"
                        @click="runModel"
                    >
                        <Play class="tw:h-3.5 tw:w-3.5" />
                        Run
                    </McButton>
                </div>
            </div>

            <div class="tw:border-b tw:border-an-divider tw:p-3.5">
                <h4
                    class="tw:mb-2.5 tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-an-n-400 tw:uppercase"
                >
                    Details
                </h4>
                <dl class="tw:grid tw:grid-cols-[104px_1fr] tw:gap-x-2.5 tw:gap-y-2 tw:text-[12px]">
                    <dt class="tw:text-an-n-500">Dimensions</dt>
                    <dd class="tw:font-mono tw:text-an-n-700 tw:tabular-nums">
                        {{ natural ? `${natural.w} x ${natural.h}` : '-' }}
                    </dd>
                    <dt class="tw:text-an-n-500">Size</dt>
                    <dd class="tw:font-mono tw:text-an-n-700 tw:tabular-nums">
                        {{ humanSize ?? '-' }}
                    </dd>
                    <dt class="tw:text-an-n-500">Format</dt>
                    <dd class="tw:font-mono tw:text-an-n-700">{{ fileType ?? '-' }}</dd>
                    <dt class="tw:text-an-n-500">Uploaded</dt>
                    <dd class="tw:font-mono tw:text-an-n-700 tw:tabular-nums">
                        {{ formatDayTime(detail.created_at) }}
                    </dd>
                    <dt class="tw:text-an-n-500">Album</dt>
                    <dd>
                        <!--
                            Comma separated, because an image can sit in several albums and the
                            names ran together: "BIO 101 E2E Smoke Assignment" reads as one album
                            with an odd name rather than as two. The separator is rendered as its
                            own muted span so it does not take the accent colour the names carry.
                        -->
                        <span v-if="filedIn.length" class="tw:flex tw:flex-wrap">
                            <span v-for="(album, index) in filedIn" :key="album.id">
                                <span class="tw:text-an-accent-hover">{{ album.name }}</span>
                                <span v-if="index < filedIn.length - 1" class="tw:text-an-n-400">
                                    ,&nbsp;
                                </span>
                            </span>
                        </span>
                        <!-- The fix lives where the gap is: a dead "Not in any album" sentence is
                             replaced by the control that ends it. -->
                        <McDropdownMenu v-else-if="addableAlbums.length">
                            <McDropdownMenuTrigger as-child>
                                <button
                                    type="button"
                                    class="tw:flex tw:items-center tw:gap-1 tw:text-[12px] tw:text-an-accent-hover tw:hover:underline"
                                >
                                    <FolderPlus class="tw:h-3.5 tw:w-3.5" />
                                    Add to album
                                </button>
                            </McDropdownMenuTrigger>
                            <McDropdownMenuContent align="start">
                                <McDropdownMenuItem
                                    v-for="album in addableAlbums"
                                    :key="album.id"
                                    @select="emit('add-to-album', album.id)"
                                >
                                    {{
                                        album.kind === 'curated'
                                            ? `${album.name} (curated)`
                                            : album.name
                                    }}
                                </McDropdownMenuItem>
                            </McDropdownMenuContent>
                        </McDropdownMenu>
                        <span v-else class="tw:text-an-n-400">No albums yet</span>
                    </dd>
                </dl>
            </div>

            <div class="tw:border-b tw:border-an-divider tw:p-3.5">
                <h4
                    class="tw:mb-2.5 tw:flex tw:items-center tw:gap-2 tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-an-n-400 tw:uppercase"
                >
                    Annotations
                    <span
                        v-if="view"
                        class="tw:rounded-[5px] tw:px-1.5 tw:py-0.5 tw:text-[10.5px] tw:font-medium tw:normal-case tw:tracking-normal"
                        :class="
                            view.status === 'reviewed'
                                ? 'tw:bg-an-accent-tint tw:text-an-accent-hover'
                                : view.status === 'empty'
                                  ? 'tw:bg-an-n-100 tw:text-an-n-400'
                                  : 'tw:bg-an-n-100 tw:text-an-n-600'
                        "
                    >
                        {{ view.meta }}
                    </span>
                    <span class="tw:flex-1"></span>
                    <span class="tw:font-mono tw:text-[11px] tw:normal-case tw:tracking-normal">
                        {{ shapes.length }} shape{{ shapes.length === 1 ? '' : 's' }} ·
                        {{ classRows.length }} class{{ classRows.length === 1 ? '' : 'es' }}
                    </span>
                </h4>
                <div
                    v-for="row in classRows"
                    :key="row.label"
                    class="tw:flex tw:h-7 tw:items-center tw:gap-2 tw:text-[12px] tw:text-an-n-700"
                >
                    <span
                        class="tw:h-2.5 tw:w-2.5 tw:shrink-0 tw:rounded-[3px]"
                        :style="{ background: row.color }"
                    ></span>
                    {{ row.label }}
                    <span
                        class="tw:ml-auto tw:font-mono tw:text-[11px] tw:text-an-n-400 tw:tabular-nums"
                    >
                        {{ row.count }}
                    </span>
                </div>
                <p v-if="!classRows.length" class="tw:text-[12px] tw:text-an-n-400">
                    Nothing drawn on this one yet.
                </p>
            </div>

            <div class="tw:border-b tw:border-an-divider tw:p-3.5">
                <h4
                    class="tw:mb-2.5 tw:flex tw:items-center tw:gap-2 tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-an-n-400 tw:uppercase"
                >
                    Model runs
                    <span class="tw:flex-1"></span>
                    <span
                        v-if="!runs.length && !runsLoading"
                        class="tw:text-[11px] tw:normal-case tw:tracking-normal tw:text-an-n-400"
                    >
                        No runs yet
                    </span>
                </h4>
                <ModelRunList
                    :runs="runs"
                    :loading="runsLoading"
                    @seed="emit('annotate', detail.id)"
                />
            </div>

            <div class="tw:p-3.5">
                <h4
                    class="tw:mb-2.5 tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-an-n-400 tw:uppercase"
                >
                    Metadata
                </h4>
                <MetadataEditor :metadata="detail.metadata" @save="saveMetadata" />
            </div>
        </div>
    </template>
</template>
