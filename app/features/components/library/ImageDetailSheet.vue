<script setup lang="ts">
import { toast } from 'vue-sonner'
import { ExternalLink, EyeOff, ImageOff, Play, Plus, Shapes, Trash2, X } from '@lucide/vue'
import { imageService, type LibraryImage } from '~/services/imageService'
import { albumService, type Album } from '~/services/albumService'
import {
    detectionService,
    type DetectionWithSubmitter,
    type ModelSpec,
} from '~/services/detectionService'
import {
    metadataEntries,
    metadataPatch,
    metadataTitle,
    toMetadataDrafts,
    type MetadataDraft,
} from '~/core/helpers/imageMetadata'

const props = defineProps<{
    /** The row from the grid. The sheet re-reads it for `albums[]`, which only the detail carries. */
    image: LibraryImage | null
    albums: Album[]
    models: ModelSpec[]
}>()

const emit = defineEmits<{
    close: []
    /** The image changed in a way the grid has to reflect (metadata, membership, annotations). */
    changed: [image: LibraryImage]
    deleted: [imageId: number]
    annotate: [imageId: number]
}>()

const detail = ref<LibraryImage | null>(null)
const imageUrl = ref<string | null>(null)
const imageError = ref<'forbidden' | 'unavailable' | null>(null)
const runs = ref<DetectionWithSubmitter[]>([])
const drafts = ref<MetadataDraft[]>([])
const isSavingMetadata = ref(false)
const isRunning = ref(false)
const isDeleting = ref(false)
const confirmDelete = ref(false)
const selectedModel = ref('')
const albumToAdd = ref<number | null>(null)

const open = computed(() => props.image !== null)

const revoke = () => {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = null
}

/**
 * Full resolution, NOT `?size=thumb`.
 *
 * The panel is where someone checks whether a picture is worth curating, and a 256px downscale of a
 * microscopy field cannot answer that. The grid's thumbs are a separate cache and stay small.
 */
const loadImage = async (id: number) => {
    revoke()
    imageError.value = null
    try {
        imageUrl.value = await imageService.blobUrl(id)
    } catch (error) {
        imageError.value = isForbidden(error) ? 'forbidden' : 'unavailable'
    }
}

const load = async (row: LibraryImage) => {
    detail.value = row
    drafts.value = toMetadataDrafts(row.metadata)
    runs.value = []
    confirmDelete.value = false
    albumToAdd.value = null
    await loadImage(row.id)
    try {
        // The single read is what carries `albums[]`; the grid row does not.
        const full = await imageService.get(row.id)
        detail.value = full
        drafts.value = toMetadataDrafts(full.metadata)
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not load the image details'))
    }
    try {
        runs.value = await detectionService.listForImage(row.id)
    } catch {
        // Not worth failing the panel over: the runs list is an affordance, not the content.
    }
}

// Re-loads whenever the grid hands over a different image, and tears the object URL down with the
// component. `watch` is the wrong tool for the fetch itself but the right one for "the selection
// changed", which is an event rather than derived state.
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

const entries = computed(() => metadataEntries(detail.value?.metadata))
const reserved = computed(() => entries.value.filter((entry) => entry.reserved))
const title = computed(() => metadataTitle(detail.value?.metadata))

const pendingPatch = computed(() =>
    detail.value ? metadataPatch(detail.value.metadata, drafts.value) : null,
)

const detectors = computed(() =>
    props.models
        .filter((model) => model.task === 'detect' || model.task === 'classify')
        .map((model) => ({ value: model.name, label: model.displayName })),
)

const filedIn = computed(() => detail.value?.albums ?? [])

const addableAlbums = computed(() => {
    const already = new Set(filedIn.value.map((album) => album.id))
    return props.albums
        .filter((album) => !already.has(album.id))
        .map((album) => ({
            value: album.id as number | null,
            label: album.kind === 'curated' ? `${album.name} (curated)` : album.name,
        }))
})

