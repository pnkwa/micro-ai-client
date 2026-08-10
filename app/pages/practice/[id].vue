<script setup lang="ts">
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { practiceSetService, type PracticeSetDetail } from '~/services/practiceSetService'
import { detectionService } from '~/services/detectionService'

/**
 * One practice set, stepped through an item at a time (client request 5.1).
 *
 * The AI findings are shown in full, which is the point: BE-ADR-012 says practice is exactly
 * where a student should see the model's reasoning. They start HIDDEN, though - looking at the
 * boxes before forming your own read is how you learn to trust the model instead of the slide.
 * That is a study aid, not a security boundary; the exam side is enforced server-side.
 */
const route = useRoute()
const router = useRouter()
const setId = computed(() => Number(route.params.id))

const practiceSet = ref<PracticeSetDetail | null>(null)
const isLoading = ref(true)

try {
    practiceSet.value = await practiceSetService.getById(setId.value)
} catch {
    // A student asking for an unpublished set gets a 404 from the server, same as a set that
    // doesn't exist - the template falls through to "not found" for both.
    practiceSet.value = null
    toast.error('Failed to load this practice set')
} finally {
    isLoading.value = false
}

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([
    { label: 'Practice', to: '/practice' },
    { label: practiceSet.value?.name ?? 'Set' },
])

const items = computed(() => practiceSet.value?.items ?? [])
const index = ref(0)
const current = computed(() => items.value[index.value] ?? null)

const revealed = ref(false)

const go = async (delta: number) => {
    const next = index.value + delta
    if (next < 0 || next >= items.value.length) return
    index.value = next
    // Each slide starts covered again; carrying the reveal forward would defeat the exercise.
    revealed.value = false
    await loadImage(current.value?.detection_id)
}

/**
 * The image is fetched as a blob because <img src> cannot carry the Authorization header $api
 * attaches. One object URL per item, revoked as we move, so stepping a 30-image set doesn't
 * accumulate them.
 */
const imageUrl = ref<string | null>(null)
const isLoadingImage = ref(false)

const releaseImage = () => {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = null
}

const loadImage = async (detectionId: number | undefined) => {
    releaseImage()
    if (!detectionId) return
    isLoadingImage.value = true
    try {
        imageUrl.value = await detectionService.imageBlobUrl(detectionId)
    } catch {
        // A 404 here means the set references a detection the server won't release - it should
        // not happen for a published set, so say so rather than showing an empty frame.
        toast.error('That image could not be loaded')
    } finally {
        isLoadingImage.value = false
    }
}

// Loaded explicitly here and in `go`, rather than by a watcher on the index. Fetching an image is
// a side effect with an object URL to revoke, not derived state, so the two places that actually
// change the slide own it - and there is no effect to re-fire on an unrelated re-render.
await loadImage(current.value?.detection_id)

onBeforeUnmount(releaseImage)

const steps = computed(() => current.value?.detection?.steps ?? [])
</script>

