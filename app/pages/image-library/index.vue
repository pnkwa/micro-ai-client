<script setup lang="ts">
import { toast } from 'vue-sonner'
import { refDebounced } from '@vueuse/core'
import { imageService, LIBRARY_PAGE_SIZE, type LibraryImage } from '~/services/imageService'
import { albumService, type Album, type AlbumInput } from '~/services/albumService'
import { detectionService, type ModelSpec } from '~/services/detectionService'
import AlbumRail from '~/features/components/library/AlbumRail.vue'
import AlbumFormDialog from '~/features/components/library/AlbumFormDialog.vue'
import ImageGrid from '~/features/components/library/ImageGrid.vue'
import ImageDetailSheet from '~/features/components/library/ImageDetailSheet.vue'
import LibraryFilterBar from '~/features/components/library/LibraryFilterBar.vue'
import UploadImagesDialog from '~/features/components/library/UploadImagesDialog.vue'

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
const models = ref<ModelSpec[]>([])

const images = ref<LibraryImage[]>([])
const total = ref(0)
const imagesLoading = ref(true)

const albumId = ref<number | null>(null)
const search = ref('')
const mine = ref(false)
const annotated = ref<boolean | undefined>(undefined)
const page = ref(1)

const selected = ref<LibraryImage | null>(null)
const uploadOpen = ref(false)
const albumFormOpen = ref(false)
const albumBeingEdited = ref<Album | null>(null)
const albumSaving = ref(false)
const albumPendingDelete = ref<Album | null>(null)

// A keystroke per request would be one round trip per character on a server-side search.
const debouncedSearch = refDebounced(search, 300)

const activeAlbum = computed(() => albums.value.find((a) => a.id === albumId.value) ?? null)

const emptyMessage = computed(() => {
    if (debouncedSearch.value) return `Nothing matches "${debouncedSearch.value}".`
    if (annotated.value === false) return 'Every image here has been annotated.'
    if (annotated.value === true) return 'Nothing here has been annotated yet.'
    if (mine.value) return 'You have not uploaded anything yet.'
    if (activeAlbum.value) return `${activeAlbum.value.name} has no images filed into it.`
    return 'Upload a picture to start building the library.'
})

const loadImages = async () => {
    imagesLoading.value = true
    try {
        const result = await imageService.list({
            ...(albumId.value !== null && { album_id: albumId.value }),
            ...(debouncedSearch.value && { q: debouncedSearch.value }),
            ...(mine.value && { mine: true }),
            ...(annotated.value !== undefined && { annotated: annotated.value }),
            page: page.value,
            per_page: LIBRARY_PAGE_SIZE,
        })
        images.value = result.data
        total.value = result.total
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not load the library'))
        images.value = []
        total.value = 0
    } finally {
        imagesLoading.value = false
    }
}

const loadAlbums = async () => {
    albumsLoading.value = true
    try {
        albums.value = await albumService.list()
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not load the albums'))
    } finally {
        albumsLoading.value = false
    }
}

// The query the listing is a function of. Watching this one key rather than five refs means a
// change that touches two of them at once is still a single request.
const query = computed(() =>
    JSON.stringify([albumId.value, debouncedSearch.value, mine.value, annotated.value, page.value]),
)

watch(query, () => void loadImages())

// Any filter change puts you back on page one; staying on page 7 of a narrower result set is how
// a filter reads as "no images".
watch([albumId, debouncedSearch, mine, annotated], () => {
    page.value = 1
})

await Promise.all([
    loadAlbums(),
    loadImages(),
    detectionService
        .listModels()
        .then((list) => (models.value = list))
        // The picker is one affordance in a panel; the library still works without it.
        .catch(() => undefined),
])

const onAlbumSave = async (input: AlbumInput) => {
    albumSaving.value = true
    try {
        if (albumBeingEdited.value) await albumService.update(albumBeingEdited.value.id, input)
        else await albumService.create(input)
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
        await Promise.all([loadAlbums(), loadImages()])
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not delete the album'))
    } finally {
        albumPendingDelete.value = null
    }
}

