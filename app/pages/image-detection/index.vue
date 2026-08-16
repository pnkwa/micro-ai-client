<script setup lang="ts">
import {
    Camera as CameraIcon,
    ChevronDown,
    ChevronLeft,
    ChevronUp,
    Cpu,
    Upload,
    Trash2,
    Loader2,
    ScanSearch,
    Target,
    Sparkles,
    Lock,
    History,
} from '@lucide/vue'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { detectionService, type DetectionStep, type ModelSpec } from '~/services/detectionService'
import { useDetectionAvailability } from '~/core/composables/detectionAvailability'
import type { HistoryRecord } from '~/core/helpers/detectionHistory'
import {
    useCameraAvailability,
    cameraFailureMessage,
    type CameraStartFailure,
} from '~/core/composables/cameraCapture'

/**
 * No 'camera' state any more: capture happens on the full-screen McCameraCapture screen, the same
 * one the exam flow uses, and this page only ever shows the image that came back. The viewfinder
 * used to be a 227px square inside the page on a phone, framing a slide through a keyhole.
 */
type ViewerMode = 'empty' | 'preview'

/**
 * Turned away at the door while an exam is open (client request 5.2, BE-ADR-012).
 *
 * The server refuses the run regardless — this is so a student meets a clear message here rather
 * than after picking a model and uploading a photo. Checked before the page renders anything, so
 * the tool is never briefly usable.
 */
const {
    available: aiAvailable,
    message: aiUnavailableMessage,
    refresh: refreshAvailability,
} = useDetectionAvailability()

// FORCED, unlike the sidebar's throttled checks. This page is the door: entering on a cached
// "available" from moments ago would render the tool to a student whose exam opened in the
// meantime, and they would only find out after uploading. The sidebar can afford to be briefly
// stale because it is decoration; this cannot.
await refreshAvailability({ force: true })

const router = useRouter()

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: 'Image Detection', to: '/image-detection' }])

const fileInput = ref<HTMLInputElement>()
// Separate from the upload input so `capture` is fixed per input: Safari reads the attribute when
// the picker opens, so toggling it on one shared input is racy.
const osCameraInput = ref<HTMLInputElement>()

const mode = ref<ViewerMode>('empty')
const imageUrl = ref<string | null>(null)
const currentFile = ref<File | Blob | null>(null)
const currentSource = ref<'upload' | 'camera'>('upload')
const isAnalyzing = ref(false)
const hasResults = ref(false)
const detectionSteps = ref<DetectionStep[]>([])
// The model that produced the steps on screen — not `selectedModel`, which the user can change
// after a run. Only read while there are steps, so the clear paths don't have to reset it.
const resultModel = ref('')

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

// Split the result steps into the classify/detect pass and the optional fungal segmentation
// pass so the summary can describe each. The segmenter's step name contains "segment"; its
// boxes are the outlined fungal elements, so their count/confidence answer "are there fungal
// elements, and how sure is the model".
const isSegmentStep = (s: DetectionStep) => /segment/i.test(s.step)
const detectStep = computed(
    () => detectionSteps.value.find((s) => !isSegmentStep(s)) ?? detectionSteps.value[0] ?? null,
)
const segmentStep = computed(() => detectionSteps.value.find(isSegmentStep) ?? null)
const fungalCount = computed(() => segmentStep.value?.boxes.length ?? 0)
const fungalConfidence = computed(() => {
    const boxes = segmentStep.value?.boxes ?? []
    return boxes.length ? Math.max(...boxes.map((b) => b.confidence)) : 0
})

// A detect/segment pass that found nothing reports predicted_class 'none' (worker-contract:
// the top box's label, or 'none' when there were no boxes). That's the absence of a class,
// not one the user detected — and the summary already says so — so it doesn't belong among
// the per-class confidence bars or the "classes found" count.
const classSteps = computed(() => detectionSteps.value.filter((s) => s.predicted_class !== 'none'))

/**
 * Is there anything for the Display controls to act on?
 *
 * McDetectionFilters renders nothing without boxes - a classify-only model, or a detector that
 * found none - and the section around it must go with it, or the panel keeps a "Display" heading, a
 * divider and (on a phone, where this column carries nothing else) a bare white block below the
 * results, all wrapped around no controls at all.
 */
const hasFilterableBoxes = computed(() => detectionSteps.value.some((s) => s.boxes.length > 0))

// Students get the morphology, not the diagnosis. Naming the class ("Bacterial vaginosis") hands
// over the answer they are here to reach themselves; the element the detector boxes — "Clue
// cell", "Pseudohyphae / budding yeast" — describes what it recognised and leaves the reading to
// them. Staff see the class outright, since they are checking the model rather than learning
// from it. Same principle as the server withholding exam detection from students (BE-ADR-012).
// `buildSummary` is where this actually gets enforced, and where the tests hold it.
const authStore = useAuth()
const isStudent = computed(() => authStore.user?.user_type === 'student' || !authStore.user)

// Sourced from the manifest the server reports (GET /models), keyed by the model that actually
// ran — never a copy of the vocabulary kept here, so a model that adds a class needs no client
// change. Empty when that model reports no vocabulary (the legacy classifier).
const resultModelSpec = computed(() => models.value.find((m) => m.name === resultModel.value))

// The summary prose. Assembled in `detectionSummary.ts` rather than as template branches so the
// wording — which is the client's spec, and which has to stay diagnosis-free for students — is
// one testable pure function instead of markup. Bold runs come back as segments because the
// client renders no markdown.
const summarySegments = computed(() => {
    const step = detectStep.value
    if (!step) return []
    return buildSummary({
        step,
        elements: resultModelSpec.value?.elements ?? {},
        displayText: resultModelSpec.value?.displayText ?? {},
        isStaff: !isStudent.value,
        segment: {
            present: !!segmentStep.value,
            count: fungalCount.value,
            confidence: fungalConfidence.value,
        },
    })
})

// Which camera routes this device has, probed exactly as the exam flow probes them, so "Take a
// photo" means the same thing in both places.
const { canTakePhoto, canUseInAppCamera, cameraBlocked, inAppCamera } = useCameraAvailability()

/**
 * A device that can photograph, but not through OUR viewfinder.
 *
 * getUserMedia is gated on a secure context, so a phone browsing the dev server at
 * http://<lan-ip> gets no live preview and no zoom, no matter what this page does - the Camera
 * button still works, it just hands off to the phone's own camera app.
 */