<template>
    <div class="tw:mx-auto tw:flex tw:w-full tw:max-w-5xl tw:flex-col tw:gap-5">
        <button
            class="tw:flex tw:items-center tw:gap-1.5 tw:self-start tw:text-sm tw:text-navy-60 tw:transition-colors tw:hover:text-primary"
            @click="router.push('/practice')"
        >
            <ArrowLeft class="tw:size-4" />
            Practice
        </button>

        <div v-if="isLoading" class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60">
            Loading…
        </div>

        <div v-else-if="!practiceSet" class="tw:py-16 tw:text-center tw:text-navy-60">
            This practice set isn't available.
        </div>

        <template v-else>
            <div class="tw:flex tw:flex-wrap tw:items-end tw:justify-between tw:gap-3">
                <div class="tw:min-w-0">
                    <h1 class="tw:text-xl tw:font-bold tw:text-primary">
                        {{ practiceSet.name }}
                    </h1>
                    <p v-if="practiceSet.description" class="tw:mt-0.5 tw:text-sm tw:text-navy-60">
                        {{ practiceSet.description }}
                    </p>
                </div>
                <span v-if="items.length" class="tw:text-sm tw:text-navy-50 tw:tabular-nums">
                    {{ index + 1 }} of {{ items.length }}
                </span>
            </div>

            <p
                v-if="items.length === 0"
                class="tw:rounded-md tw:border tw:border-navy-10 tw:bg-white tw:px-5 tw:py-12 tw:text-center tw:text-sm tw:text-navy-50"
            >
                This set has no slides yet.
            </p>

            <template v-else-if="current">
                <div
                    class="tw:rounded-md tw:border tw:border-navy-10 tw:bg-white tw:p-5 tw:flex tw:flex-col tw:gap-4"
                >
                    <p v-if="current.caption" class="tw:text-sm tw:text-navy-80">
                        {{ current.caption }}
                    </p>

                    <McDetectionFilterScope
                        :steps="steps"
                        class="tw:flex tw:flex-col tw:gap-4 tw:lg:flex-row tw:lg:items-start"
                    >
                        <div class="tw:w-full tw:lg:min-w-0 tw:lg:flex-1">
                            <p
                                v-if="isLoadingImage"
                                class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-50"
                            >
                                Loading image…
                            </p>
                            <!-- Only mounted once revealed: McAnnotatedImage draws the boxes, so
                                 rendering it hidden would just be the answer behind opacity. -->
                            <McAnnotatedImage
                                v-else-if="imageUrl && revealed"
                                :src="imageUrl"
                                class="tw:w-full"
                            />
                            <img
                                v-else-if="imageUrl"
                                :src="imageUrl"
                                alt="Practice slide"
                                class="tw:max-h-[28rem] tw:w-full tw:rounded-md tw:bg-slate-950 tw:object-scale-down"
                            />
                        </div>

                        <div
                            class="tw:w-full tw:lg:w-64 tw:lg:shrink-0 tw:flex tw:flex-col tw:gap-2"
                        >
                            <McButton
                                variant="outline"
                                size="sm"
                                class="tw:w-full"
                                @click="revealed = !revealed"
                            >
                                <component
                                    :is="revealed ? EyeOff : Eye"
                                    class="tw:size-3.5 tw:mr-1"
                                />
                                {{ revealed ? 'Hide the AI findings' : 'Show the AI findings' }}
                            </McButton>

                            <template v-if="revealed && steps.length">
                                <span class="tw:text-xs tw:text-navy-50">
                                    Model:
                                    <span class="tw:text-sm tw:text-navy-70">
                                        {{ current.detection?.model }}
                                    </span>
                                </span>
                                <McConfidenceBar
                                    v-for="step in steps"
                                    :key="step.id"
                                    :label="step.predicted_class"
                                    :confidence="step.confidence"
                                />
                                <McDetectionFilters
                                    class="tw:mt-1 tw:border-t tw:border-navy-15 tw:pt-3"
                                />
                            </template>

                            <p
                                v-else-if="revealed"
                                class="tw:text-[11px] tw:leading-relaxed tw:text-navy-40"
                            >
                                The model found nothing in this image. That is a result too, not a
                                failure: read the slide yourself.
                            </p>

                            <p v-else class="tw:text-[11px] tw:leading-relaxed tw:text-navy-40">
                                Form your own reading first, then compare.
                            </p>
                        </div>
                    </McDetectionFilterScope>
                </div>

                <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
                    <McButton variant="outline" size="sm" :disabled="index === 0" @click="go(-1)">
                        <ChevronLeft class="tw:size-4 tw:mr-1" />
                        Previous
                    </McButton>
                    <McButton
                        variant="outline"
                        size="sm"
                        :disabled="index >= items.length - 1"
                        @click="go(1)"
                    >
                        Next
                        <ChevronRight class="tw:size-4 tw:ml-1" />
                    </McButton>
                </div>
            </template>
        </template>
    </div>
</template>
