<script setup lang="ts">
import { ArrowLeft, Plus, Pencil, Trash2, Upload } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import {
    slideCollectionService,
    type SlideCollection,
    type Slide,
    type SlideInput,
    type BulkImportMode,
} from '~/services/slideCollectionService'
import SlideCollectionForm from '~/features/components/slide/SlideCollectionForm.vue'
import SlideForm from '~/features/components/slide/SlideForm.vue'
import ImportAnswerKeyXlsx from '~/features/components/slide/ImportAnswerKeyXlsx.vue'

definePageMeta({ role: 'instructor' })

const route = useRoute()
const router = useRouter()
const collectionId = computed(() => Number(route.params.id))

const collection = ref<SlideCollection | null>(null)
const isLoading = ref(true)

const load = async () => {
    try {
        collection.value = await slideCollectionService.getById(collectionId.value)
    } catch {
        toast.error('Failed to load collection')
    } finally {
        isLoading.value = false
    }
}
await load()

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs(() => [
    { label: 'Slide Library', to: '/slide-collections' },
    { label: collection.value?.name ?? 'Collection' },
])

// ---- collection edit / delete ----
const isEditOpen = ref(false)
const isDeleting = ref(false)
const pendingDelete = ref(false)

const handleUpdateCollection = async (values: { name: string; description?: string }) => {
    try {
        collection.value = await slideCollectionService.update(collectionId.value, values)
        isEditOpen.value = false
        toast.success('Collection updated')
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to update collection'))
    }
}

const confirmDeleteCollection = async () => {
    isDeleting.value = true
    try {
        await slideCollectionService.remove(collectionId.value)
        toast.success('Collection deleted')
        router.push('/slide-collections')
    } catch (err) {
        // 409 when the collection still holds slides or an exam references it.
        toast.error(apiErrorMessage(err, 'Failed to delete collection'))
        pendingDelete.value = false
    } finally {
        isDeleting.value = false
    }
}

// ---- slides ----
const isSlideFormOpen = ref(false)
const editingSlide = ref<Slide | null>(null)
const pendingSlideDelete = ref<Slide | null>(null)
const isDeletingSlide = ref(false)

const openAddSlide = () => {
    editingSlide.value = null
    isSlideFormOpen.value = true
}
const openEditSlide = (slide: Slide) => {
    editingSlide.value = slide
    isSlideFormOpen.value = true
}

const handleSlideSubmit = async (values: SlideInput) => {
    try {
        if (editingSlide.value) {
            await slideCollectionService.updateSlide(editingSlide.value.id, values)
        } else {
            await slideCollectionService.addSlide(collectionId.value, values)
        }
        isSlideFormOpen.value = false
        await load()
        toast.success(editingSlide.value ? 'Slide updated' : 'Slide added')
    } catch (err) {
        // 409 on a duplicate slide_number within this collection.
        toast.error(apiErrorMessage(err, 'Failed to save slide'))
    }
}

const confirmDeleteSlide = async () => {
    if (!pendingSlideDelete.value) return
    isDeletingSlide.value = true
    try {
        await slideCollectionService.removeSlide(pendingSlideDelete.value.id)
        pendingSlideDelete.value = null
        await load()
        toast.success('Slide deleted')
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to delete slide'))
    } finally {
        isDeletingSlide.value = false
    }
}

const slideInitial = computed(() =>
    editingSlide.value
        ? {
              slide_number: editingSlide.value.slide_number,
              accepted_answers: editingSlide.value.accepted_answers,
              notes: editingSlide.value.notes ?? '',
          }
        : undefined,
)

// ---- Excel answer-key import (2.1) ----
// The workbook is parsed in the dialog; only validated rows arrive here, and the server applies
// them all-or-nothing, so a failure leaves the existing key exactly as it was.
const isImportOpen = ref(false)
const importRef = useTemplateRef<{ stopSubmitting: () => void }>('importDialog')

