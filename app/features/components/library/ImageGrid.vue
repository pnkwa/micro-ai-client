<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { AlertCircle, Check, CircleDot, ImageOff, Loader2, Search, Upload } from '@lucide/vue'
import type { LibraryImage } from '~/services/imageService'
import type { QueueRowView } from '~/core/helpers/annotationQueue'
import { useImageObjectUrls } from '~/core/composables/useImageObjectUrls'
import { carriesFiles } from '~/core/composables/useAlbumDrag'
import type { UploadItem } from '~/core/composables/useImageUpload'
import ImageGridTile from './ImageGridTile.vue'
import ImageListRow from './ImageListRow.vue'
import type { GridMetrics } from '~/core/helpers/libraryGrid'
import type { LibraryView } from './LibraryHeader.vue'

/**
 * The grid, and the list that is the same data in rows.
 *
 * It owns the object-URL cache and the fetching; each tile owns its own visibility observer. The
 * page above owns the filters, because the album sidebar and the toolbar change the same query this
 * reads.
 *
 * LAZY, NOT PAGED. A pager under a gallery is a decision someone has to make twenty-four images at a
 * time; the sentinel at the foot of the list asks for the next page when it comes into view, which
 * is the same thing the annotator's queue does. `hasMore` rather than a page count, because the
 * caller appends and the number of loaded rows is the only honest cursor.
 *
 * NOT VIRTUALISED, deliberately, for now. Lazy loading caps what is in the DOM at whatever someone
 * has actually scrolled past, and the thumbnails are the real cost long before the nodes are. If a
 * library grows past a few hundred loaded rows this is the place that will hurt first.
 */
const props = defineProps<{
    images: LibraryImage[]
    /** Keyed by image id, from `queueRowView`, so the badge and the annotator's queue agree. */
    views: Record<number, QueueRowView>
    loading?: boolean
    /** More pages exist on the server. The sentinel only asks while this is true. */
    hasMore?: boolean
    view: LibraryView
    /** Card width, gap, padding and footer height, from `gridMetrics` for the current layout. */
    metrics: GridMetrics
    /**
     * Files can be dropped in from outside. DESKTOP ONLY.
     *
     * A touch drag fires the same native events on some platforms, so an unguarded handler raises
     * the upload overlay when someone drags a card on a tablet. The page decides, from the layout.
     */
    fileDrop?: boolean
    /** No hover on this device: the card drops its hover-revealed controls. */
    touch?: boolean
    /** Phone selection mode: every card wears a checkbox, and a tap means "this one too". */
    selectingMode?: boolean
    /** The ids in the selection. A Set so a grid of 200 does not scan an array per card. */
    selectedIds: Set<number>
    /** Names being written right now, keyed by id, shown optimistically at 60%. */
    pendingNames?: Record<number, string>
    /** Ids currently being dragged onto an album, dimmed to 40% where they still sit. */
    draggingIds?: number[]
    /** Files in flight, rendered as cards at the top of the grid where they will land. */
    uploads?: UploadItem[]
    /** Named in the drop overlay, so it says where the files are going. */
    albumName?: string | null
    /** Any search, chip or album narrowing is on, which decides which empty state applies. */
    filtered?: boolean
    /** Shown when nothing matches, so the copy can name the active filter. */
    emptyMessage?: string
}>()

const emit = defineEmits<{
    select: [image: LibraryImage, modifiers: { shift: boolean; meta: boolean }]
    toggle: [image: LibraryImage]
    annotate: [image: LibraryImage]
    /** Double click on the picture. Reserved for the lightbox; nothing listens yet. */
    open: [image: LibraryImage]
    rename: [image: LibraryImage, title: string]
    /** A press on a card that might become a drag. The page owns the drag itself. */
    'drag-start': [image: LibraryImage, event: PointerEvent]
    'long-press': [image: LibraryImage]
    /** Files dropped from outside the browser. */
    files: [files: File[]]
    'cancel-uploads': []
    /** A click on the grid's own background, which means "none of these". */
    'clear-selection': []
    more: []
    upload: []
    'clear-filters': []
}>()