const inAppCameraUnavailable = computed(() => canTakePhoto.value && !inAppCamera.value)

const cameraOpen = ref(false)

/**
 * The desktop panel drives a `bare` viewfinder itself (its own zoom row and its own shutter), the
 * way it did before this component existed. A phone gets the full viewfinder, which carries those
 * controls inside the frame.
 */
const cameraRef = useTemplateRef<{
    takeShot: () => void
    zoom: number
    zoomMin: number
    zoomMax: number
    zoomStep: number
    canZoom: boolean
    applyZoom: (value: number, track?: MediaStreamTrack | null) => void
    zoomBy: (direction: 1 | -1, track?: MediaStreamTrack | null) => void
    track: () => MediaStreamTrack | null
}>('cameraRef')

/**
 * The model pickers, in a sheet of their own on a phone.
 *
 * Deliberately not sat next to the box filters in the sheet: those change what is SHOWN of a
 * finished run and take effect as you drag, whereas the model decides what gets run and changes
 * nothing until you run again. Side by side would imply the same immediacy.
 */
const modelSettingsOpen = ref(false)

/**
 * Past runs, in a sheet of their own on a phone.
 *
 * The panel is appended to the bottom of the page on desktop, which is unreachable here: below lg
 * this page is a fixed-height scanner that does not scroll until results exist, so a panel down
 * there would be invisible in precisely the state - nothing staged yet - that history is for.
 */
const historyOpen = ref(false)

/**
 * Below lg this page is a scanner, not a document: it opens straight into the camera, the staged
 * image replaces it, and the results scroll under a pinned image. Above lg it stays the two-column
 * workbench, where a viewfinder that hijacked the screen would be the wrong thing entirely.
 */
const isCompact = useMediaQuery('(max-width: 1023px)')

/**
 * Hold the document still while this page is a full-screen scanner.
 *
 * The heights already make it fit exactly, but on iOS "fits exactly" is not the same as "cannot
 * scroll": rubber-band overscroll still drags the black viewer up and paints the app's pale
 * background in the gap, and any stray pixel of overflow turns into a real scroll that collapses
 * the toolbars and grows the viewport, opening the same gap from the other direction.
 *
 * Only where the page is that scanner - phone, and not showing results, which are meant to scroll.
 *
 * Toggled straight onto <html> rather than through useHead: this page has top-level awaits, and
 * after those the Nuxt app context is gone, so useHead registers nothing and throws on teardown.
 * Component lifecycle hooks survive the awaits (the compiler restores the instance around them),
 * which is why the class is added by an effect and removed by onBeforeUnmount.
 */
/**
 * Is there anything below the fold to scroll to?
 *
 * The sheet ends past the bottom of the screen by design - the results card sits above the fold and
 * the AI summary below it - but nothing on a phone says so. A sheet whose last visible element is a
 * neatly finished card reads as the end of the page, and the summary goes unread.
 *
 * Recomputed on scroll and on resize rather than derived: scrollHeight is not reactive, so there is
 * nothing to derive it from.
 */
const moreBelow = ref(false)

/** Tapping the hint should move the page, not just describe that it can move. */
const scrollDown = () => window.scrollBy({ top: window.innerHeight * 0.7, behavior: 'smooth' })
const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

const measureScroll = () => {
    const doc = document.documentElement
    moreBelow.value = doc.scrollHeight - (window.scrollY + window.innerHeight) > 24
}

useEventListener(window, 'scroll', measureScroll, { passive: true })
useEventListener(window, 'resize', measureScroll)
watch([hasResults, isCompact], () => nextTick(measureScroll), { immediate: true })

/** Feed running in the desktop panel, where the page's shutter is the one that captures. */
const liveOnDesktop = computed(() => cameraOpen.value && !isCompact.value)

const scrollLocked = computed(() => isCompact.value && aiAvailable.value && !hasResults.value)

const SCROLL_LOCK_CLASS = 'mc-scroll-lock'

// An effect, not derived state: this writes to the document, which no computed should do.
watchEffect(() => {
    document.documentElement.classList.toggle(SCROLL_LOCK_CLASS, scrollLocked.value)
})

// Navigating away must lift it, or every other page inherits an unscrollable document.
onBeforeUnmount(() => document.documentElement.classList.remove(SCROLL_LOCK_CLASS))

/**
 * Straight into the viewfinder on a phone - the first thing you do here is point it at an eyepiece,
 * and a screen that opens on an empty placeholder makes you tap twice to say so. The capture screen
 * carries its own gallery button, so "camera or image" is still a choice, just one made from the
 * camera rather than in front of it.
 */
/**
 * True only while the camera the page opened BY ITSELF is starting. A failure there must stay
 * silent: nobody asked for it, so an error toast reports a problem the user did not cause, and the
 * old fallback of opening a file picker would be a dialog appearing unbidden on page load. The
 * chooser underneath is already the right place to land.
 */
const cameraAutoStarted = ref(false)

onMounted(() =>
    nextTick(() => {
        if (!isCompact.value || mode.value !== 'empty' || !canUseInAppCamera.value) return
        cameraAutoStarted.value = true
        startCamera()
    }),
)

/** Back out of a staged image to where it came from: the camera, on a phone. */
const backToCapture = () => {
    clearImage()
    if (isCompact.value && canUseInAppCamera.value) startCamera()
}

/**
 * Our own capture screen where it can run, the phone's camera app otherwise - and straight to the
 * file picker where neither is possible.
 *
 * Checked against state resolved on mount rather than awaited here: an await would end the user
 * gesture and the browser would refuse the programmatic click on the file input.
 */
const startCamera = () => {
    if (cameraBlocked.value) {
        toast.error(
            'Camera access is blocked for this site. Allow it in your browser settings, or upload a photo instead.',
        )
        fileInput.value?.click()
        return
    }

    if (canUseInAppCamera.value) {
        cameraOpen.value = true
        return
    }
    cameraAutoStarted.value = false
    osCameraInput.value?.click()
}

/** The capture screen could not start. Say why, then take the user to the route that does work. */
const onCameraFail = (reason: CameraStartFailure) => {
    if (cameraAutoStarted.value) {
        cameraAutoStarted.value = false
        return
    }
    toast.error(cameraFailureMessage[reason])
    fileInput.value?.click()
}

