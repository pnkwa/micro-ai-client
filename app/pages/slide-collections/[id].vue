<script setup lang="ts">
import { h } from 'vue'
import type { ColumnDef, PaginationState } from '@tanstack/vue-table'
import { ArrowLeft, Plus, Pencil, Trash2, Upload, Search, Layers } from '@lucide/vue'
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

// A plain substring match over the label, the answer key and the notes. After an import a
// collection can run to a couple of hundred rows, and finding one slide by eye is the slow part.
// Order is left alone: the server returns natural order (V2 before V10) and re-sorting here
// would fight it, so these columns are not sortable either.
const slideFilter = ref('')

// The input stays instant; the filtering runs off a debounced copy. Matching the whole
// collection on every keystroke re-renders the table mid-word for no benefit, and after an
// import that is a few hundred rows of work per character.
const slideQuery = refDebounced(slideFilter, SEARCH_DEBOUNCE_MS)

const filteredSlides = computed(() => {
    const slides = collection.value?.slides ?? []
    const query = slideQuery.value.trim().toLowerCase()
    if (!query) return slides
    return slides.filter(
        (s) =>
            s.slide_number.toLowerCase().includes(query) ||
            s.accepted_answers.some((a) => a.toLowerCase().includes(query)) ||
            (s.notes ?? '').toLowerCase().includes(query),
    )
})

// Filtering shrinks the row set under the pager, so a filter typed while on page 3 would
// otherwise land the reader on an empty page. Debounced to the same delay as the query above,
// so the reset and the new rows land together rather than one flicking ahead of the other.
const slidePagination = ref<PaginationState>({ pageIndex: 0, pageSize: 15 })
const onSlideFilter = useDebounceFn(() => {
    slidePagination.value = { ...slidePagination.value, pageIndex: 0 }
}, SEARCH_DEBOUNCE_MS)

// Same head/column idiom as the class roster table (pages/classes/[id]/index.vue): left-aligned
// heads via `leftHead` + `stickyHead`, alignment stated in each body slot, and fixed sizes so the
// columns don't shift as you page through rows of different lengths.
const stickyHead = 'tw:text-left tw:text-navy-100'
const leftHead = (label: string) => () => h('div', { class: 'tw:text-left' }, label)

/** Beyond this a long answer key stops being scannable and starts crowding the row. */
const MAX_VISIBLE_ANSWERS = 3