const refresh = async () => {
    if (!detail.value) return
    const full = await imageService.get(detail.value.id)
    detail.value = full
    drafts.value = toMetadataDrafts(full.metadata)
    emit('changed', full)
}

const addDraft = () => drafts.value.push({ key: '', value: '' })
const removeDraft = (index: number) => drafts.value.splice(index, 1)

const saveMetadata = async () => {
    const patch = pendingPatch.value
    if (!detail.value || !patch) return
    isSavingMetadata.value = true
    try {
        // Only what moved: the bag is shared with the export's `title` and the authoring hint, so
        // sending the whole object back could clobber a key this form does not own.
        const updated = await imageService.updateMetadata(detail.value.id, patch)
        detail.value = updated
        drafts.value = toMetadataDrafts(updated.metadata)
        emit('changed', updated)
        toast.success('Saved')
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not save the metadata'))
    } finally {
        isSavingMetadata.value = false
    }
}

const fileInto = async () => {
    if (!detail.value || albumToAdd.value === null) return
    try {
        await albumService.addImage(albumToAdd.value, detail.value.id)
        albumToAdd.value = null
        await refresh()
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not file the image'))
    }
}

const unfile = async (albumId: number) => {
    if (!detail.value) return
    try {
        await albumService.removeImage(albumId, detail.value.id)
        await refresh()
    } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not remove the image from the album'))
    }
}

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

/**
 * A 409 here is the RESTRICT working, not a failure.
 *
 * Upload, run a model, change your mind is refused, because cascading would take the detection
 * history down with the image. The server's message names the blocking table, so surface it rather
 * than a generic failure, and the runs list below is already the way out.
 */
const remove = async () => {
    if (!detail.value) return
    isDeleting.value = true
    const id = detail.value.id
    try {
        await imageService.remove(id)
        confirmDelete.value = false
        emit('deleted', id)
        toast.success('Image deleted')
    } catch (error) {
        confirmDelete.value = false
        toast.error(apiErrorMessage(error, 'Could not delete the image'))
    } finally {
        isDeleting.value = false
    }
}
</script>

