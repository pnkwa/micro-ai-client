<script setup lang="ts">
import { Plus, Layers, ChevronRight } from '@lucide/vue'
import { toast } from 'vue-sonner'
import {
    slideCollectionService,
    type SlideCollectionListItem,
} from '~/services/slideCollectionService'
import SlideCollectionForm from '~/features/components/slide/SlideCollectionForm.vue'

// Staff-only reference data (the slides carry exam answer keys). The API enforces it too.
definePageMeta({ role: 'instructor' })

const router = useRouter()
const { $dayjs } = useNuxtApp()

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: 'Slide Library' }])

const collections = ref<SlideCollectionListItem[]>([])
const isLoading = ref(true)
const isCreateOpen = ref(false)

const load = async () => {
    isLoading.value = true
    try {
        collections.value = await slideCollectionService.list()
    } catch {
        toast.error('Failed to load slide collections')
    } finally {
        isLoading.value = false
    }
}
await load()

const handleCreate = async (values: { name: string; description?: string }) => {
    try {
        const created = await slideCollectionService.create(values)
        isCreateOpen.value = false
        toast.success('Collection created')
        router.push(`/slide-collections/${created.id}`)
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to create collection'))
    }
}

const formatDate = (date: string) => $dayjs(date).format('MMM D, YYYY')
</script>

<template>
    <div class="tw:mx-auto tw:flex tw:w-full tw:max-w-4xl tw:flex-col tw:gap-6">
        <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
            <div class="tw:flex tw:items-start tw:gap-3">
                <div
                    class="tw:flex tw:size-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary/10"
                >
                    <Layers class="tw:size-5 tw:text-primary" />
                </div>
                <div>
                    <h1 class="tw:text-xl tw:font-bold tw:leading-tight tw:text-primary">
                        Slide Library
                    </h1>
                    <p class="tw:text-sm tw:text-navy-60">
                        Reusable collections of physical slides and their answer keys, used by
                        exams.
                    </p>
                </div>
            </div>
            <McButton @click="isCreateOpen = true">
                <Plus class="tw:size-4 tw:mr-1" />
                New collection
            </McButton>
        </div>

        <div v-if="isLoading" class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60">
            Loading…
        </div>

        <div
            v-else-if="collections.length === 0"
            class="tw:bg-white tw:border tw:border-navy-10 tw:rounded-xl tw:py-16 tw:text-center"
        >
            <Layers class="tw:size-8 tw:text-navy-40 tw:mx-auto tw:mb-2" />
            <p class="tw:text-sm tw:text-navy-60">No collections yet.</p>
        </div>

        <div v-else class="tw:flex tw:flex-col tw:gap-3">
            <button
                v-for="c in collections"
                :key="c.id"
                class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:bg-white tw:border tw:border-navy-10 tw:rounded-lg tw:p-4 tw:text-left tw:transition-shadow tw:cursor-pointer tw:hover:shadow-sm"
                @click="router.push(`/slide-collections/${c.id}`)"
            >
                <div class="tw:min-w-0">
                    <p class="tw:font-semibold tw:text-navy-100">{{ c.name }}</p>
                    <p
                        v-if="c.description"
                        class="tw:text-xs tw:text-navy-60 tw:mt-0.5 tw:truncate"
                    >
                        {{ c.description }}
                    </p>
                    <p class="tw:text-[11px] tw:text-navy-40 tw:mt-1">
                        Updated {{ formatDate(c.updated_at) }}
                    </p>
                </div>
                <ChevronRight class="tw:size-5 tw:shrink-0 tw:text-navy-40" />
            </button>
        </div>

        <McDialog v-model:open="isCreateOpen">
            <McDialogContent class="tw:sm:max-w-md">
                <McDialogHeader>
                    <McDialogTitle>New slide collection</McDialogTitle>
                </McDialogHeader>
                <SlideCollectionForm
                    submit-label="Create"
                    @submit="handleCreate"
                    @cancel="isCreateOpen = false"
                />
            </McDialogContent>
        </McDialog>
    </div>
</template>
