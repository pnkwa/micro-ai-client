<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Folder, Plus } from '@lucide/vue'
import { refDebounced, useEventListener } from '@vueuse/core'
import { imageService, LIBRARY_PAGE_SIZE, type LibraryImage } from '~/services/imageService'
import { albumService, type Album, type AlbumInput } from '~/services/albumService'
import { detectionService, type ModelSpec } from '~/services/detectionService'
import { annotationLabelService, type AnnotationLabel } from '~/services/annotationLabelService'
import {
    matchesChip,
    queueCounts,
    queueRowView,
    type QueueFilter,
    type QueueRowView,
} from '~/core/helpers/annotationQueue'
import { metadataTitle } from '~/core/helpers/imageMetadata'
import { imageDisplayName } from '~/core/helpers/imageName'
import { useLibrarySelection } from '~/core/composables/useLibrarySelection'
import { useAlbumDrag } from '~/core/composables/useAlbumDrag'
import { useAppLayout } from '~/core/composables/useAppLayout'
import { gridMetrics } from '~/core/helpers/libraryGrid'
import { useImageUpload } from '~/core/composables/useImageUpload'
import { usePagedImages } from '~/core/composables/usePagedImages'
import SelectionBar from '~/features/components/library/SelectionBar.vue'
import DragGhost from '~/features/components/library/DragGhost.vue'
import Lightbox from '~/features/components/library/Lightbox.vue'
import AlbumRail from '~/features/components/library/AlbumRail.vue'
import AlbumFormDialog from '~/features/components/library/AlbumFormDialog.vue'
import ImageGrid from '~/features/components/library/ImageGrid.vue'
import ImageInspector from '~/features/components/library/inspector/ImageInspector.vue'
import LibraryShell from '~/features/components/library/LibraryShell.vue'
import LibraryHeader from '~/features/components/library/LibraryHeader.vue'
import LibraryToolbar from '~/features/components/library/LibraryToolbar.vue'
import type { LibraryView } from '~/features/components/library/LibraryHeader.vue'
import { LIBRARY_SORTS, type LibrarySort } from '~/features/types/library'
import UploadImages from '~/features/components/library/UploadImages.vue'

/**
 * The image library (BE-ADR-030/031/032).
 *
 * `role: 'instructor'` is how this codebase spells "any staff account" - the middleware's
 * instructor arm is literally `isStaff`, and the server gates every album and annotation route on
 * `@Roles(UserType.Staff)`, which admits admin, instructor and ta alike. A TA is exactly who this
 * feature is for. There is deliberately no client-side rank: RolesGuard is a flat OR over the
 * claims with no hierarchy, so an ordering here would mirror something that does not exist.
 */
definePageMeta({ role: 'instructor' })

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: 'Image Library' }])

const albums = ref<Album[]>([])
const albumsLoading = ref(true)
const albumCounts = ref<Record<number, number>>({})
/**
 * Every image, ignoring the filters, for the "All images" row.
 *
 * `total` is the count for the CURRENT query, so it drops to 3 the moment you pick an album, and
 * the row that means "leave this album" would then advertise the album's own size.
 */
const libraryTotal = ref(0)
const models = ref<ModelSpec[]>([])
/**
 * The caller's own label palette (BE-ADR-038), for the colours the inspector's overlay paints with.
 *
 * Unfiltered: `?hide_orphan=true` is only safe as an opening question in the annotator, where a
 * class is being used as it is created. Here it would drop the colour of a label whose only boxes
 * are on the image being looked at.
 */
const palette = ref<AnnotationLabel[]>([])

// ---- what the grid shows -------------------------------------------------------------------------

const albumId = ref<number | null>(null)
const search = ref('')
const mine = ref(false)
const view = ref<LibraryView>('grid')
const sort = ref<LibrarySort>('newest')
const filter = ref<QueueFilter>('all')
/**
 * The album drawer, below Full.
 *
 * At Full the albums are simply a column: there is no collapse, because a 240px list beside a grid
 * of 208px cards is not what a 1280px screen is short of, and a toggle for it was one more control
 * to reason about. Below Full the column is not affordable and the same list arrives as a drawer
 * over the grid, opened from the toolbar's album chip.
 */
const drawerOpen = ref(false)
/** The phone's album picker, which replaces the drag the sidebar is not on screen for. */
const albumSheetOpen = ref(false)

/**
 * SELECTION MODE, a phone-only state.
 *
 * On a desktop a checkbox is one hover away, so a selection is something you fall into. A phone has
 * no hover: a long press has to say "I am picking now", and every tap after that means "this one
 * too" rather than "open this". One gesture, one meaning, and an explicit way out.
 */
const selecting = ref(false)

/** The grid, for the thumbnail cache the drag ghost paints with. */
const grid = useTemplateRef<{ thumbnails: Record<number, string> }>('grid')
const uploadOpen = ref(false)
const albumFormOpen = ref(false)
const albumBeingEdited = ref<Album | null>(null)
const albumSaving = ref(false)
const albumPendingDelete = ref<Album | null>(null)

// A keystroke per request would be one round trip per character on a server-side search.
const debouncedSearch = refDebounced(search, 300)

// The grid is one paged listing (usePagedImages): images, total and the load/append/reset live
// there. Only the SERVER-side half of the view is a filter - the chips and the sort are applied to
// what is already loaded, so putting them here would refetch for nothing. It watches a serialised
// key of these, so a change touching two at once is still a single request from page 1.
const {
    images,
    total,
    page,
    loading: imagesLoading,
    hasMore,
    load: loadImages,
    loadMore,
} = usePagedImages({
    perPage: LIBRARY_PAGE_SIZE,
    initialLoading: true,
    clearOnError: true,
    filters: () => ({
        ...(albumId.value !== null && { album_id: albumId.value }),
        ...(debouncedSearch.value && { q: debouncedSearch.value }),
        ...(mine.value && { mine: true }),
    }),
})