<template>
    <McSheet :open="open" @update:open="(value: boolean) => (value ? undefined : emit('close'))">
        <!--
            Wide, and the picture gets the room rather than the form.

            The first cut was `sm:max-w-md`, which put a microscopy field in a ~200px square peeking
            off the edge of the screen - unusable for the one judgement this panel exists to
            support, which is whether the picture is worth curating. The details column is fixed and
            scrolls; the image column takes everything else.
        -->
        <McSheetContent
            side="right"
            class="tw:flex tw:w-full tw:flex-col tw:gap-0 tw:p-0 tw:sm:max-w-4xl"
        >
            <template v-if="detail">
                <McSheetHeader class="tw:shrink-0 tw:border-b tw:border-navy-15 tw:px-4 tw:py-3">
                    <McSheetTitle class="tw:truncate">
                        {{ title ?? `Image ${detail.id}` }}
                    </McSheetTitle>
                    <McSheetDescription>
                        Uploaded {{ new Date(detail.created_at).toLocaleDateString() }}
                    </McSheetDescription>
                </McSheetHeader>

                <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:lg:flex-row">
                    <div
                        class="tw:flex tw:min-h-64 tw:min-w-0 tw:flex-1 tw:items-center tw:justify-center tw:bg-slate-950 tw:p-2"
                    >
                        <img
                            v-if="imageUrl"
                            :src="imageUrl"
                            :alt="title ?? `Image ${detail.id}`"
                            class="tw:max-h-full tw:max-w-full tw:object-contain"
                        />
                        <div
                            v-else-if="imageError"
                            class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:text-navy-40"
                        >
                            <EyeOff v-if="imageError === 'forbidden'" class="tw:h-6 tw:w-6" />
                            <ImageOff v-else class="tw:h-6 tw:w-6" />
                            <span class="tw:text-xs">
                                {{
                                    imageError === 'forbidden'
                                        ? 'You are not allowed to view this image'
                                        : 'Image unavailable'
                                }}
                            </span>
                        </div>
                        <McSkeleton v-else class="tw:h-full tw:w-full" />
                    </div>

                    <div
                        class="tw:flex tw:w-full tw:shrink-0 tw:flex-col tw:gap-5 tw:overflow-y-auto tw:border-navy-15 tw:p-4 tw:lg:w-90 tw:lg:border-l"
                    >
                        <!-- No curated gate. Annotating used to require the image to be in a
                             `curated` album, which inverted the workflow it was meant to protect:
                             deciding a picture is worth labelling is usually what leads to curating
                             it. BE-ADR-030 was amended on 2026-08-26 and the server dropped the
                             guard from both annotation writers; `curated` now gates question
                             authoring and nothing else. -->
                        <McButton @click="emit('annotate', detail.id)">
                            <Shapes class="tw:h-4 tw:w-4" />
                            {{ detail.annotation_count ? 'Edit annotations' : 'Annotate' }}
                        </McButton>

                        <section class="tw:flex tw:flex-col tw:gap-2">
                            <h3 class="tw:text-sm tw:font-semibold tw:text-navy-100">Albums</h3>
                            <div v-if="filedIn.length" class="tw:flex tw:flex-wrap tw:gap-1.5">
                                <span
                                    v-for="album in filedIn"
                                    :key="album.id"
                                    class="tw:flex tw:items-center tw:gap-1 tw:rounded-full tw:border tw:border-navy-15 tw:py-0.5 tw:pr-1 tw:pl-2.5 tw:text-xs"
                                    :class="
                                        album.kind === 'curated'
                                            ? 'tw:bg-primary/10 tw:text-primary'
                                            : 'tw:bg-navy-5 tw:text-navy-80'
                                    "
                                >
                                    {{ album.name }}
                                    <button
                                        type="button"
                                        class="tw:rounded-full tw:p-0.5 tw:hover:bg-black/10"
                                        :aria-label="`Remove from ${album.name}`"
                                        @click="unfile(album.id)"
                                    >
                                        <X class="tw:h-3 tw:w-3" />
                                    </button>
                                </span>
                            </div>
                            <p v-else class="tw:text-xs tw:text-navy-60">Not in any album.</p>

                            <div v-if="addableAlbums.length" class="tw:flex tw:gap-2">
                                <McSelect
                                    v-model="albumToAdd"
                                    class="tw:min-w-0 tw:flex-1"
                                    :options="addableAlbums"
                                    placeholder="File into an album"
                                />
                                <McButton
                                    variant="outline"
                                    size="icon"
                                    :disabled="albumToAdd === null"
                                    aria-label="File into album"
                                    @click="fileInto"
                                >
                                    <Plus class="tw:h-4 tw:w-4" />
                                </McButton>
                            </div>
                        </section>

                        <section class="tw:flex tw:flex-col tw:gap-2">
                            <h3 class="tw:text-sm tw:font-semibold tw:text-navy-100">Metadata</h3>
                            <!--
                                ONE grid around every row, not a flex row per pair, so the two
                                columns line up down the list. It also has to be explicit tracks:
                                McInput hardcodes `w-full` on its own root, so a width class passed
                                to it fights that and collapsed the value field to nothing. Inside a
                                sized track, `w-full` means "full of the track" and behaves.
                            -->
                            <div
                                v-if="drafts.length"
                                class="tw:grid tw:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] tw:items-center tw:gap-1.5"
                            >
                                <template v-for="(draft, index) in drafts" :key="index">
                                    <McInput v-model="draft.key" placeholder="key" />
                                    <McInput v-model="draft.value" placeholder="value" />
                                    <McButton
                                        variant="ghost"
                                        size="icon-sm"
                                        :aria-label="`Remove ${draft.key || 'row'}`"
                                        @click="removeDraft(index)"
                                    >
                                        <X class="tw:h-4 tw:w-4" />
                                    </McButton>
                                </template>
                            </div>
                            <p v-else class="tw:text-xs tw:text-navy-60">No metadata yet.</p>

                            <div class="tw:flex tw:gap-2">
                                <McButton variant="outline" size="sm" @click="addDraft">
                                    <Plus class="tw:h-4 tw:w-4" />
                                    Add field
                                </McButton>
                                <McButton
                                    size="sm"
                                    :disabled="!pendingPatch"
                                    :loading="isSavingMetadata"
                                    @click="saveMetadata"
                                >
                                    Save
                                </McButton>
                            </div>

                            <div
                                v-for="entry in reserved"
                                :key="entry.key"
                                class="tw:rounded-md tw:bg-navy-5 tw:px-2.5 tw:py-2"
                            >
                                <p class="tw:text-xs tw:font-medium tw:text-navy-80">
                                    {{ entry.label }}
                                    <span class="tw:font-normal tw:text-navy-50">
                                        (set by question authoring)
                                    </span>
                                </p>
                                <p class="tw:break-all tw:text-xs tw:text-navy-60">
                                    {{ entry.value }}
                                </p>
                            </div>
                        </section>

                        <section class="tw:flex tw:flex-col tw:gap-2">
                            <h3 class="tw:text-sm tw:font-semibold tw:text-navy-100">Model runs</h3>
                            <ul v-if="runs.length" class="tw:flex tw:flex-col tw:gap-1">
                                <li v-for="run in runs" :key="run.id">
                                    <!--
                                        A run has no page of its own; /image-detection is the viewer
                                        that renders one, and it now accepts ?detection=<id>. Opened
                                        in a new tab so the panel someone is working in survives.
                                    -->
                                    <NuxtLink
                                        :to="{
                                            path: '/image-detection',
                                            query: { detection: run.id },
                                        }"
                                        target="_blank"
                                        class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:border tw:border-navy-15 tw:px-2.5 tw:py-1.5 tw:text-xs tw:transition-colors tw:hover:border-primary tw:hover:bg-primary/5"
                                    >
                                        <span class="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5">
                                            <span class="tw:truncate tw:text-navy-80">
                                                {{ run.model }}
                                            </span>
                                            <ExternalLink
                                                class="tw:h-3 tw:w-3 tw:shrink-0 tw:text-navy-40"
                                            />
                                        </span>
                                        <span class="tw:shrink-0 tw:text-navy-50">
                                            {{ new Date(run.created_at).toLocaleDateString() }}
                                        </span>
                                    </NuxtLink>
                                </li>
                            </ul>
                            <p v-else class="tw:text-xs tw:text-navy-60">
                                No runs over this image yet.
                            </p>

                            <div class="tw:flex tw:gap-2">
                                <McSelect
                                    v-model="selectedModel"
                                    class="tw:min-w-0 tw:flex-1"
                                    :options="detectors"
                                    placeholder="Pick a model"
                                />
                                <McButton
                                    variant="outline"
                                    :disabled="!selectedModel"
                                    :loading="isRunning"
                                    @click="runModel"
                                >
                                    <Play class="tw:h-4 tw:w-4" />
                                    Run
                                </McButton>
                            </div>
                        </section>

                        <McButton variant="destructive" @click="confirmDelete = true">
                            <Trash2 class="tw:h-4 tw:w-4" />
                            Delete image
                        </McButton>
                    </div>
                </div>
            </template>
        </McSheetContent>
    </McSheet>

    <McConfirmDialog
        :open="confirmDelete"
        title="Delete this image?"
        description="Its annotations and album filings go with it. If a model has been run over it, or a question is built on it, the delete is refused instead."
        :loading="isDeleting"
        @update:open="confirmDelete = $event"
        @confirm="remove"
    />
</template>
