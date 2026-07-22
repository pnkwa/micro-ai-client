<script setup lang="ts">
import type CameraType from 'simple-vue-camera'
import {
    Camera as CameraIcon,
    Upload,
    Trash2,
    Loader2,
    ScanSearch,
    FlipHorizontal,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { detectionService, type DetectionStep, type ModelSpec } from '~/services/detectionService'

type ViewerMode = 'empty' | 'camera' | 'preview'

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: 'Image Detection', to: '/image-detection' }])

const camera = ref<InstanceType<typeof CameraType>>()
const fileInput = ref<HTMLInputElement>()

const mode = ref<ViewerMode>('empty')
const imageUrl = ref<string | null>(null)
const currentFile = ref<File | Blob | null>(null)
const currentSource = ref<'upload' | 'camera'>('upload')
const isAnalyzing = ref(false)
const hasResults = ref(false)
const detectionSteps = ref<DetectionStep[]>([])

// Model picker (FE-ADR-007): never hardcode a model name. Split in two because chaining
// (ML-ADR-003) combines two independently-choosable models, not one: a classify/detect
// model that runs first, and a segment model optionally chained behind it. Debug page, so
// the segment choice is wired through for real (DetectionsService.buildJob's segmentModel
// override) rather than just mirroring the server's automatic default.
const NONE_SEGMENT = '__none__'
const models = ref<ModelSpec[]>([])
const primaryModelOptions = computed(() =>
    models.value
        .filter((m) => m.task === 'classify' || m.task === 'detect')
        .map((m) => ({ value: m.name, label: m.displayName })),
)
const segmentModelOptions = computed(() => [
    { value: NONE_SEGMENT, label: 'None (skip segmentation)' },
    ...models.value
        .filter((m) => m.task === 'segment')
        .map((m) => ({ value: m.name, label: m.displayName })),
])

const selectedModel = ref('')
const selectedSegmentModel = ref('')
const selectedModelSpec = computed(() => models.value.find((m) => m.name === selectedModel.value))
const selectedSegmentSpec = computed(() =>
    models.value.find((m) => m.name === selectedSegmentModel.value),
)
// Only a detector chains anything; the classifier and the segmenter itself run alone
// regardless of what's picked in the second dropdown (DetectionsService.buildJob).
const canChain = computed(() => selectedModelSpec.value?.task === 'detect')

try {
    models.value = await detectionService.listModels()
    selectedModel.value =
        models.value.find((m) => m.name === 'best__rtdetr_v2')?.name ?? models.value[0]?.name ?? ''
    selectedSegmentModel.value =
        models.value.find((m) => m.task === 'segment')?.name ?? NONE_SEGMENT
} catch {
    toast.error('Failed to load models')
}

const topResult = computed(() => detectionSteps.value[0] ?? null)

const startCamera = () => {
    imageUrl.value = null
    currentFile.value = null
    hasResults.value = false
    detectionSteps.value = []
    mode.value = 'camera'
}

const takeSnapshot = async () => {
    const blob = await camera.value?.snapshot()
    if (blob) {
        if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
        imageUrl.value = URL.createObjectURL(blob)
        currentFile.value = blob
        currentSource.value = 'camera'
        mode.value = 'preview'
        hasResults.value = false
        detectionSteps.value = []
    }
}

const triggerUpload = () => fileInput.value?.click()

const onFileChange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = URL.createObjectURL(file)
    currentFile.value = file
    currentSource.value = 'upload'
    mode.value = 'preview'
    hasResults.value = false
    detectionSteps.value = []
    if (fileInput.value) fileInput.value.value = ''
}

const clearImage = () => {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = null
    currentFile.value = null
    mode.value = 'empty'
    hasResults.value = false
    detectionSteps.value = []
}

const runDetection = async () => {
    if (!currentFile.value || !selectedModel.value) return
    isAnalyzing.value = true
    hasResults.value = false
    detectionSteps.value = []
    try {
        const segmentModel = !canChain.value
            ? undefined
            : selectedSegmentModel.value === NONE_SEGMENT
              ? null
              : selectedSegmentModel.value
        const result = await detectionService.run(
            currentFile.value,
            selectedModel.value,
            currentSource.value,
            segmentModel,
        )
        detectionSteps.value = result.steps
        hasResults.value = result.steps.length > 0
    } catch {
        toast.error('Detection failed. Please try again.')
    } finally {
        isAnalyzing.value = false
    }
}