/**
 * Drop a tile on an album: file it there, and unfile it from every other album.
 *
 * ONE IMAGE, ONE ALBUM - as a client-side simplification, not a server rule. `album_images` is
 * genuinely many-to-many (BE-ADR-032) and the detail panel still shows and edits the full set,
 * which is the escape hatch when an image legitimately belongs in two.
 *
 * The hazard this creates, stated where someone will find it: dragging an image OUT of a curated
 * album silently ends its eligibility to be annotated or to back a question, because both are
 * gated on curated membership. That is why the toast names what was removed rather than just
 * reporting success.
 */
const onFileImage = async ({ albumId: target, imageId }: { albumId: number; imageId: number }) => {
    const previous = (await imageService.get(imageId)).albums ?? []
    if (previous.some((album) => album.id === target) && previous.length === 1) return

    try {
        await albumService.addImage(target, imageId)
        const removed = previous.filter((album) => album.id !== target)
        for (const album of removed) await albumService.removeImage(album.id, imageId)

        const name = albums.value.find((album) => album.id === target)?.name ?? 'the album'
        toast.success(
            removed.length
                ? `Moved to ${name}, removed from ${removed.map((a) => a.name).join(', ')}`
                : `Filed into ${name}`,
        )
        // Filing changes `in_curated_album`, which gates the Annotate button, so the row has to be
        // re-read rather than patched optimistically.
        await loadImages()
        if (selected.value?.id === imageId) selected.value = await imageService.get(imageId)
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not file the image'))
    }
}

const openCreateAlbum = () => {
    albumBeingEdited.value = null
    albumFormOpen.value = true
}

const openEditAlbum = (album: Album) => {
    albumBeingEdited.value = album
    albumFormOpen.value = true
}

// The sheet edited the image; patch the row in place rather than re-listing, so the grid does not
// scroll-jump under a panel that is still open.
const onImageChanged = (image: LibraryImage) => {
    const index = images.value.findIndex((row) => row.id === image.id)
    if (index !== -1) images.value[index] = image
    selected.value = image
}

const onImageDeleted = async (imageId: number) => {
    selected.value = null
    if (images.value.length === 1 && page.value > 1) page.value -= 1
    else await loadImages()
    void loadAlbums()
    void imageId
}

const onUploaded = async () => {
    page.value = 1
    await loadImages()
}

// The annotator is a page of its own, and the image rides as a query param because its filmstrip
// changes the selection without leaving the route. SCAFFOLD for now: the page lays out but does not
// draw anything yet.
const onAnnotate = (imageId: number) =>
    navigateTo({ path: '/image-annotator', query: { image: imageId } })
</script>

<template>
    <div
        class="tw:flex tw:h-[calc(100vh-80px)] tw:overflow-hidden tw:rounded-lg tw:border tw:border-navy-15 tw:bg-white"
    >
        <AlbumRail
            :albums="albums"
            :loading="albumsLoading"
            :selected-id="albumId"
            @select="albumId = $event"
            @create="openCreateAlbum"
            @edit="openEditAlbum"
            @remove="albumPendingDelete = $event"
            @file-image="onFileImage"
        />

        <div class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
            <LibraryFilterBar
                :q="search"
                :mine="mine"
                :annotated="annotated"
                @update:q="search = $event"
                @update:mine="mine = $event"
                @update:annotated="annotated = $event"
                @upload="uploadOpen = true"
            />

            <ImageGrid
                :images="images"
                :loading="imagesLoading"
                :total="total"
                :page="page"
                :per-page="LIBRARY_PAGE_SIZE"
                :selected-id="selected?.id ?? null"
                :empty-message="emptyMessage"
                @select="selected = $event"
                @update:page="page = $event"
            />
        </div>

        <ImageDetailSheet
            :image="selected"
            :albums="albums"
            :models="models"
            @close="selected = null"
            @changed="onImageChanged"
            @deleted="onImageDeleted"
            @annotate="onAnnotate"
        />

        <UploadImagesDialog
            :open="uploadOpen"
            :albums="albums"
            :default-album-id="albumId"
            @update:open="uploadOpen = $event"
            @uploaded="onUploaded"
        />

        <AlbumFormDialog
            :open="albumFormOpen"
            :album="albumBeingEdited"
            :loading="albumSaving"
            @update:open="albumFormOpen = $event"
            @save="onAlbumSave"
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
