<script setup lang="ts">
import { Layers, ArrowRight } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { practiceSetService, type PracticeSet } from '~/services/practiceSetService'

/**
 * Practice mode (client request 5.1): curated microscopy images to review before an exam.
 *
 * Open to students AND staff, unlike the slide library: the whole point is that students read
 * these. The server serves published sets only to a student, so this page does no gating of its
 * own - there is nothing here to hide that the API would have handed over anyway.
 */
const sets = ref<PracticeSet[]>([])
const isLoading = ref(true)

try {
    sets.value = await practiceSetService.listPublished()
} catch {
    toast.error('Failed to load practice sets')
} finally {
    isLoading.value = false
}

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: 'Practice' }])
</script>

<template>
    <div class="tw:mx-auto tw:flex tw:w-full tw:max-w-4xl tw:flex-col tw:gap-6">
        <div>
            <h1 class="tw:text-xl tw:font-bold tw:text-primary">Practice</h1>
            <p class="tw:mt-0.5 tw:text-sm tw:text-navy-60">
                Work through curated slides with the AI's findings shown, before you sit the exam.
            </p>
        </div>

        <div v-if="isLoading" class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60">
            Loading…
        </div>

        <div
            v-else-if="sets.length === 0"
            class="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:rounded-md tw:border tw:border-navy-10 tw:bg-white tw:px-5 tw:py-12 tw:text-center"
        >
            <Layers class="tw:size-8 tw:text-navy-30" />
            <div>
                <p class="tw:text-sm tw:font-medium tw:text-navy-70">No practice sets yet</p>
                <p class="tw:mt-0.5 tw:text-xs tw:text-navy-50">
                    Your instructor publishes these before an exam.
                </p>
            </div>
        </div>

        <div v-else class="tw:flex tw:flex-col tw:gap-3">
            <NuxtLink
                v-for="set in sets"
                :key="set.id"
                :to="`/practice/${set.id}`"
                class="tw:flex tw:items-center tw:justify-between tw:gap-4 tw:rounded-md tw:border tw:border-navy-10 tw:bg-white tw:px-5 tw:py-4 tw:transition-colors tw:hover:border-primary"
            >
                <div class="tw:min-w-0">
                    <p class="tw:text-sm tw:font-medium tw:text-navy-100">{{ set.name }}</p>
                    <p v-if="set.description" class="tw:mt-0.5 tw:text-xs tw:text-navy-60">
                        {{ set.description }}
                    </p>
                </div>
                <ArrowRight class="tw:size-4 tw:shrink-0 tw:text-navy-40" />
            </NuxtLink>
        </div>
    </div>
</template>