const activeAlbum = computed(() => albums.value.find((a) => a.id === albumId.value) ?? null)

// Albums offered by the "Add to album" menus. When an album is being viewed its images are already
// in it, so filing them into it again is a no-op: drop it from the choices. With no album active
// (the All-images view) nothing is dropped.
const albumsToAddTo = computed(() => albums.value.filter((a) => a.id !== albumId.value))

/**
 * The status of every loaded row, from the annotator's own selector.
 *
 * ONE SELECTOR, TWO PAGES: `queueRowView` is what paints the annotator queue's badge, and reusing it
 * is the point rather than a convenience. If the library and the queue ever disagree about whether
 * an image is done, that is a bug, and there is now only one place it could come from.
 *
 * `seededUnreviewed` and `unsavedEdits` are always false and zero here. Both are session facts that
 * live in the annotator - nothing on the server records that an annotation came from a model - so
 * the library can only ever render three of the five states. Named rather than omitted, so the gap
 * is visible at the call site.
 */
const rowViews = computed<Record<number, QueueRowView>>(() => {
    const views: Record<number, QueueRowView> = {}
    for (const image of images.value) {
        views[image.id] = queueRowView({
            annotationCount: image.annotation_count,
            reviewed: image.metadata?.reviewed === true,
            seededUnreviewed: false,
            unsavedEdits: 0,
        })
    }
    return views
})

const counts = computed(() =>
    queueCounts(images.value.map((image) => rowViews.value[image.id]?.status ?? 'empty')),
)

const captionOf = (image: LibraryImage) => imageDisplayName(image.metadata, image.id)

/**
 * The chips and the sort run over the LOADED rows, not the library.
 *
 * Search, album and My uploads are server-side and restart the listing; the chips cannot be,
 * because the status they filter on is `metadata.reviewed` plus a caller-scoped count and
 * `?annotated=` has no way to express the three-way split. The annotator's queue draws the same
 * line for the same reason.
 *
 * So a sort other than the server's own order sorts what has been fetched. Scrolling further can
 * therefore insert a row above where you are looking. The alternative is downloading the whole
 * library before showing anything, which is the thing lazy loading exists to avoid.
 */
const visible = computed(() => {
    const rows = images.value.filter((image) =>
        matchesChip(rowViews.value[image.id]?.status ?? 'empty', filter.value),
    )
    const by = sort.value
    if (by === 'newest') return rows
    return [...rows].sort((a, b) => {
        switch (by) {
            case 'oldest':
                return a.created_at.localeCompare(b.created_at)
            case 'name':
                return captionOf(a).localeCompare(captionOf(b))
            case 'shapes':
                return b.annotation_count - a.annotation_count
            case 'unreviewed':
                return (
                    Number(a.metadata?.reviewed === true) - Number(b.metadata?.reviewed === true) ||
                    b.created_at.localeCompare(a.created_at)
                )
            default:
                return 0
        }
    })
})

const filtered = computed(
    () =>
        Boolean(debouncedSearch.value) ||
        mine.value ||
        albumId.value !== null ||
        filter.value !== 'all',
)

const emptyMessage = computed(() => {
    if (debouncedSearch.value) return `Nothing matches "${debouncedSearch.value}".`
    if (filter.value === 'done') return 'Nothing here has been marked reviewed yet.'
    if (filter.value === 'progress') return 'Nothing here is part-labelled.'
    if (filter.value === 'todo') return 'Everything loaded here already has shapes on it.'
    if (mine.value) return 'You have not uploaded anything yet.'
    if (activeAlbum.value) return `${activeAlbum.value.name} has no images filed into it.`
    return 'Upload a picture to start building the library.'
})

const clearFilters = () => {
    search.value = ''
    mine.value = false
    filter.value = 'all'
    albumId.value = null
}

// ---- selection ---------------------------------------------------------------------------------

/**
 * The ids in the order they are RENDERED, which is what a Shift range has to measure over.
 *
 * `visible` is filtered by chip and reordered by sort, so passing `images` instead would let a range
 * take rows nobody pointed at.
 */
const orderedIds = computed(() => visible.value.map((image) => image.id))

const {
    selected: selectedIds,
    count: selectedCount,
    click: selectClick,
    toggle: selectToggle,
    clear: clearSelection,
    prune: pruneSelection,
    selectAll,
} = useLibrarySelection(orderedIds)

// An effect rather than derived state, because pruning is an event: rows leave when a filter
// narrows or an image is deleted, and a selection that outlives them could hand a bulk action ids
// nobody can see.
watch(orderedIds, () => pruneSelection())

const selectedImages = computed(() =>
    images.value.filter((image) => selectedIds.value.has(image.id)),
)

/** True only when the album column is showing one, which is what "remove from album" needs. */
const canUnfile = computed(() => albumId.value !== null && selectedCount.value > 0)

const bulkDeleteOpen = ref(false)

// ---- the inspector -------------------------------------------------------------------------------

/**
 * Open or closed, and it STAYS that way while you click through the grid.
 *
 * A click opens it and swaps its contents; Esc or the close button shuts it, and it stays shut
 * until the next card click or the header toggle. That is the whole difference from the sheet it
 * replaces, which reopened itself on every selection and covered the grid each time.
 */
const inspectorOpen = ref(false)

/**
 * The lightbox: Enter or a double click on a card, Esc back to the grid.
 *
 * *** THE SELECTION SURVIVES IT. *** It reads the same single selection the panel does and closing
 * changes nothing else, so opening a picture to look closely and coming back does not cost the
 * batch someone was assembling.
 */