const slideColumns: ColumnDef<Slide>[] = [
    {
        accessorKey: 'slide_number',
        header: leftHead('Slide'),
        size: 120,
        meta: { headerClass: stickyHead },
    },
    {
        accessorKey: 'accepted_answers',
        header: leftHead('Accepted answers'),
        size: 320,
        meta: { headerClass: stickyHead },
    },
    {
        accessorKey: 'notes',
        header: leftHead('Notes'),
        size: 280,
        meta: { headerClass: stickyHead },
    },
    {
        accessorKey: 'actions',
        header: () => h('div', { class: 'tw:text-center' }, 'Actions'),
        size: 110,
        meta: { headerClass: 'tw:text-navy-100' },
    },
]

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

            <!-- Toolbar sits ABOVE the card, not inside its head: it acts on the section, not
                 on the table, and the card is now McDataTable's own frame. -->
            <div class="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
                <h2 class="tw:text-sm tw:font-semibold tw:text-navy-90">Slides</h2>
                <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                    <!-- Only worth the space once there is something to search through. -->
                    <div v-if="collection.slides.length > 0" class="tw:relative">
                        <Search
                            class="tw:pointer-events-none tw:absolute tw:left-2.5 tw:top-1/2 tw:size-3.5 tw:-translate-y-1/2 tw:text-navy-40"
                        />
                        <input
                            v-model="slideFilter"
                            type="search"
                            placeholder="Filter slides"
                            aria-label="Filter slides"
                            class="tw:h-8 tw:w-44 tw:rounded-md tw:border tw:border-navy-20 tw:pl-8 tw:pr-2 tw:text-sm tw:outline-none tw:focus:border-primary"
                            @input="onSlideFilter"
                        />
                    </div>
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

            <!-- Empty state offers both routes in. Import is the one that matters for a real
                 bench of slides, and it used to be invisible here. -->
            <div
                v-if="collection.slides.length === 0"
                class="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:rounded-md tw:border tw:border-navy-10 tw:bg-white tw:px-5 tw:py-12 tw:text-center"
            >
                <Layers class="tw:size-8 tw:text-navy-30" />
                <div>
                    <p class="tw:text-sm tw:font-medium tw:text-navy-70">No slides yet</p>
                    <p class="tw:mt-0.5 tw:text-xs tw:text-navy-50">
                        Upload the answer key as a spreadsheet, or add slides one at a time.
                    </p>
                </div>
                <div class="tw:flex tw:gap-2">
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
                v-else-if="filteredSlides.length === 0"
                class="tw:rounded-md tw:border tw:border-navy-10 tw:bg-white tw:px-5 tw:py-12 tw:text-center tw:text-sm tw:text-navy-50"
            >
                <!-- The debounced query, not the raw input: quoting what is still being typed
                     would contradict the rows underneath it. -->
                No slide matches “{{ slideQuery }}”.
            </p>

            <!-- The white card is the page's, not the table's: McDataTable has a fragment root,
                 so a class passed to it is dropped (the dashboard hit exactly that). Same wrapper
                 the roster table uses in pages/classes/[id]/index.vue.

                 Rows arrive in natural order (V2 before V10) from the server, see getCollection
                 in slide-collections.service.ts. No column is sortable, so nothing here can
                 reorder them out of that. -->
            <div
                v-else
                class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-md tw:overflow-hidden"
            >
                <McDataTable
                    v-model:pagination="slidePagination"
                    :columns="slideColumns"
                    :data="filteredSlides"
                    :total="filteredSlides.length"
                >
                    <template #body-slide_number="{ row }">
                        <div
                            class="tw:pl-4 tw:text-left tw:text-sm tw:font-medium tw:text-navy-100"
                        >
                            {{ row.original.slide_number }}
                        </div>
                    </template>

                    <!-- Capped: an import can carry several phrasings per slide, and spilling them
                         all here crowds the row without helping anyone scan it. -->
                    <template #body-accepted_answers="{ row }">
                        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-1">
                            <McBadge
                                v-for="(a, i) in row.original.accepted_answers.slice(
                                    0,
                                    MAX_VISIBLE_ANSWERS,
                                )"
                                :key="i"
                                variant="success"
                            >
                                {{ a }}
                            </McBadge>
                            <span
                                v-if="row.original.accepted_answers.length > MAX_VISIBLE_ANSWERS"
                                :title="
                                    row.original.accepted_answers
                                        .slice(MAX_VISIBLE_ANSWERS)
                                        .join(', ')
                                "
                                class="tw:text-xs tw:text-navy-40"
                            >
                                +{{ row.original.accepted_answers.length - MAX_VISIBLE_ANSWERS }}
                            </span>
                        </div>
                    </template>

                    <!-- Truncated rather than wrapped: every other table in the app keeps its rows to
                         one line, and the title attribute keeps the full note reachable. -->
                    <template #body-notes="{ row }">
                        <div
                            v-if="row.original.notes"
                            :title="row.original.notes"
                            class="tw:truncate tw:text-left tw:text-sm tw:text-navy-60"
                        >
                            {{ row.original.notes }}
                        </div>
                        <div v-else class="tw:text-left tw:text-xs tw:text-navy-40">-</div>
                    </template>

                    <template #body-actions="{ row }">
                        <div class="tw:flex tw:justify-center tw:gap-1">
                            <McButton
                                variant="ghost"
                                size="icon-sm"
                                :aria-label="`Edit slide ${row.original.slide_number}`"
                                class="tw:text-navy-50 tw:hover:text-primary"
                                @click="openEditSlide(row.original)"
                            >
                                <Pencil class="tw:size-4" />
                            </McButton>
                            <McButton
                                variant="ghost"
                                size="icon-sm"
                                :aria-label="`Delete slide ${row.original.slide_number}`"
                                class="tw:text-navy-50 tw:hover:bg-destructive/10 tw:hover:text-destructive"
                                @click="pendingSlideDelete = row.original"
                            >
                                <Trash2 class="tw:size-4" />
                            </McButton>
                        </div>
                    </template>
                </McDataTable>
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