/** A photo off the capture screen enters exactly where an uploaded one does. */
const onCapture = (file: File) => {
    cameraAutoStarted.value = false
    setImage(file, 'camera')
}

const triggerUpload = () => fileInput.value?.click()

/** The one way an image enters the page, whichever of the three routes it arrived by. */
const setImage = (file: File | Blob, source: 'upload' | 'camera') => {
    // Whatever the route, an image on screen means the viewfinder is done. Closing it here rather
    // than in each caller is what stops a photo picked from the gallery WHILE the feed is live from
    // leaving the stream running behind the picture - the camera light stays on, the LIVE badge and
    // the capture shutter go on claiming a feed nobody can see, and the video sits mounted under the
    // image it was replaced by.
    cameraOpen.value = false
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = URL.createObjectURL(file)
    currentFile.value = file
    currentSource.value = source
    mode.value = 'preview'
    hasResults.value = false
    detectionSteps.value = []
    // A new image is not the record the history panel has highlighted, whichever route it came in
    // by. `setImage` is the only entry point, so this is the only place the highlight has to drop.
    activeRecordId.value = null
}

const onFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]

    // A dismissed camera or picker fires `change` with an empty list on some Android browsers;
    // passing that on would clear an image the user had already chosen.
    if (file) setImage(file, input === osCameraInput.value ? 'camera' : 'upload')

    // Cleared after every pick: choosing the same file twice in a row would otherwise not fire
    // `change` at all, since the value never changed.
    input.value = ''
}

const clearImage = () => {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = null
    currentFile.value = null
    mode.value = 'empty'
    hasResults.value = false
    detectionSteps.value = []
    activeRecordId.value = null
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
        resultModel.value = result.model
        hasResults.value = result.steps.length > 0
        // The run is now a history row, including a deduped one that reused a cached result
        // (BE-ADR-024) — it is still recorded as this caller's own. Highlight it and re-list.
        activeRecordId.value = result.id
        history.value?.refresh()
    } catch {
        toast.error('Detection failed. Please try again.')
    } finally {
        isAnalyzing.value = false
    }
}

// Detection history (BE-ADR-024). The panel lists past runs; picking one loads it back into this
// same viewer instead of re-running the worker. `activeRecordId` is only for the highlight, and is
// cleared the moment the viewer shows something else — a new upload, a snapshot, or a clear.
const history = useTemplateRef('history')
const activeRecordId = ref<number | null>(null)

const loadFromHistory = async (record: HistoryRecord) => {
    // Same reason `setImage` does it: a record on screen means the viewfinder is done, and a stream
    // left running behind the picture keeps the camera light on with nothing to show for it.
    cameraOpen.value = false
    try {
        const blobUrl = await detectionService.imageBlobUrl(record.id)
        if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
        imageUrl.value = blobUrl
    } catch {
        toast.error('Could not load that image.')
        return
    }
    detectionSteps.value = record.steps
    resultModel.value = record.model
    hasResults.value = record.steps.length > 0
    currentFile.value = null
    mode.value = 'preview'
    activeRecordId.value = record.id
}

onUnmounted(() => {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
})
</script>