const lightboxOpen = ref(false)

/**
 * Three layouts, decided by WIDTH alone.
 *
 * `full` docks everything. `medium` (a tablet, either orientation) keeps the grid full width and
 * turns both side panels into overlays. `compact` is one pane. Nothing here branches on orientation
 * or on a device: iPad portrait at 820px shows four columns perfectly well.
 */
const { layout, isFull, isCompact } = useAppLayout()

/** Card, gap, padding and footer, all from the one table. */
const metrics = computed(() => gridMetrics(layout.value))

/** Docked at Full; at Medium the same panel arrives as an overlay sheet from the right. */
const canDock = isFull

/** Exactly one image selected: the panel's single-image state. Anything else is the batch. */
const inspected = computed(() =>
    selectedImages.value.length === 1 ? selectedImages.value[0]! : null,
)

/**
 * Picking an album in the drawer both filters and closes it.
 *
 * A named handler rather than two statements in the template: a multi-statement inline handler has
 * to carry its own semicolons, and the formatter splits it across lines without them, which the SFC
 * compiler rejects while `vue-tsc` is perfectly happy. One of those failures reaches the browser.
 */
const onDrawerSelect = (id: number | null) => {
    albumId.value = id
    drawerOpen.value = false
}

/** Every name in view except the one being renamed, for the duplicate note under the input. */
const siblingNames = computed(() =>
    visible.value
        .filter((image) => image.id !== inspected.value?.id)
        .map((image) => imageDisplayName(image.metadata, image.id)),
)

const inspector = useTemplateRef<{ startRename: () => void }>('inspector')

const inspectedIndex = computed(() => {
    if (!inspected.value) return null
    const index = visible.value.findIndex((image) => image.id === inspected.value!.id)
    return index === -1 ? null : { index: index + 1, total: visible.value.length }
})

/**
 * Walk the filtered set with the panel open.
 *
 * Over `visible` rather than `images`, because the arrows have to follow what is on screen: a chip
 * that hides half the library must hide it from the arrows too.
 */
const step = (delta: number) => {
    const rows = visible.value
    if (!rows.length) return
    const current = inspected.value ? rows.findIndex((row) => row.id === inspected.value!.id) : -1
    const next = rows[(current + delta + rows.length) % rows.length]
    if (next) selectClick(next.id, {})
}

// ---- loading -------------------------------------------------------------------------------------

/**
 * How many images each album holds.
 *
 * `GET /albums` carries no count, so this is one `per_page: 1` listing per album, read for its
 * `total` alone. Cheap because albums are few and it happens once per album load; requested as a
 * row field on 2026-08-30 so it can go away.
 */
const loadAlbumCounts = async (rows: Album[]) => {
    const entries = await Promise.all(
        rows.map(async (album) => {
            try {
                const { total: count } = await imageService.list({
                    album_id: album.id,
                    per_page: 1,
                })
                return [album.id, count] as const
            } catch {
                // A count is decoration. A failed one leaves the row without a number rather than
                // failing the column that navigates the library.
                return null
            }
        }),
    )
    albumCounts.value = Object.fromEntries(entries.filter((entry) => entry !== null))
    try {
        libraryTotal.value = (await imageService.list({ per_page: 1 })).total
    } catch {
        // Same reasoning: a missing count leaves the row without a number.
    }
}

const loadAlbums = async () => {
    albumsLoading.value = true
    try {
        albums.value = await albumService.list()
        void loadAlbumCounts(albums.value)
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not load the albums'))
    } finally {
        albumsLoading.value = false
    }
}

await Promise.all([
    loadAlbums(),
    loadImages(),
    detectionService
        .listModels()
        .then((list) => (models.value = list))
        // The picker is one affordance in a panel; the library still works without it.
        .catch(() => undefined),
    annotationLabelService
        .list()
        .then((list) => (palette.value = list))
        // Without it the overlay falls back to white outlines, which is a degraded panel rather
        // than a broken page.
        .catch(() => undefined),
])

// ---- albums --------------------------------------------------------------------------------------

const onAlbumSave = async (input: AlbumInput) => {
    albumSaving.value = true
    try {
        if (albumBeingEdited.value) {
            await albumService.update(albumBeingEdited.value.id, input)
        } else {
            const created = await albumService.create(input)
            // A drop on "New album" carried images with it, and they are what the album was made
            // for: filing them here rather than asking for the drag again.
            const waiting = pendingNewAlbumIds.value
            pendingNewAlbumIds.value = []
            if (waiting.length) await onDropOnAlbum(created.id, waiting)
        }
        albumFormOpen.value = false
        albumBeingEdited.value = null
        await loadAlbums()
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not save the album'))
    } finally {
        albumSaving.value = false
    }
}

const onAlbumDelete = async () => {
    const album = albumPendingDelete.value
    if (!album) return
    try {
        await albumService.remove(album.id)
        if (albumId.value === album.id) albumId.value = null
        page.value = 1
        await Promise.all([loadAlbums(), loadImages()])
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not delete the album'))
    } finally {
        albumPendingDelete.value = null
    }
}

/**
 * Dragging cards onto an album row.
 *
 * *** ADD ONLY. THIS DRAG HAS NO REMOVE PATH IN IT. *** The previous version was a MOVE: it filed
 * the image and then unfiled it from every other album, which meant dragging a picture out of a
 * curated album silently ended its eligibility to back a question. `album_images` is genuinely
 * many-to-many (BE-ADR-032), so "move" was a client-side invention rather than a rule. Until the
 * membership question is answered, a drop adds and nothing else; removing is the selection bar's
 * "Remove from this album", where it is spelled out.
 */