const handleImport = async (payload: { mode: BulkImportMode; slides: SlideInput[] }) => {
    try {
        const result = await slideCollectionService.bulkImportSlides(collectionId.value, payload)
        isImportOpen.value = false
        await load()
        const removed = result.deleted > 0 ? `, ${result.deleted} removed` : ''
        toast.success(`Imported: ${result.created} added, ${result.updated} updated${removed}`)
    } catch (err) {
        // Nothing was written; the import is one transaction server-side.
        toast.error(apiErrorMessage(err, 'Import failed, no changes were made'))
        importRef.value?.stopSubmitting()
    }
}
</script>

<template>
    <div class="tw:mx-auto tw:flex tw:w-full tw:max-w-4xl tw:flex-col tw:gap-6">
        <button
            class="tw:flex tw:items-center tw:gap-1.5 tw:text-navy-60 tw:hover:text-primary tw:transition-colors tw:text-sm tw:self-start"
            @click="router.push('/slide-collections')"
        >
            <ArrowLeft class="tw:w-4 tw:h-4" />
            Slide Library
        </button>

        <div v-if="isLoading" class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60">
            Loading…
        </div>

        <div v-else-if="!collection" class="tw:text-center tw:py-16 tw:text-navy-60">
            Collection not found.
        </div>

        <template v-else>
            <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
                <div class="tw:min-w-0">
                    <h1 class="tw:text-xl tw:font-bold tw:text-primary">{{ collection.name }}</h1>
                    <p v-if="collection.description" class="tw:text-sm tw:text-navy-60 tw:mt-0.5">
                        {{ collection.description }}
                    </p>
                    <p class="tw:text-xs tw:text-navy-40 tw:mt-1">
                        {{ collection.slides.length }}
                        slide{{ collection.slides.length === 1 ? '' : 's' }}
                    </p>
                </div>
                <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
                    <McButton variant="outline" size="sm" @click="isEditOpen = true">
                        <Pencil class="tw:size-3.5 tw:mr-1" />
                        Edit
                    </McButton>
                    <McButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete collection"
                        class="tw:text-navy-50 tw:hover:bg-destructive/10 tw:hover:text-destructive"
                        @click="pendingDelete = true"
                    >
                        <Trash2 class="tw:size-4" />
                    </McButton>
                </div>
            </div>

            <div class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-xl tw:overflow-hidden">
                <div
                    class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-navy-10 tw:px-5 tw:py-3"
                >
                    <span class="tw:text-sm tw:font-semibold tw:text-navy-90">Slides</span>
                    <div class="tw:flex tw:items-center tw:gap-2">
                        <McButton size="sm" variant="outline" @click="isImportOpen = true">
                            <Upload class="tw:size-3.5 tw:mr-1" />
                            Import from Excel
                        </McButton>
                        <McButton size="sm" @click="openAddSlide">
                            <Plus class="tw:size-3.5 tw:mr-1" />
                            Add slide
                        </McButton>
                    </div>
                </div>

                <p
                    v-if="collection.slides.length === 0"
                    class="tw:px-5 tw:py-10 tw:text-center tw:text-sm tw:text-navy-50"
                >
                    No slides yet. Add one to build the answer key.
                </p>

                <!-- Rows arrive in natural order (V2 before V10) from the server, see
                     getCollection in slide-collections.service.ts. Don't re-sort here. -->
                <table v-else class="tw:w-full tw:text-sm">
                    <thead>
                        <tr
                            class="tw:text-left tw:text-xs tw:text-navy-50 tw:border-b tw:border-navy-10"
                        >
                            <th class="tw:px-5 tw:py-2 tw:font-medium tw:w-16">Slide</th>
                            <th class="tw:px-5 tw:py-2 tw:font-medium">Accepted answers</th>
                            <th class="tw:px-5 tw:py-2 tw:font-medium">Notes</th>
                            <th class="tw:px-5 tw:py-2 tw:w-20"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="slide in collection.slides"
                            :key="slide.id"
                            class="tw:group tw:border-b tw:border-navy-10 last:tw:border-0 tw:hover:bg-navy-10/20"
                        >
                            <td
                                class="tw:px-5 tw:py-3 tw:font-semibold tw:text-navy-90 tw:tabular-nums"
                            >
                                {{ slide.slide_number }}
                            </td>
                            <td class="tw:px-5 tw:py-3">
                                <div class="tw:flex tw:flex-wrap tw:gap-1">
                                    <span
                                        v-for="(a, i) in slide.accepted_answers"
                                        :key="i"
                                        class="tw:inline-flex tw:rounded tw:bg-primary/10 tw:px-2 tw:py-0.5 tw:text-xs tw:text-primary"
                                    >
                                        {{ a }}
                                    </span>
                                </div>
                            </td>
                            <td class="tw:px-5 tw:py-3 tw:text-xs tw:text-navy-60">
                                {{ slide.notes || '—' }}
                            </td>
                            <td class="tw:px-5 tw:py-3">
                                <div
                                    class="tw:flex tw:justify-end tw:gap-1 tw:opacity-0 tw:transition-opacity tw:group-hover:opacity-100"
                                >
                                    <button
                                        class="tw:rounded tw:p-1 tw:text-navy-60 tw:hover:bg-navy-10 tw:hover:text-primary"
                                        aria-label="Edit slide"
                                        @click="openEditSlide(slide)"
                                    >
                                        <Pencil class="tw:size-3.5" />
                                    </button>
                                    <button
                                        class="tw:rounded tw:p-1 tw:text-navy-60 tw:hover:bg-destructive/10 tw:hover:text-destructive"
                                        aria-label="Delete slide"
                                        @click="pendingSlideDelete = slide"
                                    >
                                        <Trash2 class="tw:size-3.5" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </template>

        <!-- edit collection -->
        <McDialog v-model:open="isEditOpen">
            <McDialogContent class="tw:sm:max-w-md">
                <McDialogHeader>
                    <McDialogTitle>Edit collection</McDialogTitle>
                </McDialogHeader>
                <SlideCollectionForm
                    v-if="collection"
                    :initial="{ name: collection.name, description: collection.description ?? '' }"
                    submit-label="Save"
                    @submit="handleUpdateCollection"
                    @cancel="isEditOpen = false"
                />
            </McDialogContent>
        </McDialog>

        <!-- add / edit slide -->
        <McDialog v-model:open="isSlideFormOpen">
            <McDialogContent class="tw:sm:max-w-lg">
                <McDialogHeader>
                    <McDialogTitle>{{ editingSlide ? 'Edit slide' : 'Add slide' }}</McDialogTitle>
                </McDialogHeader>
                <SlideForm
                    :initial="slideInitial"
                    :submit-label="editingSlide ? 'Save' : 'Add'"
                    @submit="handleSlideSubmit"
                    @cancel="isSlideFormOpen = false"
                />
            </McDialogContent>
        </McDialog>

        <McDialog v-model:open="isImportOpen">
            <McDialogContent class="tw:sm:max-w-2xl">
                <ImportAnswerKeyXlsx
                    ref="importDialog"
                    :existing="collection?.slides ?? []"
                    @submit="handleImport"
                    @cancel="isImportOpen = false"
                />
            </McDialogContent>
        </McDialog>

        <McConfirmDialog
            :open="pendingDelete"
            title="Delete this collection?"
            :description="`“${collection?.name}” will be permanently removed. This fails if it still has slides or is used by an exam.`"
            :loading="isDeleting"
            @update:open="(v) => !v && (pendingDelete = false)"
            @confirm="confirmDeleteCollection"
        />

        <McConfirmDialog
            :open="!!pendingSlideDelete"
            :title="`Delete slide ${pendingSlideDelete?.slide_number}?`"
            description="This slide and its answer key will be permanently removed."
            :loading="isDeletingSlide"
            @update:open="(v) => !v && (pendingSlideDelete = null)"
            @confirm="confirmDeleteSlide"
        />
    </div>
</template>