<template>
    <div
        v-if="!aiAvailable"
        class="tw:flex tw:min-h-[calc(100vh-80px)] tw:items-center tw:justify-center tw:px-4"
    >
        <!-- Blocked outright rather than disabled in place: a half-usable page invites a student to
             try, and the tool's whole surface is the answer they are being examined on. -->
        <!--
            Same min-height as the working page below, so the block is a full screen rather than
            content stranded at the top with empty space beneath it. No card around it: with nothing
            else on the page there is nothing to separate it from, and the border only drew a box
            around a message.
        -->
        <div
            class="tw:flex tw:w-full tw:max-w-md tw:flex-col tw:items-center tw:gap-5 tw:text-center"
        >
            <div
                class="tw:flex tw:size-14 tw:items-center tw:justify-center tw:rounded-full tw:bg-navy-5 tw:text-navy-40"
            >
                <Lock class="tw:size-7" />
            </div>

            <div class="tw:flex tw:flex-col tw:gap-2">
                <h1 class="tw:text-lg tw:font-semibold tw:text-navy-100">
                    Image Detection is unavailable
                </h1>
                <p class="tw:text-sm tw:leading-relaxed tw:text-navy-60">
                    {{ aiUnavailableMessage }}
                </p>
            </div>

            <!--
                Classes is the primary action, not Back: the reason the tool is withheld is an exam
                the student has not submitted, so the thing they actually need is the way to it.
                Back only returns them to where they already were.
            -->
            <div class="tw:flex tw:flex-wrap tw:justify-center tw:gap-2">
                <McButton variant="outline" size="sm" @click="router.push('/')">Back</McButton>
                <McButton size="sm" @click="router.push('/classes')">Go to my classes</McButton>
            </div>
        </div>
    </div>

    <div
        v-else
        class="tw:flex tw:flex-col tw:space-y-0 tw:lg:min-h-[calc(100vh-80px)] tw:lg:space-y-5"
    >
        <!-- The min-height and the section spacing above are desktop shapes, hence the lg: gates:
             on a phone the stage sizes itself to the viewport and both push the page past it. The
             spacing also lands a 20px margin on the fixed scroll hint below - margins apply to
             fixed boxes - holding it off the bottom edge it is supposed to sit on. -->
        <!-- Desktop only. On a phone the nav bar's breadcrumb already reads "Image Detection", and
             this block cost the stage ~90px of the screen it is the whole point of. -->
        <div class="tw:hidden tw:lg:block">
            <h1 class="tw:text-2xl tw:font-bold tw:text-primary">Image Detection</h1>
            <p class="tw:text-sm tw:text-slate-500 tw:mt-1">
                Capture or upload microscope images and analyze them using AI-assisted detection.
            </p>
        </div>

        <!-- A flex column on a phone so the three regions below can be ORDERED: stage, then the
             results, then the controls. The filter scope is display:contents there (it is only a
             provider, and its <div> would otherwise trap its children in their own box), which
             lets the stage and the controls sit in this column alongside the results and be
             reordered around them. From lg it is the two-column row again, untouched. -->
        <!--
            The negative margins cancel the app layout's own p-4 so the stage runs edge to edge on a
            phone, the way a viewer should; the gutters come back at lg where this is a panel.

            Pinned to the viewport (and painted black) in every pre-result state. Left to size
            itself, this column stops at its content and the page's own pale background shows
            through underneath - a white strip below the action row on a black screen. With results
            it goes back to auto, because then the page is meant to scroll.

            dvh here, not svh: svh is the viewport WITH the browser's toolbars, so the moment iOS
            collapses them on a scroll the visible area grows and that pale background reappears in
            the gap the column no longer fills. dvh tracks the viewport as it is right now, and a
            screen that does not scroll never makes it change.
        -->
        <div
            class="tw:-mx-4 tw:-mt-4 tw:-mb-4 tw:flex tw:flex-col tw:bg-black tw:lg:mx-0 tw:lg:mt-0 tw:lg:mb-0 tw:lg:block tw:lg:h-full tw:lg:bg-transparent"
            :class="hasResults ? 'tw:h-full' : 'tw:h-[calc(100dvh-3rem)]'"
        >
            <!-- Two columns that share the overlay's filter scope: the viewfinder + its capture
                 bar on the left, the analysis controls (Model / Run / Display) on the right.
                 Fixed height only on lg, where they sit side-by-side and share it; stacked on
                 iPad/mobile it's height-auto so the right column flows below the viewfinder, and
                 the image panel takes its own height from the aspect ratio. -->
            <!--
                The scope is a provider, nothing more, so it renders as `contents` and the row below
                does the layout. It has to reach the result sheet as well as the stage: the sheet's
                display mode hosts McDetectionFilters, and those controls and the overlay they drive
                have to be reading the same filter state.
            -->
            <McDetectionFilterScope :steps="detectionSteps" class="tw:contents">
                <div
                    class="tw:contents tw:lg:flex tw:lg:h-200 tw:lg:flex-1 tw:lg:flex-row tw:lg:divide-x tw:lg:divide-slate-100"
                >
                    <!-- The stage. Dark and edge-to-edge on a phone so the image is the screen; the
                     pale panel with gutters is a desktop treatment, where it sits beside the
                     controls column rather than being the whole view. -->
                    <div
                        class="tw:sticky tw:top-12 tw:z-10 tw:order-1 tw:flex tw:flex-1 tw:flex-col tw:overflow-hidden tw:bg-black tw:p-0 tw:lg:static tw:lg:order-none tw:lg:bg-transparent tw:lg:p-5 tw:xl:p-6"
                    >
                        <!--
                        min-h so the row keeps its height whether or not a status badge is in it.
                        The badge (text-[11px] + py-1 + border, ~23px) is taller than the label
                        beside it (~16px), so without this the whole viewer and everything under it
                        shifts down the moment a detection finishes.
                    -->
                        <div
                            class="tw:mb-3 tw:hidden tw:min-h-7 tw:items-center tw:justify-between tw:lg:flex"
                        >
                            <div class="tw:flex tw:items-center tw:gap-2">
                                <span
                                    class="tw:w-1.5 tw:h-1.5 tw:rounded-full"
                                    :class="{
                                        'tw:bg-slate-300': mode === 'empty',
                                        'tw:bg-primary':
                                            mode === 'preview' && !hasResults && !isAnalyzing,
                                        'tw:bg-emerald-400 tw:animate-pulse': hasResults,
                                        'tw:bg-blue-400 tw:animate-pulse': isAnalyzing,
                                    }"
                                ></span>
                                <span
                                    class="tw:text-xs tw:font-semibold tw:text-slate-400 tw:uppercase tw:tracking-widest"
                                >
                                    {{ mode === 'preview' ? 'Image Preview' : 'Viewer' }}
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

                        <!--
                        Its content is absolutely positioned (0 intrinsic height), so it needs a
                        height source: an explicit one when stacked, flex-1 to fill the row on lg.

                        On a phone the height is what the state is worth. The camera and a staged
                        image take the whole screen - both carry their controls INSIDE this box, so
                        there is nothing below to make room for. The chooser is the exception: its
                        Upload/Camera/Clear row sits under the box, so the box has to stop short of
                        the fold or that row lands beneath the browser's own toolbar, unreachable -
                        which is exactly what it did on iOS Safari.

                        The moment results exist they are what you came for, so the stage gives way
                        and the white result area comes up under it without a scroll. The reserve is
                        sized to the sheet's two fixed rows - the Display filters and the Detection
                        Results card's header and first line - because a result you have to scroll to
                        find is not a result you have been shown.
                    -->
                        <div
                            class="tw:relative tw:w-full tw:overflow-hidden tw:rounded-none tw:bg-black tw:transition-[height] tw:duration-300 tw:lg:h-auto tw:lg:flex-1 tw:lg:rounded-md tw:lg:bg-linear-to-br tw:lg:from-slate-100 tw:lg:to-slate-50 tw:lg:ring-1 tw:lg:ring-slate-200/80"
                            :class="
                                hasResults
                                    ? 'tw:h-[calc(100dvh-3rem-21rem)]'
                                    : mode === 'empty' && !cameraOpen
                                      ? 'tw:h-[calc(100dvh-3rem-9rem)]'
                                      : 'tw:h-[calc(100dvh-3rem)]'
                            "
                        >
                            <!-- Phone only, and only with an image staged: the way back to the camera
                             this image came from. Desktop needs none - the viewfinder never took
                             the screen there, so there is nothing to come back from. -->
                            <button
                                v-if="mode === 'preview'"
                                type="button"
                                class="tw:absolute tw:top-3 tw:left-3 tw:z-20 tw:flex tw:size-9 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:bg-black/45 tw:text-white tw:backdrop-blur-sm tw:transition-colors hover:tw:bg-black/65 tw:lg:hidden"
                                aria-label="Back to the camera"
                                @click="backToCapture"
                            >
                                <ChevronLeft class="tw:size-5" />
                            </button>

                            <!-- Opposite the back button, and stacked downwards as more of them
                                 apply. While the viewfinder is live the camera's own switch-camera
                                 control owns the top of this corner, so the stack drops a row and
                                 continues underneath it rather than overlapping - one column of
                                 round buttons down the right edge, whoever owns each.

                                 Not hidden during the camera, which was the first cut: the camera
                                 opens by itself on arrival, so hiding this would put history behind
                                 "close the camera first" in exactly the state it is most wanted. -->
                            <div
                                class="tw:absolute tw:right-3 tw:z-20 tw:flex tw:flex-col tw:gap-2 tw:lg:hidden"
                                :class="cameraOpen ? 'tw:top-14' : 'tw:top-3'"
                            >
                                <!-- Only with an image staged: the model decides what a run does,
                                     and there is nothing to run without one. -->
                                <button
                                    v-if="mode === 'preview'"
                                    type="button"
                                    class="tw:flex tw:size-9 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:bg-black/45 tw:text-white tw:backdrop-blur-sm tw:transition-colors hover:tw:bg-black/65"
                                    aria-label="Model settings"
                                    @click="modelSettingsOpen = true"
                                >
                                    <Cpu class="tw:size-5" />
                                </button>

                                <!-- In every non-camera state, unlike the model button. Past runs
                                     are most useful with nothing staged - that is the empty screen
                                     you land on - so gating this on `preview` the way the model
                                     button is gated would hide it exactly when it is wanted. -->
                                <button
                                    type="button"
                                    class="tw:flex tw:size-9 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:bg-black/45 tw:text-white tw:backdrop-blur-sm tw:transition-colors hover:tw:bg-black/65"
                                    aria-label="Recent analyses"
                                    @click="historyOpen = true"
                                >
                                    <History class="tw:size-5" />
                                </button>
                            </div>

                            <div
                                id="detection-run-slot"
                                class="tw:absolute tw:inset-x-0 tw:bottom-0 tw:z-20 tw:px-4 tw:pb-[max(1rem,env(safe-area-inset-bottom))] tw:lg:hidden"
                                :class="
                                    currentFile && mode === 'preview' && !hasResults
                                        ? 'tw:bg-linear-to-t tw:from-black/80 tw:via-black/50 tw:to-transparent tw:pt-12'
                                        : 'tw:pointer-events-none'
                                "
                            ></div>

                            <!-- The camera renders IN the stage rather than over the app: on this
                             page the viewfinder is the content, so it sits in the frame with the
                             nav bar still above it. The exam flow keeps the full-screen takeover,
                             which is right there - it interrupts a form for one photo. -->
                            <McCameraCapture
                                ref="cameraRef"
                                v-model:open="cameraOpen"
                                inline
                                :full-bleed="isCompact"
                                title="Capture a slide"
                                file-name="detection"
                                :bare="!isCompact"
                                :gallery="isCompact"
                                @capture="onCapture"
                                @fail="onCameraFail"
                                @gallery="triggerUpload"
                            />

                            <div
                                v-if="mode === 'empty' && !cameraOpen"
                                class="tw:absolute tw:inset-0 tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-4"
                            >
                                <div
                                    class="tw:relative tw:flex tw:h-16 tw:w-16 tw:items-center tw:justify-center tw:rounded-md tw:bg-white/10 tw:lg:bg-white tw:lg:shadow-md tw:lg:shadow-slate-200/80"
                                >
                                    <ScanSearch
                                        class="tw:h-7 tw:w-7 tw:text-white/50 tw:lg:text-primary/50"
                                    />
                                </div>
                                <div class="tw:text-center">
                                    <p
                                        class="tw:text-sm tw:font-semibold tw:text-white/80 tw:lg:text-slate-500"
                                    >
                                        No image selected
                                    </p>
                                    <p
                                        class="tw:mt-0.5 tw:text-xs tw:text-white/50 tw:lg:text-slate-400"
                                    >
                                        Use camera or upload to get started
                                    </p>
                                    <!-- Said out loud rather than left as a silent difference: on an
                                     insecure origin this build offers strictly less than the same
                                     one on localhost, with nothing on screen to explain why. -->
                                    <p
                                        v-if="inAppCameraUnavailable"
                                        class="tw:mx-auto tw:mt-2 tw:max-w-[16rem] tw:text-[11px] tw:leading-relaxed tw:text-amber-300/80 tw:lg:text-amber-600"
                                    >
                                        Live preview and zoom need a secure page (https, or
                                        localhost). Camera will open your phone's camera app
                                        instead.
                                    </p>
                                </div>
                            </div>

                            <template v-else-if="mode === 'preview' && hasResults">
                                <McAnnotatedImage
                                    :src="imageUrl!"
                                    :legend="!isCompact"
                                    class="tw:absolute tw:inset-0 tw:h-full tw:w-full"
                                />
                            </template>

                            <!--
                            Mirrors McAnnotatedImage's own layout: image area above, a bar of the
                            same height below. Without the spacer the annotated view is shorter by
                            its legend, so the picture visibly shrinks the moment results land -
                            the same photo at two sizes depending on whether it has been analyzed.

                            object-scale-down, not object-contain, for the same reason: contain
                            scales a small image up to fill, scale-down leaves it at natural size.
                            McAnnotatedImage uses scale-down because its box overlay is positioned
                            against the drawn rect, so the preview has to agree or an image smaller
                            than the viewer jumps size too.
                        -->
                            <template v-else-if="mode === 'preview'">
                                <div class="tw:absolute tw:inset-0 tw:flex tw:flex-col tw:gap-2">
                                    <div
                                        class="tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:items-center tw:justify-center tw:overflow-hidden tw:rounded-none tw:bg-black tw:lg:rounded-md"
                                    >
                                        <img
                                            :src="imageUrl!"
                                            alt="Microscope Image"
                                            class="tw:h-full tw:w-full tw:object-scale-down tw:select-none"
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
                                    </div>

                                    <!-- Same height as McAnnotatedImage's legend row, and the same
                                     wording it shows with no steps, so only the content changes.

                                     Desktop only: on a phone the run button sits over this corner,
                                     and its own caption already says the image is unanalyzed. -->
                                    <div
                                        class="tw:hidden tw:h-12 tw:items-center tw:px-3 tw:lg:flex tw:lg:h-9"
                                    >
                                        <p
                                            class="tw:text-[11px] tw:text-white/40 tw:lg:text-navy-40"
                                        >
                                            Not analyzed.
                                        </p>
                                    </div>
                                </div>
                            </template>
                        </div>

                        <!-- The desktop panel's own zoom row, under the viewfinder where it has always
                         been. On a phone the viewfinder carries its own instead, so this is hidden
                         there and the component renders the control itself. -->
                        <McCameraZoomControl
                            v-if="!isCompact && cameraOpen && cameraRef?.canZoom"
                            class="tw:mt-4"
                            tone="dark"
                            :zoom="cameraRef.zoom"
                            :min="cameraRef.zoomMin"
                            :max="cameraRef.zoomMax"
                            :step="cameraRef.zoomStep"
                            @update:zoom="cameraRef.applyZoom($event, cameraRef.track())"
                            @step="cameraRef.zoomBy($event, cameraRef.track())"
                        />

                        <!-- Capture controls sit right under the viewer: a prominent shutter flanked by
                         Upload and Clear. On desktop the shutter captures while the feed is live,
                         exactly as it did before; on a phone it opens the viewfinder, which has a
                         shutter of its own. -->
                        <div
                            class="tw:mt-4 tw:items-center tw:justify-center tw:gap-10 tw:pb-1 tw:lg:flex tw:lg:pb-0"
                            :class="
                                mode === 'preview' || (cameraOpen && isCompact)
                                    ? 'tw:hidden'
                                    : 'tw:flex'
                            "
                        >
                            <button
                                type="button"
                                title="Upload an image"
                                class="tw:group tw:flex tw:flex-col tw:items-center tw:gap-1.5 tw:text-white/70 tw:transition-colors tw:lg:text-slate-500 hover:tw:text-primary"
                                @click="triggerUpload"
                            >
                                <span
                                    class="tw:flex tw:h-11 tw:w-11 tw:items-center tw:justify-center tw:rounded-full tw:bg-white/10 tw:transition-colors tw:lg:bg-slate-100 group-hover:tw:bg-primary/10"
                                >
                                    <Upload class="tw:h-5 tw:w-5" />
                                </span>
                                <span class="tw:text-[10px] tw:font-semibold">Upload</span>
                            </button>

                            <!-- Hidden, not disabled, where no camera route exists at all: a dead
                             shutter on a desktop with no webcam is a control that only ever says
                             no, and Upload beside it is the whole answer. -->
                            <button
                                v-if="canTakePhoto"
                                type="button"
                                :title="liveOnDesktop ? 'Capture photo' : 'Open camera'"
                                class="tw:flex tw:h-16 tw:w-16 tw:items-center tw:justify-center tw:rounded-full tw:border-4 tw:p-1 tw:transition-all active:tw:scale-95"
                                :class="
                                    liveOnDesktop
                                        ? 'tw:border-primary'
                                        : 'tw:border-white/30 tw:lg:border-slate-200 hover:tw:border-primary/50'
                                "
                                @click="liveOnDesktop ? cameraRef?.takeShot() : startCamera()"
                            >
                                <span
                                    class="tw:flex tw:h-full tw:w-full tw:items-center tw:justify-center tw:rounded-full tw:transition-colors"
                                    :class="
                                        liveOnDesktop
                                            ? 'tw:bg-primary tw:text-white'
                                            : 'tw:bg-white/15 tw:text-white tw:lg:bg-primary/10 tw:lg:text-primary'
                                    "
                                >
                                    <CameraIcon class="tw:h-6 tw:w-6" />
                                </span>
                            </button>

                            <button
                                type="button"
                                title="Clear image"
                                :disabled="mode === 'empty'"
                                class="tw:group tw:flex tw:flex-col tw:items-center tw:gap-1.5 tw:text-white/70 tw:transition-colors tw:lg:text-slate-500 hover:tw:text-red-500 disabled:tw:opacity-30 disabled:hover:tw:text-white/70"
                                @click="clearImage"
                            >
                                <span
                                    class="tw:flex tw:h-11 tw:w-11 tw:items-center tw:justify-center tw:rounded-full tw:bg-white/10 tw:transition-colors tw:lg:bg-slate-100 group-hover:tw:bg-red-50"
                                >
                                    <Trash2 class="tw:h-5 tw:w-5" />
                                </span>
                                <span class="tw:text-[10px] tw:font-semibold">Clear</span>
                            </button>
                        </div>
                    </div>

                    <!-- ── Controls sidebar ── -->
                    <!--
                    On a phone the Run button is ordered ABOVE the model pickers (order-first), so
                    the screen reads stage -> run, the way the mockup does: picking a model is a
                    once-a-session decision, running is every-image. Ordered, not duplicated - two
                    Run buttons would be two things to keep in sync.
                -->
                    <div
                        class="tw:order-3 tw:hidden tw:w-full tw:shrink-0 tw:flex-col tw:gap-4 tw:overflow-y-auto tw:bg-white tw:p-5 tw:md:p-6 tw:lg:order-none tw:lg:flex tw:lg:w-[400px] tw:lg:bg-slate-50/60"
                        style="min-height: 0"
                    >
                        <!-- Model -->
                        <!-- Desktop only: on a phone these live in the settings sheet, opened from
                         the image view, so the screen under the image stays one decision deep. -->
                        <div
                            class="tw:order-2 tw:hidden tw:flex-col tw:gap-3 tw:lg:order-1 tw:lg:flex"
                        >
                            <span
                                class="tw:text-[10px] tw:font-bold tw:tracking-[0.12em] tw:text-slate-400 tw:uppercase"
                            >
                                Model
                            </span>
                            <McDetectionModelPicker
                                v-model:primary="selectedModel"
                                v-model:segment="selectedSegmentModel"
                                :primary-options="primaryModelOptions"
                                :segment-options="segmentModelOptions"
                                :primary-spec="selectedModelSpec"
                                :segment-spec="selectedSegmentSpec"
                                :can-chain="canChain"
                                :disabled="isAnalyzing"
                            />
                        </div>

                        <!--
                        On a phone this button and the Upload/Camera/Clear row are the same slot,
                        swapped: with no image the row is the whole job (get one), and with an image
                        staged the only thing left to do is run it, so a disabled button captioned
                        "select an image" is just the row saying the same thing twice.

                        Hidden again once results are on screen - re-running the same image is not
                        the next thing anyone wants, and the back button above the image is the way
                        on to the next slide.

                        Desktop keeps it throughout: there the controls column is a workbench for
                        comparing models on one image, and the slot is not shared.

                        `currentFile`, not just `mode`, because a record loaded out of history is a
                        preview with no file behind it - there is nothing to re-run, so the control
                        would only ever be a dead button.
                    -->
                        <Teleport
                            to="#detection-run-slot"
                            :disabled="
                                !isCompact || !currentFile || mode !== 'preview' || hasResults
                            "
                        >
                            <div
                                class="tw:order-1 tw:flex-col tw:gap-3 tw:lg:order-2 tw:lg:flex"
                                :class="
                                    hasResults || mode === 'empty' || !currentFile
                                        ? 'tw:hidden'
                                        : 'tw:flex'
                                "
                            >
                                <McButton
                                    class="tw:w-full tw:gap-2 tw:py-5 tw:text-sm tw:font-bold tw:shadow-md tw:shadow-primary/20 tw:transition-all hover:tw:shadow-lg hover:tw:shadow-primary/25 disabled:tw:shadow-none tw:lg:py-2"
                                    :disabled="!currentFile || !selectedModel || isAnalyzing"
                                    @click="runDetection"
                                >
                                    <Loader2
                                        v-if="isAnalyzing"
                                        class="tw:w-4 tw:h-4 tw:animate-spin"
                                    />
                                    <ScanSearch v-else class="tw:w-4 tw:h-4" />
                                    {{ isAnalyzing ? 'Analyzing…' : 'Image Detection' }}
                                </McButton>
                                <p
                                    class="tw:text-[10px] tw:text-slate-400 tw:text-center tw:leading-relaxed"
                                >
                                    {{
                                        currentFile
                                            ? 'Image ready for analysis'
                                            : 'Select an image to continue'
                                    }}
                                </p>
                            </div>
                        </Teleport>

                        <!-- Display filters (only meaningful once boxes are drawn).

                         White on a phone, where this column carries nothing else and butts straight
                         up against the white results sheet above it - the old slate tint read as a
                         seam between them rather than as a section. Desktop keeps the tint: there
                         the column is a workbench standing apart from the viewer beside it. -->
                        <div
                            v-if="hasResults && hasFilterableBoxes"
                            class="tw:order-3 tw:flex tw:flex-col tw:gap-2 tw:border-t tw:border-slate-200 tw:pt-4"
                        >
                            <span
                                class="tw:text-[10px] tw:font-bold tw:text-slate-400 tw:uppercase tw:tracking-[0.12em]"
                            >
                                Display
                            </span>
                            <McDetectionFilters />
                        </div>
                    </div>
                </div>

                <!-- Detection summary -->
                <Transition
                    enter-active-class="tw:transition-all tw:duration-500 tw:ease-out"
                    enter-from-class="tw:opacity-0 tw:translate-y-4"
                    enter-to-class="tw:opacity-100 tw:translate-y-0"
                >
                    <div
                        v-if="hasResults"
                        class="tw:relative tw:z-20 tw:order-2 tw:-mt-5 tw:grid tw:grid-cols-1 tw:items-stretch tw:gap-4 tw:rounded-t-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-4 tw:pt-2 tw:lg:order-none tw:lg:mt-4 tw:lg:grid-cols-5 tw:lg:rounded-none tw:lg:border-0 tw:lg:bg-transparent tw:lg:p-0"
                    >
                        <!--
                        The sheet's handle, phone only. A tap toggle rather than a drag: the two
                        positions are the only ones worth having (read everything / look at the
                        slide), and a drag would put every height in between within reach of a thumb
                        that only wanted one of the two.

                        min-h-11 is the 44px target the pill itself is far too thin to offer - the
                        whole strip is the grip, and the pill is only what draws it.
                    -->
                        <!--
                            The sheet's header row, phone only. The chevron sits where the grab
                            handle used to, centred; the mode control keeps the right.
                        -->
                        <div
                            v-if="isCompact"
                            class="tw:relative tw:-mt-1 tw:mb-1 tw:flex tw:min-h-11 tw:items-center tw:justify-end tw:lg:hidden"
                        >
                            <!--
                                Scrolls to the rest of the sheet, and back up once you are there.
                                The direction is the state: pointing down while the summary is below
                                the fold, up once it is not, so the icon always names where the tap
                                goes rather than sitting as decoration.
                            -->
                            <button
                                type="button"
                                class="tw:absolute tw:left-1/2 tw:flex tw:size-11 tw:-translate-x-1/2 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:text-slate-400 tw:transition-colors active:tw:scale-95 hover:tw:bg-slate-100 hover:tw:text-slate-600"
                                :aria-label="
                                    moreBelow ? 'Scroll down to the rest' : 'Scroll back to the top'
                                "
                                @click="moreBelow ? scrollDown() : scrollTop()"
                            >
                                <!-- Not animated: the fade at the fold is what says there is more,
                                     and a bouncing icon at the TOP of the sheet points the eye at
                                     the wrong end of it. -->
                                <component
                                    :is="moreBelow ? ChevronDown : ChevronUp"
                                    class="tw:size-5"
                                />
                            </button>
                        </div>

                        <!--
                            The filters, phone only, ABOVE the findings rather than instead of them.
                            Turning a threshold is a question about the results ("which of these
                            survive?"), so hiding the results to ask it removes half the answer.

                            Display only. The model choice is not a display setting: it decides what
                            is run, not what is shown of a run already finished, and putting it here
                            would offer a change this screen cannot apply without re-running.
                        -->
                        <div
                            v-if="isCompact && hasFilterableBoxes"
                            class="tw:flex tw:flex-col tw:gap-2 tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-slate-50/70 tw:p-3 tw:lg:hidden"
                        >
                            <span
                                class="tw:text-[10px] tw:font-bold tw:tracking-[0.12em] tw:text-slate-400 tw:uppercase"
                            >
                                Display
                            </span>
                            <McDetectionFilters />
                        </div>

                        <div
                            class="tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-3 tw:lg:col-span-2 tw:lg:p-5 tw:xl:p-6"
                        >
                            <div
                                class="tw:mb-2 tw:flex tw:items-center tw:justify-between tw:lg:mb-4"
                            >
                                <div class="tw:flex tw:items-center tw:gap-2">
                                    <span
                                        class="tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary/10 tw:text-primary tw:lg:size-7"
                                    >
                                        <Target class="tw:size-4" />
                                    </span>
                                    <h2 class="tw:text-sm tw:font-bold tw:text-slate-700">
                                        Detection Results
                                    </h2>
                                </div>
                                <span
                                    class="tw:text-[10px] tw:font-semibold tw:text-slate-400 tw:uppercase tw:tracking-widest tw:bg-slate-100 tw:px-2 tw:py-0.5 tw:rounded-full"
                                >
                                    {{ classSteps.length }} class{{
                                        classSteps.length === 1 ? '' : 'es'
                                    }}
                                    found
                                </span>
                            </div>

                            <div v-if="classSteps.length" class="tw:flex tw:flex-col tw:gap-2">
                                <McConfidenceBar
                                    v-for="step in classSteps"
                                    :key="step.id"
                                    :label="step.predicted_class"
                                    :confidence="step.confidence"
                                />
                            </div>
                            <p v-else class="tw:text-sm tw:text-slate-400 tw:italic">
                                No classes were detected in this image.
                            </p>
                        </div>

                        <div
                            v-if="detectStep"
                            class="tw:lg:col-span-3 tw:bg-white tw:rounded-2xl tw:border tw:border-slate-200 tw:p-5 tw:md:p-6 tw:lg:block"
                        >
                            <div class="tw:flex tw:items-center tw:gap-2 tw:mb-3">
                                <span
                                    class="tw:flex tw:items-center tw:justify-center tw:w-7 tw:h-7 tw:rounded-lg tw:bg-primary/10 tw:text-primary"
                                >
                                    <Sparkles class="tw:w-4 tw:h-4" />
                                </span>
                                <h2 class="tw:text-sm tw:font-bold tw:text-slate-700">
                                    AI Analysis Summary
                                </h2>
                            </div>

                            <div
                                class="tw:relative tw:bg-linear-to-br tw:from-primary/5 tw:to-primary/3 tw:border tw:border-primary/15 tw:rounded-xl tw:p-5 tw:overflow-hidden"
                            >
                                <span
                                    class="tw:absolute tw:top-2 tw:right-4 tw:text-5xl tw:font-black tw:text-primary/8 tw:select-none tw:leading-none"
                                >
                                    "
                                </span>
                                <!-- One paragraph for every role: the copy guides the reader to the
                                     morphology instead of announcing a class, and `buildSummary`
                                     decides what staff additionally get.

                                     `v-text` rather than an interpolated child on purpose. The
                                     segments carry their own spacing and punctuation (". These
                                     fungal…"), so any whitespace Vue keeps around one shows up as
                                     "Clue cell , which it" — the bug the old markup had. A child
                                     would be indented onto its own line by Prettier and condense
                                     back to a leading/trailing space; an element with no children
                                     gives it nothing to reflow. -->
                                <p
                                    class="tw:text-sm tw:text-slate-600 tw:leading-relaxed tw:relative"
                                >
                                    <span
                                        v-for="(seg, i) in summarySegments"
                                        :key="i"
                                        :class="
                                            seg.bold ? 'tw:font-bold tw:text-primary' : undefined
                                        "
                                        v-text="seg.text"
                                    />
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
            </McDetectionFilterScope>

            <!-- Past runs (BE-ADR-024). Outside the results Transition on purpose: history is
                 there to be picked from before anything has been analysed, which is the whole
                 point of it on a fresh page load.

                 v-if rather than a `lg:` class, so exactly ONE McDetectionHistory exists at a
                 time - this one or the phone's sheet below. Two would race for `ref="history"`
                 and double every thumbnail request the panel makes on mount. -->
            <div v-if="!isCompact" class="tw:mt-4">
                <McDetectionHistory
                    ref="history"
                    :active-id="activeRecordId"
                    @select="loadFromHistory"
                />
            </div>
        </div>

        <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="tw:hidden"
            @change="onFileChange"
        />

        <!--
            The fold, made visible. Phone only, and only while there is something below it.

            A card cut off by a hard screen edge reads as the end of the page; one fading out reads
            as continuing, which is the whole signal. Purely a signal - the chevron in the sheet
            header is what acts - so it is pointer-events-none and can never swallow a tap meant for
            the card underneath it.
        -->
        <div
            v-if="isCompact && hasResults && moreBelow"
            aria-hidden="true"
            class="tw:pointer-events-none tw:fixed tw:inset-x-0 tw:bottom-0 tw:z-20 tw:h-14 tw:bg-linear-to-t tw:from-white tw:to-transparent tw:lg:hidden"
        ></div>

        <!-- Bottom sheet, phone only: it rises from the thumb and leaves the image visible above
             it, so a model is chosen against the slide it will run on. -->
        <McSheet v-model:open="modelSettingsOpen">
            <McSheetContent side="bottom" class="tw:lg:hidden">
                <McSheetHeader>
                    <McSheetTitle>Model</McSheetTitle>
                    <McSheetDescription>
                        Which models run when you tap Image Detection.
                    </McSheetDescription>
                </McSheetHeader>

                <div class="tw:px-4 tw:pb-6">
                    <McDetectionModelPicker
                        v-model:primary="selectedModel"
                        v-model:segment="selectedSegmentModel"
                        :primary-options="primaryModelOptions"
                        :segment-options="segmentModelOptions"
                        :primary-spec="selectedModelSpec"
                        :segment-spec="selectedSegmentSpec"
                        :can-chain="canChain"
                        :disabled="isAnalyzing"
                    />
                </div>
            </McSheetContent>
        </McSheet>

        <!-- The same panel the desktop page carries at its foot, reached by a button here instead.
             Taller than the model sheet because it is a list being browsed rather than two
             dropdowns being set, and it closes on a pick: the record it loads is behind the sheet,
             so leaving it open would hide the thing the tap asked for. -->
        <McSheet v-if="isCompact" v-model:open="historyOpen">
            <McSheetContent side="bottom" class="tw:max-h-[85dvh] tw:overflow-y-auto tw:lg:hidden">
                <!-- Present for the dialog's accessible name, not shown: the panel below carries
                     its own "Recent analyses" heading, and rendering both put the same words on
                     screen twice with the sheet's copy adding nothing the list does not say. -->
                <McSheetHeader class="tw:sr-only">
                    <McSheetTitle>Recent analyses</McSheetTitle>
                    <McSheetDescription>
                        Past runs. Pick one to load it back into the viewer.
                    </McSheetDescription>
                </McSheetHeader>

                <div class="tw:px-4 tw:pt-4 tw:pb-6">
                    <McDetectionHistory
                        ref="history"
                        :active-id="activeRecordId"
                        @select="
                            (record) => {
                                historyOpen = false
                                loadFromHistory(record)
                            }
                        "
                    />
                </div>
            </McSheetContent>
        </McSheet>

        <!-- The handoff to the phone's own camera app, for devices where our capture screen cannot
             run (an insecure origin, or no getUserMedia). `capture` is a touch-device hint that
             desktop browsers parse and ignore, which is why this is a second fixed input rather
             than an attribute toggled on the one above. -->
        <input
            ref="osCameraInput"
            type="file"
            accept="image/*"
            capture="environment"
            class="tw:hidden"
            @change="onFileChange"
        />
    </div>
</template>