const dragThumbnails = computed(() => grid.value?.thumbnails ?? {})

const {
    dragging,
    ids: draggingIds,
    payload: dragPayload,
    position: dragPosition,
    targetAlbum,
    begin: beginDrag,
} = useAlbumDrag((album, ids) => void onDropOnAlbum(album, ids), {
    // Holding a selection over the album chip opens the drawer under it, so a drag at Medium can
    // reach rows that are not on screen when it starts.
    onSpring: () => (drawerOpen.value = true),
    // *** NO CARD DRAG ON A PHONE. *** There is no album column at Compact and no drawer worth
    // dragging into on a 390px screen; `Add to album` in the selection bar is the path there, and a
    // half-working drag would just fight the scroll.
    enabled: () => !isCompact.value,
})

/**
 * A press on a card, which may or may not become a drag.
 *
 * Finder's rule, and it is the one people expect: dragging a card already IN the selection takes
 * the whole selection with it; dragging one that is not takes only that card, and collapses the
 * selection onto it - but only ONCE THE DRAG ACTUALLY STARTS, which is the subtle half.
 *
 * *** THE SELECTION MUST NOT MOVE ON POINTERDOWN. *** It runs before `click`, so collapsing here
 * would destroy the anchor a Shift-click is about to measure from, and ranges would silently
 * select one card. A press with a modifier is not a drag at all: it belongs to the click.
 */
/**
 * A click on a card: select it, and open the panel beside it.
 *
 * A single click never takes anything away - it ADDS the inspector next to what you were already
 * looking at. A modifier click is about building a selection rather than inspecting one, so it does
 * not force the panel open, but it does update it when it is already there.
 */
const onCardSelect = (image: LibraryImage, modifiers: { shift: boolean; meta: boolean }) => {
    // On a phone a tap either adds to the batch being picked, or opens the picture. There is no
    // third thing for it to mean, and no room for a panel beside the grid to put it in.
    if (isCompact.value) {
        if (selecting.value) selectToggle(image.id)
        else onOpenLightbox(image)
        return
    }
    selectClick(image.id, modifiers)
    if (!modifiers.shift && !modifiers.meta) inspectorOpen.value = true
}

/** A long press starts the batch with the card that was held. */
const onLongPress = (image: LibraryImage) => {
    if (!isCompact.value) return
    selecting.value = true
    if (!selectedIds.value.has(image.id)) selectToggle(image.id)
}

const onSheetAddToAlbum = (id: number) => {
    albumSheetOpen.value = false
    void addSelectedToAlbum(id)
}

const onNewAlbumFromSheet = () => {
    albumSheetOpen.value = false
    pendingNewAlbumIds.value = selectedImages.value.map((image) => image.id)
    openCreateAlbum()
}

const stopSelecting = () => {
    selecting.value = false
    clearSelection()
}

// Selection mode is a phone state and a phone state only: growing the window out of Compact would
// otherwise strand it, with a header nobody can dismiss on a layout that has no way back to it.
watch(isCompact, (compact) => {
    if (!compact) selecting.value = false
})

/** Double click on the picture. It selects on the first click, so this only has to open. */
const onOpenLightbox = (image: LibraryImage) => {
    selectClick(image.id, {})
    lightboxOpen.value = true
}

const onCardDragStart = (image: LibraryImage, event: PointerEvent) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) return
    const ids = selectedIds.value.has(image.id)
        ? orderedIds.value.filter((id) => selectedIds.value.has(id))
        : [image.id]
    beginDrag(event, {
        ids,
        thumbnails: ids
            .map((id) => dragThumbnails.value[id])
            .filter((url): url is string => Boolean(url)),
        label: ids.length === 1 ? captionOf(image) : '',
    })
}

// The collapse, deferred to the moment a drag is real. Dragging a card that was not selected
// selects it, so the grid and the ghost agree about what is being moved.
watch(dragging, (on) => {
    const only = draggingIds.value
    if (on && only.length === 1 && !selectedIds.value.has(only[0]!)) selectClick(only[0]!, {})
})

/** Read out to anyone not watching the pointer. Drag is never the only route to this. */
const dragAnnouncement = ref('')

/**
 * The drop: optimistic, then the requests, with an undo that holds for ten seconds.
 *
 * Undo here is honest, unlike the one delete cannot offer: filing is reversible by construction,
 * `DELETE /albums/:id/images/:imageId` is the exact inverse, and nothing was destroyed in between.
 */
const onDropOnAlbum = async (album: number | 'new', ids: number[]) => {
    if (album === 'new') {
        // The create dialog rather than an inline rename row: naming an album has a form already,
        // and half an inline-rename system in the sidebar would be a second way to name things.
        pendingNewAlbumIds.value = ids
        openCreateAlbum()
        return
    }
    const name = albums.value.find((row) => row.id === album)?.name ?? 'the album'
    try {
        for (const id of ids) await albumService.addImage(album, id)
        for (const id of ids) onImageChanged(await imageService.get(id))
        void loadAlbumCounts(albums.value)
        dragAnnouncement.value = `${ids.length} image(s) added to ${name}`
        toast.success(`${ids.length} image(s) added to ${name}`, {
            duration: 10000,
            action: {
                label: 'Undo',
                onClick: () => void undoFiling(album, ids, name),
            },
        })
    } catch (error) {
        toast.error(apiErrorMessage(error, `Could not add every image to ${name}`))
        await loadImages()
    }
}

const undoFiling = async (album: number, ids: number[], name: string) => {
    try {
        for (const id of ids) await albumService.removeImage(album, id)
        for (const id of ids) onImageChanged(await imageService.get(id))
        void loadAlbumCounts(albums.value)
        dragAnnouncement.value = `Undone. Removed from ${name}`
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not undo that'))
    }
}