onUnmounted(() => {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
})
</script>

<template>
    <div class="tw:space-y-5 tw:flex tw:flex-col tw:min-h-[calc(100vh-80px)]">
        <div>
            <h1 class="tw:text-2xl tw:font-bold tw:text-primary">Image Detection</h1>
            <p class="tw:text-sm tw:text-slate-500 tw:mt-1">
                Capture or upload microscope images and analyze them using AI-assisted detection.
            </p>
        </div>

        <div class="tw:h-full">
            <!-- Scopes the overlay's filter state across both columns: the image is on the
                 left, the controls that drive it are in the CONTROLS panel on the right. -->
            <McDetectionFilterScope
                :steps="detectionSteps"
                class="tw:h-200 tw:flex tw:flex-col tw:lg:flex-row tw:divide-y tw:lg:divide-y-0 tw:lg:divide-x tw:divide-slate-100 tw:flex-1"
            >
                <div class="tw:flex-1 tw:p-5 tw:md:p-6 tw:flex tw:flex-col tw:overflow-hidden">
                    <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
                        <div class="tw:flex tw:items-center tw:gap-2">
                            <span
                                class="tw:w-1.5 tw:h-1.5 tw:rounded-full"
                                :class="{
                                    'tw:bg-slate-300': mode === 'empty',
                                    'tw:bg-red-400 tw:animate-pulse': mode === 'camera',
                                    'tw:bg-primary':
                                        mode === 'preview' && !hasResults && !isAnalyzing,
                                    'tw:bg-emerald-400 tw:animate-pulse': hasResults,
                                    'tw:bg-blue-400 tw:animate-pulse': isAnalyzing,
                                }"
                            ></span>
                            <span
                                class="tw:text-xs tw:font-semibold tw:text-slate-400 tw:uppercase tw:tracking-widest"
                            >
                                {{
                                    mode === 'camera'
                                        ? 'Live Camera'
                                        : mode === 'preview'
                                          ? 'Image Preview'
                                          : 'Viewer'
                                }}
                            </span>
                        </div>

                        <div
                            v-if="hasResults"
                            class="tw:flex tw:items-center tw:gap-1.5 tw:bg-emerald-50 tw:border tw:border-emerald-200 tw:text-emerald-700 tw:text-[11px] tw:font-semibold tw:px-2.5 tw:py-1 tw:rounded-full"
                        >
                            <span
                                class="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-emerald-500 tw:inline-block"
                            ></span>
                            Detection complete
                        </div>
                        <div
                            v-else-if="isAnalyzing"
                            class="tw:flex tw:items-center tw:gap-1.5 tw:bg-primary/8 tw:border tw:border-primary/20 tw:text-primary tw:text-[11px] tw:font-semibold tw:px-2.5 tw:py-1 tw:rounded-full"
                        >
                            <Loader2 class="tw:w-3 tw:h-3 tw:animate-spin" />
                            Analyzing…
                        </div>
                    </div>

                    <div
                        class="tw:relative tw:w-full tw:rounded-md tw:overflow-hidden tw:bg-linear-to-br tw:from-slate-100 tw:to-slate-50 tw:ring-1 tw:ring-slate-200/80 tw:flex-1"
                    >
                        <div
                            v-if="mode === 'empty'"
                            class="tw:absolute tw:inset-0 tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-4"
                        >
                            <div
                                class="tw:relative tw:w-16 tw:h-16 tw:rounded-md tw:bg-white tw:shadow-md tw:shadow-slate-200/80 tw:flex tw:items-center tw:justify-center"
                            >
                                <ScanSearch class="tw:w-7 tw:h-7 tw:text-primary/50" />
                            </div>
                            <div class="tw:text-center">
                                <p class="tw:text-sm tw:font-semibold tw:text-slate-500">
                                    No image selected
                                </p>
                                <p class="tw:text-xs tw:text-slate-400 tw:mt-0.5">
                                    Use camera or upload to get started
                                </p>
                            </div>
                        </div>

                        <div v-else-if="mode === 'camera'" class="tw:absolute tw:inset-0">
                            <Camera
                                ref="camera"
                                :resolution="{ width: 600, height: 600 }"
                                autoplay
                                class="tw:w-full tw:h-full tw:object-cover"
                            />

                            <div class="tw:absolute tw:inset-5 tw:pointer-events-none">
                                <div
                                    class="tw:absolute tw:top-0 tw:left-0 tw:w-7 tw:h-7 tw:border-t-[3px] tw:border-l-[3px] tw:border-white tw:rounded-tl-lg tw:drop-shadow"
                                ></div>
                                <div
                                    class="tw:absolute tw:top-0 tw:right-0 tw:w-7 tw:h-7 tw:border-t-[3px] tw:border-r-[3px] tw:border-white tw:rounded-tr-lg tw:drop-shadow"
                                ></div>
                                <div
                                    class="tw:absolute tw:bottom-0 tw:left-0 tw:w-7 tw:h-7 tw:border-b-[3px] tw:border-l-[3px] tw:border-white tw:rounded-bl-lg tw:drop-shadow"
                                ></div>
                                <div
                                    class="tw:absolute tw:bottom-0 tw:right-0 tw:w-7 tw:h-7 tw:border-b-[3px] tw:border-r-[3px] tw:border-white tw:rounded-br-lg tw:drop-shadow"
                                ></div>

                                <div
                                    class="tw:absolute tw:top-2 tw:right-2 tw:flex tw:items-center tw:gap-1.5 tw:bg-black/40 tw:backdrop-blur-sm tw:rounded-full tw:px-2.5 tw:py-1"
                                >
                                    <span
                                        class="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-red-400 tw:animate-pulse"
                                    ></span>
                                    <span
                                        class="tw:text-[10px] tw:font-bold tw:text-white tw:tracking-widest"
                                    >
                                        LIVE
                                    </span>
                                </div>
                            </div>
                        </div>

                        <template v-else-if="mode === 'preview' && hasResults">
                            <McAnnotatedImage
                                :src="imageUrl!"
                                class="tw:absolute tw:inset-0 tw:h-full tw:w-full"
                            />
                        </template>

                        <template v-else-if="mode === 'preview'">
                            <img
                                :src="imageUrl!"
                                alt="Microscope Image"
                                class="tw:absolute tw:inset-0 tw:w-full tw:h-full tw:object-contain"
                            />

                            <!-- Analyzing overlay -->
                            <Transition
                                enter-active-class="tw:transition-opacity tw:duration-300"
                                enter-from-class="tw:opacity-0"
                                leave-active-class="tw:transition-opacity tw:duration-300"
                                leave-to-class="tw:opacity-0"
                            >
                                <div
                                    v-if="isAnalyzing"
                                    class="tw:absolute tw:inset-0 tw:bg-slate-900/60 tw:backdrop-blur-sm tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3"
                                >
                                    <div class="tw:relative tw:w-16 tw:h-16">
                                        <div
                                            class="tw:absolute tw:inset-0 tw:rounded-full tw:border-2 tw:border-white/20"
                                        ></div>
                                        <div
                                            class="tw:absolute tw:inset-0 tw:rounded-full tw:border-t-2 tw:border-primary tw:animate-spin"
                                        ></div>
                                        <ScanSearch
                                            class="tw:absolute tw:inset-0 tw:m-auto tw:w-6 tw:h-6 tw:text-white/70"
                                        />
                                    </div>
                                    <span
                                        class="tw:text-white tw:text-sm tw:font-semibold tw:tracking-wide"
                                    >
                                        Running AI Detection…
                                    </span>
                                    <span class="tw:text-white/50 tw:text-xs">
                                        This may take a moment
                                    </span>
                                </div>
                            </Transition>
                        </template>
                    </div>
                </div>

                <!-- ── Controls sidebar ── -->
                <div
                    class="tw:w-full tw:lg:w-[450px] tw:shrink-0 tw:p-5 tw:md:p-6 tw:flex tw:flex-col tw:gap-2 tw:bg-slate-50/60"
                    style="min-height: 0"
                >
                    <span
                        class="tw:text-[10px] tw:font-bold tw:text-slate-400 tw:uppercase tw:tracking-[0.12em] tw:mb-1"
                    >
                        Controls
                    </span>

                    <McButton
                        variant="outline"
                        class="tw:w-full tw:justify-start tw:gap-2.5 tw:text-sm tw:border-slate-200 tw:bg-white tw:text-slate-700 tw:shadow-sm tw:shadow-slate-100 hover:tw:border-primary/30 hover:tw:text-primary tw:transition-colors"
                        @click="startCamera"
                    >
                        <CameraIcon class="tw:w-4 tw:h-4 tw:text-slate-400" />
                        Camera
                    </McButton>

                    <McButton
                        variant="outline"
                        class="tw:w-full tw:justify-start tw:gap-2.5 tw:text-sm tw:border-slate-200 tw:bg-white tw:text-slate-700 tw:shadow-sm tw:shadow-slate-100 hover:tw:border-primary/30 hover:tw:text-primary tw:transition-colors disabled:tw:opacity-40 disabled:tw:shadow-none"
                        :disabled="mode !== 'camera'"
                        @click="takeSnapshot"
                    >
                        <FlipHorizontal class="tw:w-4 tw:h-4 tw:text-slate-400" />
                        Take Snapshot
                    </McButton>

                    <McButton
                        variant="outline"
                        class="tw:w-full tw:justify-start tw:gap-2.5 tw:text-sm tw:border-slate-200 tw:bg-white tw:text-slate-700 tw:shadow-sm tw:shadow-slate-100 hover:tw:border-primary/30 hover:tw:text-primary tw:transition-colors"
                        @click="triggerUpload"
                    >
                        <Upload class="tw:w-4 tw:h-4 tw:text-slate-400" />
                        Upload Image
                    </McButton>

                    <div class="tw:h-px tw:bg-slate-200 tw:my-1"></div>

                    <McButton
                        variant="ghost"
                        class="tw:w-full tw:justify-start tw:gap-2.5 tw:text-sm tw:text-slate-400 hover:tw:text-red-500 hover:tw:bg-red-50 tw:transition-colors disabled:tw:opacity-30"
                        :disabled="mode === 'empty'"
                        @click="clearImage"
                    >
                        <Trash2 class="tw:w-4 tw:h-4" />
                        Clear Image
                    </McButton>

                    <div v-if="hasResults" class="tw:pt-3 tw:border-t tw:border-slate-200">
                        <McDetectionFilters />
                    </div>

                    <div class="tw:flex-1"></div>

                    <!-- Run Detection CTA -->
                    <div
                        class="tw:pt-3 tw:border-t tw:border-slate-200 tw:flex tw:flex-col tw:gap-2"
                    >
                        <div>
                            <label
                                class="tw:text-[10px] tw:font-bold tw:text-slate-400 tw:uppercase tw:tracking-[0.12em] tw:mb-1 tw:block"
                            >
                                Classification / Detection
                            </label>
                            <McSelect
                                v-model="selectedModel"
                                :options="primaryModelOptions"
                                option-value="value"
                                option-label="label"
                                placeholder="Select a model"
                                :disabled="isAnalyzing"
                                class="tw:bg-white"
                            />
                            <p
                                v-if="selectedModelSpec"
                                class="tw:text-[10px] tw:text-slate-400 tw:mt-1 tw:leading-relaxed"
                            >
                                {{ selectedModelSpec.description }}
                            </p>
                        </div>

                        <div>
                            <label
                                class="tw:text-[10px] tw:font-bold tw:text-slate-400 tw:uppercase tw:tracking-[0.12em] tw:mb-1 tw:block"
                            >
                                Segmentation
                            </label>
                            <McSelect
                                v-model="selectedSegmentModel"
                                :options="segmentModelOptions"
                                option-value="value"
                                option-label="label"
                                placeholder="Select a segmenter"
                                :disabled="isAnalyzing || !canChain"
                                class="tw:bg-white"
                            />
                            <p
                                v-if="!canChain"
                                class="tw:text-[10px] tw:text-slate-400 tw:mt-1 tw:leading-relaxed"
                            >
                                Only a detector chains a segmenter; the selected model runs alone.
                            </p>
                            <p
                                v-else-if="selectedSegmentSpec"
                                class="tw:text-[10px] tw:text-slate-400 tw:mt-1 tw:leading-relaxed"
                            >
                                {{ selectedSegmentSpec.description }}
                            </p>
                        </div>

                        <McButton
                            class="tw:w-full tw:gap-2 tw:text-sm tw:font-bold tw:shadow-md tw:shadow-primary/20 tw:transition-all hover:tw:shadow-lg hover:tw:shadow-primary/25 disabled:tw:shadow-none"
                            :disabled="!currentFile || !selectedModel || isAnalyzing"
                            @click="runDetection"
                        >
                            <Loader2 v-if="isAnalyzing" class="tw:w-4 tw:h-4 tw:animate-spin" />
                            <ScanSearch v-else class="tw:w-4 tw:h-4" />
                            {{ isAnalyzing ? 'Analyzing…' : 'Run AI Detection' }}
                        </McButton>
                        <p
                            class="tw:text-[10px] tw:text-slate-400 tw:text-center tw:mt-2.5 tw:leading-relaxed"
                        >
                            {{
                                currentFile
                                    ? 'Image ready for analysis'
                                    : 'Select an image to continue'
                            }}
                        </p>
                    </div>
                </div>
            </McDetectionFilterScope>

            <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-4 tw:mt-4">
                <!-- Detection summary -->
                <Transition
                    enter-active-class="tw:transition-all tw:duration-500 tw:ease-out"
                    enter-from-class="tw:opacity-0 tw:translate-y-4"
                    enter-to-class="tw:opacity-100 tw:translate-y-0"
                >
                    <div v-if="hasResults" class="tw:space-y-4 tw:lg:col-span-2">
                        <div
                            class="tw:bg-white tw:rounded-2xl tw:border tw:border-slate-200 tw:shadow-sm tw:p-5 tw:md:p-6"
                        >
                            <div class="tw:flex tw:items-center tw:justify-between tw:mb-4">
                                <h2 class="tw:text-sm tw:font-bold tw:text-slate-700">
                                    Detection Results
                                </h2>
                                <span
                                    class="tw:text-[10px] tw:font-semibold tw:text-slate-400 tw:uppercase tw:tracking-widest tw:bg-slate-100 tw:px-2 tw:py-0.5 tw:rounded-full"
                                >
                                    {{ detectionSteps.length }} class{{
                                        detectionSteps.length === 1 ? '' : 'es'
                                    }}
                                    found
                                </span>
                            </div>

                            <div
                                class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:lg:grid-cols-3 tw:gap-3"
                            >
                                <McConfidenceBar
                                    v-for="step in detectionSteps"
                                    :key="step.id"
                                    :label="step.predicted_class"
                                    :confidence="step.confidence"
                                />
                            </div>
                        </div>

                        <div
                            v-if="topResult"
                            class="tw:bg-white tw:rounded-2xl tw:border tw:border-slate-200 tw:shadow-sm tw:p-5 tw:md:p-6"
                        >
                            <h2 class="tw:text-sm tw:font-bold tw:text-slate-700 tw:mb-3">
                                AI Analysis Summary
                            </h2>

                            <div
                                class="tw:relative tw:bg-linear-to-br tw:from-primary/5 tw:to-primary/3 tw:border tw:border-primary/15 tw:rounded-xl tw:p-5 tw:overflow-hidden"
                            >
                                <span
                                    class="tw:absolute tw:top-2 tw:right-4 tw:text-5xl tw:font-black tw:text-primary/8 tw:select-none tw:leading-none"
                                >
                                    "
                                </span>
                                <p
                                    class="tw:text-sm tw:text-slate-600 tw:leading-relaxed tw:relative"
                                >
                                    The AI identified
                                    <span class="tw:font-bold tw:text-primary">
                                        {{ topResult.predicted_class }}
                                    </span>
                                    as the primary finding with
                                    <span class="tw:font-bold tw:text-primary">
                                        {{ Math.round(topResult.confidence * 100) }}% confidence
                                    </span>
                                    .
                                    <template v-if="detectionSteps.length > 1">
                                        Additional classes were also detected. Review all results
                                        below before grading.
                                    </template>
                                </p>
                            </div>

                            <div
                                class="tw:flex tw:items-start tw:gap-2 tw:mt-3 tw:p-3 tw:rounded-lg tw:bg-amber-50/60 tw:border tw:border-amber-100"
                            >
                                <span
                                    class="tw:w-3.5 tw:h-3.5 tw:rounded-full tw:bg-amber-300 tw:shrink-0 tw:mt-0.5"
                                ></span>
                                <p class="tw:text-[11px] tw:text-amber-700 tw:leading-relaxed">
                                    AI analysis is for educational guidance only. Results should be
                                    verified by an instructor.
                                </p>
                            </div>
                        </div>
                    </div>
                </Transition>
            </div>
        </div>

        <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="tw:hidden"
            @change="onFileChange"
        />
    </div>
</template>