/**
 * The FILE drop, which is the only native drag-and-drop left on this page.
 *
 * *** `carriesFiles` FIRST, ALWAYS. *** Cards are dragged with pointer events precisely so the two
 * systems never meet, but `dragover` still fires while a card crosses the grid. Without the filter,
 * dragging a picture towards the album column would raise the upload overlay over the thing being
 * aimed at.
 *
 * A depth counter rather than a boolean: `dragenter` and `dragleave` both fire when the pointer
 * crosses into a CHILD element, so a boolean flickers the overlay off over every card it passes.
 */
const dropDepth = ref(0)
const droppable = computed(() => dropDepth.value > 0)

const onDragEnter = (event: DragEvent) => {
    if (!props.fileDrop || !carriesFiles(event)) return
    dropDepth.value += 1
}

const onDragOver = (event: DragEvent) => {
    if (!props.fileDrop || !carriesFiles(event)) return
    // Required, and both halves: without preventDefault the browser opens the file instead.
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

const onDragLeave = (event: DragEvent) => {
    if (!props.fileDrop || !carriesFiles(event)) return
    dropDepth.value = Math.max(0, dropDepth.value - 1)
}

const onDrop = (event: DragEvent) => {
    dropDepth.value = 0
    if (!props.fileDrop || !carriesFiles(event)) return
    event.preventDefault()
    const files = [...(event.dataTransfer?.files ?? [])]
    if (files.length) emit('files', files)
}

/** Anything selected pins every checkbox open, so a batch reads as a batch. */
const selecting = computed(() => props.selectingMode || props.selectedIds.size > 0)

const { urls, errors, load } = useImageObjectUrls()

// The drag ghost shows real thumbnails, and this component is the only place they are cached.
defineExpose({ thumbnails: urls })

const sentinel = useTemplateRef<HTMLElement>('sentinel')

// Always the server's cached 256px downscale. A tile is ~200px and the originals are multi-MB
// microscopy frames; fetching those whole and shrinking them with CSS is how the detection history
// used to do it, and it cost the whole library to show one screen.
const onVisible = (image: LibraryImage) => load(image.id, 'thumb', image.content_hash)

/**
 * ROTATING MUST NOT LOSE YOUR PLACE.
 *
 * The card width changes with the layout, so every row reflows and a pixel scroll position lands
 * somewhere unrelated - three screens away on a long library. The id of the first fully visible
 * card is the only anchor that survives a reflow, because it is about content rather than geometry.
 */
const container = useTemplateRef<HTMLElement>('container')

const firstVisibleId = (): number | null => {
    const root = container.value
    if (!root) return null
    const top = root.getBoundingClientRect().top
    for (const el of root.querySelectorAll<HTMLElement>('[data-card-id]')) {
        if (el.getBoundingClientRect().top >= top - 1) return Number(el.dataset.cardId)
    }
    return null
}

watch(
    () => props.metrics.col,
    async () => {
        const anchor = firstVisibleId()
        await nextTick()
        if (anchor === null) return
        container.value
            ?.querySelector(`[data-card-id="${anchor}"]`)
            ?.scrollIntoView({ block: 'start' })
    },
)

useIntersectionObserver(
    sentinel,
    ([entry]) => {
        if (entry?.isIntersecting && !props.loading && props.hasMore) emit('more')
    },
    { root: container, rootMargin: '400px' },
)

/**
 * The grid's own geometry, all four numbers from one table.
 *
 * *** FIXED WIDTH, NOT `minmax(x, 1fr)`. *** With `1fr` every card stretches to share the row, so
 * opening the inspector - which takes 400px off the grid - resized every picture on screen at the
 * moment someone clicked one. A click should indicate, not reflow. At a fixed width the grid drops
 * a column instead and every remaining card is the size it was, which also means the card you just
 * clicked stays under your cursor.
 *
 * `auto-fill` still does the responsive work, so one number covers a 1400px screen and a 900px one
 * without a breakpoint per size. The cost is a ribbon of space at the right edge when the container
 * does not divide evenly, which is a fair trade for pictures that hold still.
 */
const gridStyle = computed(() => ({
    gridTemplateColumns: `repeat(auto-fill, ${props.metrics.col}px)`,
    gap: `${props.metrics.gap}px`,
}))
</script>

<template>
    <!-- `self` so only the background itself clears: a click that lands on a card has already been
         handled by the card, and bubbling would undo it immediately. -->
    <div
        ref="container"
        class="tw:relative tw:min-h-0 tw:flex-1 tw:overflow-y-auto"
        :style="{ padding: `${metrics.pad}px` }"
        @click.self="emit('clear-selection')"
        @dragenter="onDragEnter"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
    >
        <!-- In flight, IN PLACE, at the top of the grid: the cards appear where the pictures will
             be, rather than in a dialog that has to be dismissed before you can see them land. -->
        <ul v-if="uploads?.length" class="tw:mb-4 tw:grid" :style="gridStyle">
            <li
                v-for="(item, index) in uploads"
                :key="`${item.file.name}-${index}`"
                class="tw:overflow-hidden tw:rounded-lg tw:border tw:border-an-border tw:bg-an-panel"
            >
                <div
                    class="tw:flex tw:aspect-[4/3] tw:items-center tw:justify-center tw:bg-an-n-100"
                >
                    <Loader2
                        v-if="item.status === 'uploading'"
                        class="tw:h-7 tw:w-7 tw:animate-spin tw:text-an-accent"
                    />
                    <Check
                        v-else-if="item.status === 'created' || item.status === 'existing'"
                        class="tw:h-6 tw:w-6 tw:text-an-accent"
                    />
                    <AlertCircle
                        v-else-if="item.status === 'failed'"
                        class="tw:h-6 tw:w-6 tw:text-danger"
                    />
                    <CircleDot v-else class="tw:h-6 tw:w-6 tw:text-an-n-300" />
                </div>
                <div
                    class="tw:flex tw:flex-col tw:justify-center tw:gap-[3px] tw:px-2.5"
                    :style="{ height: `${metrics.footer}px` }"
                >
                    <p class="tw:truncate tw:font-mono tw:text-[11.5px] tw:text-an-n-700">
                        {{ item.file.name }}
                    </p>
                    <p class="tw:truncate tw:text-[10.5px] tw:text-an-faint">
                        {{ item.message ?? item.status }}
                    </p>
                </div>
            </li>
        </ul>
        <button
            v-if="uploads?.some((item) => item.status === 'pending' || item.status === 'uploading')"
            type="button"
            class="tw:mb-4 tw:text-[11.5px] tw:text-an-n-500 tw:underline tw:hover:text-an-text"
            @click="emit('cancel-uploads')"
        >
            Cancel the rest
        </button>
        <ul v-if="images.length && view === 'grid'" class="tw:grid" :style="gridStyle">
            <ImageGridTile
                v-for="image in images"
                :key="image.id"
                :image="image"
                :view="views[image.id] ?? { status: 'empty', badge: null, meta: 'no shapes yet' }"
                :root="container"
                :thumbnail="urls[image.id]"
                :error="errors[image.id]"
                :selected="selectedIds.has(image.id)"
                :selecting="selecting"
                :pending-name="pendingNames?.[image.id] ?? null"
                :footer-height="metrics.footer"
                :touch="touch"
                :dragging="draggingIds?.includes(image.id)"
                @visible="onVisible(image)"
                @select="emit('select', image, $event)"
                @toggle="emit('toggle', image)"
                @annotate="emit('annotate', image)"
                @open="emit('open', image)"
                @rename="emit('rename', image, $event)"
                @drag-start="emit('drag-start', image, $event)"
                @long-press="emit('long-press', image)"
            />
        </ul>

        <!-- The list is the same rows, the same filters and the same lazy loading - including the
             per-row thumbnail fetch, which it did not have while it was written inline here. -->
        <ul v-else-if="images.length" class="tw:flex tw:flex-col">
            <ImageListRow
                v-for="image in images"
                :key="image.id"
                :image="image"
                :view="views[image.id] ?? { status: 'empty', badge: null, meta: 'no shapes yet' }"
                :root="container"
                :thumbnail="urls[image.id]"
                :error="errors[image.id]"
                :selected="selectedIds.has(image.id)"
                @visible="onVisible(image)"
                @select="emit('select', image, $event)"
            />
        </ul>

        <!-- Skeletons, never a spinner: the shape of what is coming is itself information, and a
             spinner over an empty page reads as a page that failed. -->
        <ul v-else-if="loading" class="tw:grid" :style="gridStyle">
            <li v-for="n in 12" :key="n">
                <McSkeleton class="tw:aspect-[4/3] tw:w-full tw:rounded-lg" />
            </li>
        </ul>

        <!-- Two empty states, and the difference is the whole point. A filter that matches nothing
             must not offer Upload: the pictures are there, the filter is hiding them. -->
        <div
            v-else-if="filtered"
            class="tw:grid tw:justify-items-center tw:gap-2 tw:px-5 tw:py-10 tw:text-center"
        >
            <span
                class="tw:mb-0.5 tw:flex tw:h-9 tw:w-9 tw:items-center tw:justify-center tw:rounded-[9px] tw:bg-an-n-100 tw:text-an-n-300"
            >
                <Search class="tw:h-4.5 tw:w-4.5" />
            </span>
            <p class="tw:text-[13px] tw:font-semibold tw:text-an-text">Nothing matches</p>
            <p class="tw:max-w-[34ch] tw:text-[12px] tw:text-an-muted">
                {{ emptyMessage ?? 'Try a different title, album or label state.' }}
            </p>
            <McButton variant="outline" size="sm" class="tw:mt-1.5" @click="emit('clear-filters')">
                Clear filters
            </McButton>
        </div>

        <div
            v-else
            class="tw:grid tw:justify-items-center tw:gap-2 tw:px-5 tw:py-10 tw:text-center"
        >
            <span
                class="tw:mb-0.5 tw:flex tw:h-9 tw:w-9 tw:items-center tw:justify-center tw:rounded-[9px] tw:bg-an-n-100 tw:text-an-n-300"
            >
                <ImageOff class="tw:h-4.5 tw:w-4.5" />
            </span>
            <p class="tw:text-[13px] tw:font-semibold tw:text-an-text">No images yet</p>
            <p class="tw:max-w-[34ch] tw:text-[12px] tw:text-an-muted">
                Upload microscope captures to label them and train a model.
            </p>
            <McButton size="sm" class="tw:mt-1.5" @click="emit('upload')">
                <Upload class="tw:h-3.5 tw:w-3.5" />
                Upload images
            </McButton>
        </div>

        <!-- Appending, rather than a first load: a row of skeletons under what is already there. -->
        <ul v-if="images.length && loading" class="tw:mt-4 tw:grid" :style="gridStyle">
            <li v-for="n in 4" :key="n">
                <McSkeleton class="tw:aspect-[4/3] tw:w-full tw:rounded-lg" />
            </li>
        </ul>

        <div ref="sentinel" class="tw:h-px"></div>

        <!-- Over the whole scroll area, and `pointer-events-none` so it cannot swallow the drop it
             is advertising. -->
        <div
            v-if="droppable"
            class="tw:pointer-events-none tw:absolute tw:inset-3 tw:z-30 tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-[10px] tw:border-2 tw:border-dashed tw:border-an-accent tw:bg-an-accent/[0.06] tw:text-an-accent-hover"
        >
            <Upload class="tw:h-4.5 tw:w-4.5" />
            <p class="tw:text-[12.5px] tw:font-medium">Drop images to upload</p>
            <p v-if="albumName" class="tw:text-[11.5px] tw:text-an-n-500">to {{ albumName }}</p>
        </div>
    </div>
</template>