/** Images waiting for the album being created to exist, from a drop on the New album row. */
const pendingNewAlbumIds = ref<number[]>([])

const openCreateAlbum = () => {
    albumBeingEdited.value = null
    albumFormOpen.value = true
}

const openEditAlbum = (album: Album) => {
    albumBeingEdited.value = album
    albumFormOpen.value = true
}

// ---- images --------------------------------------------------------------------------------------

// The panel edited the image; patch the row in place rather than re-listing, so the grid does not
// scroll-jump under a panel that is still open - which with lazy loading would also throw away
// every page after the first.
const onImageChanged = (image: LibraryImage) => {
    const index = images.value.findIndex((row) => row.id === image.id)
    if (index !== -1) images.value[index] = image
}

const onImageDeleted = (imageId: number) => {
    images.value = images.value.filter((row) => row.id !== imageId)
    total.value = Math.max(0, total.value - 1)
    void loadAlbumCounts(albums.value)
}

/**
 * Files dropped straight onto the grid.
 *
 * The same queue the dialog uses, filed into the album currently being viewed - dropping into
 * "Week 3" and then having to say where it went would be a dialog with extra steps. The cards clear
 * a moment after they settle, once the real rows have arrived to replace them.
 */
const dropUpload = useImageUpload()

const onFilesDropped = async (files: File[]) => {
    dropUpload.addFiles(files)
    const outcome = await dropUpload.start(albumId.value)
    await onUploaded()
    const parts = [
        outcome.created ? `${outcome.created} uploaded` : '',
        outcome.existing ? `${outcome.existing} already in the library` : '',
        outcome.cancelled ? `${outcome.cancelled} cancelled` : '',
    ].filter(Boolean)
    if (outcome.failed) toast.error(`${outcome.failed} file(s) could not be uploaded.`)
    if (parts.length) toast.success(parts.join(', '))
    // Kept on screen for a beat so a failure is readable, then cleared: the real cards are the
    // record from here on.
    setTimeout(() => dropUpload.reset(), outcome.failed ? 6000 : 1200)
}

const onUploaded = async () => {
    page.value = 1
    await loadImages()
    void loadAlbumCounts(albums.value)
}

/**
 * Rename, optimistically.
 *
 * The new name shows on the card immediately, at 60%, and the PATCH follows. On failure the name
 * rolls back and the toast names the image, because by then the person has moved on and "could not
 * rename" without a subject is useless.
 *
 * `title` is METADATA. Nothing about how the bytes are stored or addressed moves with it, which is
 * the property that keeps a rename from ever producing a broken image.
 */
const pendingNames = ref<Record<number, string>>({})

const onRename = async (image: LibraryImage, title: string) => {
    const before = imageDisplayName(image.metadata, image.id)
    pendingNames.value = { ...pendingNames.value, [image.id]: title }
    try {
        onImageChanged(await imageService.updateMetadata(image.id, { title }))
    } catch (error) {
        toast.error(apiErrorMessage(error, `Could not rename ${before}. Try again.`))
    } finally {
        const { [image.id]: _dropped, ...rest } = pendingNames.value
        pendingNames.value = rest
    }
}

// ---- bulk actions ------------------------------------------------------------------------------

/**
 * Filing a batch is N requests, one per image, and that is deliberate rather than a gap.
 *
 * `POST /albums/:id/images` takes one image and is idempotent, so a partly-failed batch is safe to
 * retry, and we asked the backend NOT to build a bulk endpoint for it. Sequential rather than
 * parallel for the same reason the uploader is: a predictable order is worth more than the seconds.
 */
const addSelectedToAlbum = async (target: number) => {
    const batch = selectedImages.value
    const name = albums.value.find((album) => album.id === target)?.name ?? 'the album'
    try {
        for (const image of batch) await albumService.addImage(target, image.id)
        // `in_curated_album` is computed server-side and badges the card, so the rows are re-read
        // rather than patched from here.
        for (const image of batch) onImageChanged(await imageService.get(image.id))
        void loadAlbumCounts(albums.value)
        toast.success(`Filed ${batch.length} image(s) into ${name}`)
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not file every image'))
    }
}

const removeSelectedFromAlbum = async () => {
    if (albumId.value === null) return
    const batch = selectedImages.value
    const from = albumId.value
    try {
        for (const image of batch) await albumService.removeImage(from, image.id)
        clearSelection()
        page.value = 1
        await Promise.all([loadImages(), loadAlbumCounts(albums.value)])
        toast.success(`Removed ${batch.length} image(s) from the album`)
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not remove every image'))
    }
}

/**
 * Hand the whole selection to the annotator, which opens on the first and puts the rest in its
 * filmstrip so a batch is stepped through without coming back here.
 *
 * The ids ride as a repeated `?image=` param, which is what the annotator reads. A single selection
 * is therefore identical to `onAnnotate(id)` — one `?image=<id>` — so the deep link keeps working.
 */
const annotateSelected = () => {
    const ids = selectedImages.value.map((image) => image.id)
    if (ids.length) void navigateTo({ path: '/image-annotator', query: { image: ids.map(String) } })
}

/**
 * Download, one file at a time, named after the image.
 *
 * The blob is already how every picture reaches this page: an `<img src>` cannot carry the bearer
 * token, so there is no plain URL to link to and the anchor has to point at an object URL we made.
 * Revoked immediately after the click, which the browser has already queued by then.
 */
const downloadSelected = async () => {
    for (const image of selectedImages.value) {
        try {
            const url = await imageService.blobUrl(image.id, undefined, image.content_hash)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = metadataTitle(image.metadata) ?? `image-${image.id}`
            anchor.click()
            URL.revokeObjectURL(url)
        } catch (error) {
            toast.error(apiErrorMessage(error, `Could not download image ${image.id}`))
        }
    }
}

/**
 * Bulk delete, reported per image.
 *
 * A 409 is the RESTRICT working: an image with model runs against it cannot go, because cascading
 * would take the detection history with it. In a batch that means some succeed and some do not, and
 * a single "could not delete" would leave nobody knowing which. The toast counts both.
 */
const deleteSelected = async () => {
    const batch = selectedImages.value
    const failed: number[] = []
    for (const image of batch) {
        try {
            await imageService.remove(image.id)
            onImageDeleted(image.id)
        } catch {
            failed.push(image.id)
        }
    }
    bulkDeleteOpen.value = false
    clearSelection()
    void loadAlbumCounts(albums.value)
    const deleted = batch.length - failed.length
    if (failed.length) {
        toast.error(
            `Deleted ${deleted} of ${batch.length}. ${failed.length} still have model runs against them.`,
        )
    } else if (deleted) {
        toast.success(`Deleted ${deleted} image(s).`)
    }
}

/**
 * Esc: close the panel, and only THEN clear the selection.
 *
 * Two presses rather than one, because they undo two different things and someone who opened a
 * panel over a batch they spent a minute assembling should not lose the batch to a keystroke aimed
 * at the panel.
 */
/**
 * Esc unwinds ONE layer at a time: the lightbox, then the panel, then the selection.
 *
 * Three things can be open at once and they were opened in that order, so they close in reverse.
 * Collapsing them into one press would mean a keystroke aimed at the viewer also threw away the
 * batch behind it.
 */
const onEscape = () => {
    if (lightboxOpen.value) lightboxOpen.value = false
    else if (inspectorOpen.value) inspectorOpen.value = false
    else clearSelection()
}

/**
 * Esc, on the window rather than on an element.
 *
 * The grid is not focusable, so a keydown bound in the template would only fire after someone had
 * tabbed into something. Guarded on the focused element for the reason every hotkey layer is: Esc
 * inside the rename input has to cancel the rename, not close the panel behind it.
 *
 * This is the ONLY key wired so far. The rest of the map (`/`, arrows, `A`, `X`, `F2`, Cmd-A, `U`,
 * Del) lands with `useLibraryHotkeys`.
 */
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    const el = document.activeElement
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return

    if (event.key === 'Escape') return onEscape()

    // Arrows walk the batch, but only while the lightbox has the screen. In the grid they belong to
    // roving focus between cards, which lands with the rest of the key map.
    if (lightboxOpen.value && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        return step(event.key === 'ArrowLeft' ? -1 : 1)
    }
    if (event.key === 'Enter' && inspected.value && !lightboxOpen.value) {
        event.preventDefault()
        lightboxOpen.value = true
        return
    }
    // F2 renames the selected image, in the panel, where the field is big enough to see what you
    // are typing. It needs the panel open, so it opens it.
    if (event.key === 'F2' && inspected.value) {
        event.preventDefault()
        inspectorOpen.value = true
        void nextTick(() => inspector.value?.startRename())
    }
})

/**
 * One field, written to every selected image.
 *
 * A PATCH each, because the bag is per-row and shallow-merged: there is no bulk metadata endpoint
 * and we did not ask for one. Failures are counted rather than thrown, so a batch that half applies
 * says so instead of leaving someone to guess which half.
 */
const applyMetadataToSelection = async (patch: Record<string, unknown>) => {
    const batch = selectedImages.value
    let failed = 0
    for (const image of batch) {
        try {
            onImageChanged(await imageService.updateMetadata(image.id, patch))
        } catch {
            failed += 1
        }
    }
    if (failed) toast.error(`Applied to ${batch.length - failed} of ${batch.length}.`)
    else toast.success(`Applied to ${batch.length} image(s).`)
}

// The annotator is a page of its own, and the image rides as a query param because its filmstrip
// changes the selection without leaving the route.
const onAnnotate = (imageId: number) =>
    navigateTo({ path: '/image-annotator', query: { image: imageId } })
</script>

<template>
    <div
        class="tw:h-[calc(100dvh-80px)] tw:overflow-hidden tw:rounded-lg tw:border tw:border-an-border"
    >
        <!--
            Fixed to the viewport, with nothing scrolling but the album list and the grid.

            The 80px is the app shell's header, which this page keeps: the annotator hides the app
            nav because its canvas needs every pixel, and a library that did the same would strand
            someone with no way back to the rest of the product.
        -->
        <LibraryShell
            :docked-albums="isFull"
            :inspector-open="inspectorOpen && canDock && selectedCount > 0"
        >
            <template #albums>
                <AlbumRail
                    :albums="albums"
                    :loading="albumsLoading"
                    :selected-id="albumId"
                    :counts="albumCounts"
                    :total-count="libraryTotal"
                    :dragging-count="dragging ? draggingIds.length : 0"
                    :drop-target="targetAlbum"
                    @select="albumId = $event"
                    @create="openCreateAlbum"
                    @edit="openEditAlbum"
                    @remove="albumPendingDelete = $event"
                />
            </template>

            <LibraryHeader
                :total="total"
                :view="view"
                :layout="layout"
                :selecting="selecting"
                :selected-count="selectedCount"
                :sort="sort"
                :sorts="LIBRARY_SORTS"
                @update:view="view = $event"
                @update:sort="sort = $event"
                @upload="uploadOpen = true"
                @files="onFilesDropped"
                @start-selecting="selecting = true"
                @stop-selecting="stopSelecting"
                @select-all="selectAll"
            />

            <LibraryToolbar
                :layout="layout"
                :album-label="activeAlbum?.name ?? 'All images'"
                :album-count="activeAlbum ? (albumCounts[activeAlbum.id] ?? null) : libraryTotal"
                :q="search"
                :mine="mine"
                :filter="filter"
                :counts="counts"
                :sort="sort"
                @open-albums="drawerOpen = true"
                @update:q="search = $event"
                @update:mine="mine = $event"
                @update:filter="filter = $event"
                @update:sort="sort = $event"
            />

            <!-- `relative` on the wrapper, because the selection bar floats over the grid and has
                 to be measured from it rather than from the page. -->
            <div class="tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
                <ImageGrid
                    ref="grid"
                    :images="visible"
                    :views="rowViews"
                    :loading="imagesLoading"
                    :has-more="hasMore"
                    :view="view"
                    :metrics="metrics"
                    :file-drop="isFull"
                    :touch="!isFull"
                    :selecting-mode="selecting"
                    :selected-ids="selectedIds"
                    :pending-names="pendingNames"
                    :dragging-ids="dragging ? draggingIds : []"
                    :filtered="filtered"
                    :empty-message="emptyMessage"
                    :uploads="dropUpload.items.value"
                    :album-name="activeAlbum?.name ?? null"
                    @select="onCardSelect"
                    @toggle="selectToggle($event.id)"
                    @annotate="onAnnotate($event.id)"
                    @rename="onRename"
                    @files="onFilesDropped"
                    @cancel-uploads="dropUpload.cancel"
                    @open="onOpenLightbox"
                    @drag-start="onCardDragStart"
                    @long-press="onLongPress"
                    @clear-selection="clearSelection"
                    @more="loadMore"
                    @upload="uploadOpen = true"
                    @clear-filters="clearFilters"
                />

                <SelectionBar
                    v-if="selectedCount > 0"
                    :count="selectedCount"
                    :albums="albumsToAddTo"
                    :in-album="canUnfile"
                    :album-name="activeAlbum?.name ?? null"
                    :layout="layout"
                    @pick-album="albumSheetOpen = true"
                    @add-to-album="addSelectedToAlbum"
                    @annotate="annotateSelected"
                    @download="downloadSelected"
                    @remove-from-album="removeSelectedFromAlbum"
                    @delete="bulkDeleteOpen = true"
                    @clear="clearSelection"
                />
            </div>
            <template #inspector>
                <!--
                    Mounted only while the panel is actually open, even though the COLUMN is always
                    in the grid so it can animate. The panel fetches the full-resolution picture and
                    the annotations for whatever is selected; leaving it mounted behind a 0px track
                    would do all of that for a panel nobody can see.
                -->
                <ImageInspector
                    v-if="inspectorOpen && canDock && selectedCount > 0"
                    ref="inspector"
                    :image="inspected"
                    :selection="selectedImages"
                    :albums="albumsToAddTo"
                    :album-name="activeAlbum?.name ?? null"
                    :models="models"
                    :palette="palette"
                    :view="inspected ? (rowViews[inspected.id] ?? null) : null"
                    :thumbnails="dragThumbnails"
                    :position="inspectedIndex"
                    :sibling-names="siblingNames"
                    @close="inspectorOpen = false"
                    @previous="step(-1)"
                    @next="step(1)"
                    @annotate="onAnnotate"
                    @rename="onRename"
                    @changed="onImageChanged"
                    @add-to-album="addSelectedToAlbum"
                    @remove-from-album="removeSelectedFromAlbum"
                    @download="downloadSelected"
                    @delete="bulkDeleteOpen = true"
                    @metadata-all="applyMetadataToSelection"
                />
            </template>
        </LibraryShell>

        <!--
            THE ALBUM DRAWER, below Full. Over the grid on a scrim, not pushing it: a 280px column
            appearing from the left would reflow every card at the moment someone is reaching for a
            row, and the grid is the thing they came for.

            It is a valid drop target while it is open, because the rows inside carry the same
            `data-drop-album` the docked column does and the drag hit-tests the DOM.
        -->
        <!--
            THE PHONE'S ONLY ROUTE INTO AN ALBUM, so it has to be good: a bottom sheet listing every
            album with its count, `New album` first because a batch is often the reason a new one is
            wanted. There is no sidebar to drag onto at this width and no drag to do it with.
        -->
        <McSheet v-model:open="albumSheetOpen">
            <McSheetContent
                side="bottom"
                class="mc-slide-up tw:max-h-[70dvh] tw:rounded-t-2xl tw:p-0"
            >
                <McSheetHeader class="tw:border-b tw:border-an-divider tw:px-4 tw:py-3">
                    <McSheetTitle class="tw:text-[14px]">
                        Add {{ selectedCount }} image(s) to
                    </McSheetTitle>
                </McSheetHeader>
                <div class="tw:overflow-y-auto tw:p-2">
                    <button
                        type="button"
                        class="tw:flex tw:h-12 tw:w-full tw:items-center tw:gap-2.5 tw:rounded-lg tw:px-3 tw:text-left tw:text-[13px] tw:font-medium tw:text-an-accent-hover"
                        @click="onNewAlbumFromSheet"
                    >
                        <Plus class="tw:h-4 tw:w-4" />
                        New album
                    </button>
                    <button
                        v-for="album in albums"
                        :key="album.id"
                        type="button"
                        class="tw:flex tw:h-12 tw:w-full tw:items-center tw:gap-2.5 tw:rounded-lg tw:px-3 tw:text-left tw:text-[13px] tw:text-an-n-700"
                        @click="onSheetAddToAlbum(album.id)"
                    >
                        <Folder class="tw:h-4 tw:w-4 tw:text-an-n-400" />
                        <span class="tw:min-w-0 tw:flex-1 tw:truncate">{{ album.name }}</span>
                        <span
                            v-if="albumCounts[album.id] !== undefined"
                            class="tw:font-mono tw:text-[11.5px] tw:text-an-n-400 tw:tabular-nums"
                        >
                            {{ albumCounts[album.id] }}
                        </span>
                    </button>
                </div>
            </McSheetContent>
        </McSheet>

        <!-- Albums open as a bottom sheet, iOS-style: a card that slides up over a dimmed grid,
             rather than a drawer flying in from the left edge. It is the phone/tablet's route into an
             album (there is no docked rail below Full), and a sheet from the bottom is where a thumb
             already is. `mc-slide-up` carries the motion; selecting an album closes it. -->
        <McSheet v-model:open="drawerOpen">
            <McSheetContent
                side="bottom"
                class="mc-slide-up tw:flex tw:max-h-[75dvh] tw:flex-col tw:rounded-t-2xl tw:p-0"
            >
                <AlbumRail
                    :albums="albums"
                    :loading="albumsLoading"
                    :selected-id="albumId"
                    :counts="albumCounts"
                    :total-count="libraryTotal"
                    :row-height="48"
                    :dragging-count="dragging ? draggingIds.length : 0"
                    :drop-target="targetAlbum"
                    @select="onDrawerSelect"
                    @create="openCreateAlbum"
                    @edit="openEditAlbum"
                    @remove="albumPendingDelete = $event"
                />
            </McSheetContent>
        </McSheet>

        <!--
            Below 1280 the same panel becomes an overlay sheet, which is what the old detail panel
            was at EVERY width. The order of sacrifice is the album sidebar first, then the docking,
            never the grid's columns.

            FULL WIDTH, not a 380px rail. A tablet gets the same full-screen inspector a phone does:
            capping it at 380px on an iPad left a narrow strip beside a dimmed grid that was too tight
            for the image, its details and the metadata form. The docked panel at >=1280 is the only
            place this is a side-by-side column.
        -->
        <McSheet
            :open="inspectorOpen && !canDock && selectedCount > 0"
            @update:open="(value: boolean) => (value ? undefined : (inspectorOpen = false))"
        >
            <McSheetContent
                side="right"
                hide-close
                class="tw:flex tw:w-full tw:max-w-none tw:flex-col tw:gap-0 tw:p-0 tw:sm:max-w-none"
            >
                <ImageInspector
                    :image="inspected"
                    :selection="selectedImages"
                    :albums="albumsToAddTo"
                    :album-name="activeAlbum?.name ?? null"
                    :models="models"
                    :palette="palette"
                    :view="inspected ? (rowViews[inspected.id] ?? null) : null"
                    :thumbnails="dragThumbnails"
                    :position="inspectedIndex"
                    :sibling-names="siblingNames"
                    @close="inspectorOpen = false"
                    @previous="step(-1)"
                    @next="step(1)"
                    @annotate="onAnnotate"
                    @rename="onRename"
                    @changed="onImageChanged"
                    @add-to-album="addSelectedToAlbum"
                    @remove-from-album="removeSelectedFromAlbum"
                    @download="downloadSelected"
                    @delete="bulkDeleteOpen = true"
                    @metadata-all="applyMetadataToSelection"
                />
            </McSheetContent>
        </McSheet>

        <Lightbox
            v-if="lightboxOpen && inspected"
            :image="inspected"
            :palette="palette"
            :position="inspectedIndex"
            @close="lightboxOpen = false"
            @previous="step(-1)"
            @next="step(1)"
            @annotate="onAnnotate"
        />

        <DragGhost v-if="dragging && dragPayload" :payload="dragPayload" :position="dragPosition" />

        <!-- Drag is never the only route to filing, and it is invisible to anyone not watching the
             pointer. The selection bar and the panel are the keyboard and touch paths; this is what
             says the result out loud. -->
        <p class="tw:sr-only" aria-live="polite">{{ dragAnnouncement }}</p>

        <!--
            The page owns the dialog; the child is content only, the way CreateClass does it.
            McDialogContent renders inside a portal that exists only while open, so the child mounts
            fresh each time and its initial state is the reset.
        -->
        <McDialog v-model:open="uploadOpen">
            <McDialogContent class="tw:sm:max-w-lg">
                <UploadImages
                    :albums="albums"
                    :default-album-id="albumId"
                    @close="uploadOpen = false"
                    @uploaded="onUploaded"
                />
            </McDialogContent>
        </McDialog>

        <McDialog v-model:open="albumFormOpen">
            <McDialogContent class="tw:sm:max-w-md">
                <AlbumFormDialog
                    :album="albumBeingEdited"
                    :loading="albumSaving"
                    @close="albumFormOpen = false"
                    @save="onAlbumSave"
                />
            </McDialogContent>
        </McDialog>

        <!-- Named and counted, because "delete 6 images" is a different decision from "delete this
             one", and the consequences line is the part people actually read. -->
        <McConfirmDialog
            :open="bulkDeleteOpen"
            :title="`Delete ${selectedCount} image(s)?`"
            :description="`Deletes them and their annotations. Model runs over them are kept, and an image a model has run over cannot be deleted at all.`"
            @update:open="bulkDeleteOpen = $event"
            @confirm="deleteSelected"
        />

        <McConfirmDialog
            :open="albumPendingDelete !== null"
            title="Delete this album?"
            description="The images stay in the library. An album is a view over it, not a container that owns the pictures, so deleting one only unfiles them."
            @update:open="albumPendingDelete = null"
            @confirm="onAlbumDelete"
        />
    </div>
</template>
