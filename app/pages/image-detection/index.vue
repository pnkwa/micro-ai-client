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
import { useBlockingExam } from '~/core/composables/blockingExam'
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
    reason: aiUnavailableReason,
    message: aiUnavailableMessage,
    refresh: refreshAvailability,
} = useDetectionAvailability()

/**
 * Which exam, so the way out of this screen is the exam itself rather than the class list it is
 * somewhere inside. Shared with the home page's notice - see `~/core/composables/blockingExam`.
 *
 * Bound BEFORE the top-level await below and fetched after it, in a hook. `useState` needs the Nuxt
 * app context and this page loses it at that await, so calling the composable further down silently
 * took the whole page with it - not just the button, the wall it belongs to. Lifecycle hooks are fine
 * either side of it, which is why the request itself can wait.
 */
const {
    exam: blockingExam,
    path: blockingExamPath,
    refresh: refreshBlockingExam,
} = useBlockingExam()

// FORCED, unlike the sidebar's throttled checks. This page is the door: entering on a cached
// "available" from moments ago would render the tool to a student whose exam opened in the
// meantime, and they would only find out after uploading. The sidebar can afford to be briefly
// stale because it is decoration; this cannot.
await refreshAvailability({ force: true })

// Not awaited: naming the exam sharpens the message, it does not gate it. The wall renders on the
// availability answer alone, and the button appears when there is somewhere for it to go.
onMounted(() => {
    if (!aiAvailable.value && aiUnavailableReason.value === 'exam_open') void refreshBlockingExam()
})

const router = useRouter()

/**
 * No breadcrumb on this page.
 *
 * It read "Image Detection", which is the one thing the app bar here does not need to say: the bar
 * already carries Retake, history and the run action, and on a 393px phone the trail was truncating
 * to "Image D…" to make room for them. Desktop loses nothing either - the page's own h1 says it.
 */
const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([])

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

/**
 * The manifest's `displayName` separates the architecture from what it does with an em dash
 * ("RT-DETR-L — 5-class detector"). Split into the name and a parenthesised descriptor, because they
 * are not two peers: the name is what you are choosing between, the rest tells you what it does.
 * A middle dot was tried first and read as two equal halves of one long label.
 *
 * Done here rather than asked of the server: this is how the name is *rendered*, and the manifest is
 * another repo's payload. Only the separator is touched - a name carrying its own dashes
 * ("RT-DETR-L") keeps them, which is why this cannot be a blanket replace of every dash.
 */
const modelParts = (spec: ModelSpec): [name: string, descriptor?: string] => {
    const [name = spec.displayName, ...rest] = spec.displayName.split(/\s+—\s+/)
    // Rejoined rather than taking rest[0]: a name with two separators keeps everything after the
    // first inside the brackets instead of quietly losing the tail.
    return [name, rest.join(' — ') || undefined]
}

const modelLabel = (spec: ModelSpec) => {
    const [name, descriptor] = modelParts(spec)
    return descriptor ? `${name} (${descriptor})` : name
}

const primaryModelOptions = computed(() =>
    models.value
        .filter((m) => m.task === 'classify' || m.task === 'detect')
        .map((m) => ({ value: m.name, label: modelLabel(m) })),
)
const segmentModelOptions = computed(() => [
    { value: NONE_SEGMENT, label: 'None (skip segmentation)' },
    ...models.value
        .filter((m) => m.task === 'segment')
        .map((m) => ({ value: m.name, label: modelLabel(m) })),
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

/**
 * The model behind the result on screen, named for a reader.
 *
 * Falls back to the raw name: a record loaded out of history can cite a model the manifest no
 * longer lists, and "best__rtdetr_v2" attributes the result correctly where a blank would not.
 * The segmentation pass is named as a chained addition rather than a second model, because that
 * is what it is (ML-ADR-003) - the result payload carries one model plus the steps that ran.
 */
const resultModelLabel = computed(() => {
    if (!resultModel.value) return ''
    const spec = resultModelSpec.value
    if (!spec) {
        return segmentStep.value ? `${resultModel.value} + segmentation` : resultModel.value
    }

    // Inside the brackets with the descriptor, not appended after them: what ran is one description
    // of one run ("5-class detector + segmentation"), and hanging the chained pass outside the
    // brackets read as a third thing after the name and the parenthetical.
    const [name, descriptor] = modelParts(spec)
    const ran = [descriptor, segmentStep.value ? 'segmentation' : null].filter(Boolean).join(' + ')
    return ran ? `${name} (${ran})` : name
})

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
 * Desktop: is the model form showing while a result is already up?
 *
 * The column gives itself to the result once there is one, which would otherwise strand the one
 * thing this page is for - running the same slide through a second model and comparing. This is
 * the way back, and it closes on the next run, since the form has been spent again.
 */
const showModelPanel = ref(false)
const modelPanel = useTemplateRef<HTMLElement>('modelPanel')

/**
 * The button that opens the form sits at the FOOT of a scrolling column and the form appears at its
 * head, so revealing it without scrolling leaves the click looking like it did nothing. Scroll it
 * into view once it exists.
 */
const openModelPanel = async () => {
    showModelPanel.value = true
    await nextTick()
    modelPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

/**
 * Past runs, in a sheet of their own on a phone.
 *
 * The panel is appended to the bottom of the page on desktop, which is unreachable here: below lg
 * this page is a fixed-height scanner that does not scroll until results exist, so a panel down
 * there would be invisible in precisely the state - nothing staged yet - that history is for.
 */
const historyOpen = ref(false)

/**
 * How many past runs there are, for the badge on the History button.
 *
 * Counted here rather than read off McDetectionHistory: that component only exists while the sheet
 * is open, so a count taken from it would be unknown on the screen where the badge has to do its
 * job - the one you land on, before anything has been opened.
 *
 * `countMine` asks for one row and reads the `total` beside it (BE-ADR-026). This used to download
 * the entire history - every step and every polygon of every run - and take its `.length`, which is
 * a lot of network for a number that is at most three characters wide.
 */
const historyCount = ref(0)

const refreshHistoryCount = async () => {
    try {
        historyCount.value = await detectionService.countMine()
    } catch {
        // A badge is a hint, not a fact anyone acts on. A failure here leaves it off rather than
        // putting an error in front of someone who did not ask for this list.
    }
}

/**
 * Below lg this page is a scanner, not a document: it opens straight into the camera, the staged
 * image replaces it, and the results scroll under a pinned image. Above lg it stays the two-column
 * workbench, where a viewfinder that hijacked the screen would be the wrong thing entirely.
 */
const isCompact = useMediaQuery('(max-width: 1023px)')

/**
 * Is a photo staged on a phone? That is when the app bar carries this page's own actions.
 *
 * A row of its own under the bar was tried and read as a second header while costing 48px of the
 * picture. The bar has the room - 79% occupancy at 393px with all three items - so they go in it.
 */
const barActionsShown = computed(
    () => isCompact.value && mode.value === 'preview' && !hasResults.value,
)

/**
 * Is there a photo on screen at all on a phone - staged OR analysed?
 *
 * Both of those screens put a back-style action in the bar's leading slot, and that is what decides
 * whether the sidebar toggle can stay: `‹ Back ☰` side by side is the interleaving that moving these
 * controls into the bar was meant to end. Navigation is one step away in either case - back, then
 * Retake - and the camera and the empty chooser, which are the flow's root, both keep the toggle.
 */
const pageOwnsBar = computed(() => isCompact.value && mode.value === 'preview')

/** The run button joins history in the bar's trailing group; on desktop it stays in the column. */
const runButtonTarget = computed(() =>
    barActionsShown.value ? '#mc-header-actions' : '#detection-run-slot',
)

/** In the bar it is a bar button - tinted text, no fill - not a pill dropped into the chrome. */
const runInHeader = computed(() => barActionsShown.value)

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

/**
 * Hold the document still only where the screen genuinely fits: the camera and the empty chooser.
 *
 * NOT over a staged image. That screen is the picture plus a zoom scrubber, the run button and two
 * model selects, which is taller than a short viewport - and a locked page there strands the last
 * control off the bottom with no way to reach it.
 */
const scrollLocked = computed(
    () => isCompact.value && aiAvailable.value && !hasResults.value && mode.value !== 'preview',
)

const SCROLL_LOCK_CLASS = 'mc-scroll-lock'
const HIDE_TRIGGER_CLASS = 'mc-hide-sidebar-trigger'
const FULL_BLEED_CLASS = 'mc-full-bleed'

// Set once for the page's lifetime, not per state: everything below lg here is a full-screen
// surface - camera, staged image, results - and the CSS carries the breakpoint, so there is no
// state left for JS to track. See `.mc-full-bleed` in main.css.
onMounted(() => document.documentElement.classList.add(FULL_BLEED_CLASS))

// An effect, not derived state: this writes to the document, which no computed should do.
watchEffect(() => {
    document.documentElement.classList.toggle(SCROLL_LOCK_CLASS, scrollLocked.value)
    // While this page's own actions are in the app bar, the sidebar toggle is not: shell navigation
    // sitting between Retake and Start detection reads as one row of unrelated controls.
    document.documentElement.classList.toggle(HIDE_TRIGGER_CLASS, pageOwnsBar.value)
})

// Navigating away must lift all three, or another page inherits an unscrollable document, no way to
// open the sidebar, and a container that has lost its gutters.
onBeforeUnmount(() => {
    document.documentElement.classList.remove(
        SCROLL_LOCK_CLASS,
        HIDE_TRIGGER_CLASS,
        FULL_BLEED_CLASS,
    )
})

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

onMounted(() => {
    refreshHistoryCount()
    nextTick(() => {
        if (!isCompact.value || mode.value !== 'empty' || !canUseInAppCamera.value) return
        cameraAutoStarted.value = true
        startCamera()
    })
})

/** Back out of a staged image to where it came from: the camera, on a phone. */
const backToCapture = () => {
    clearImage()
    if (isCompact.value && canUseInAppCamera.value) startCamera()
}

/**
 * Back out of a finished result onto the staged image it came from.
 *
 * The one step the phone flow was missing. A result took the whole screen with no way out of it: the
 * bar had history and nothing else, so changing the model or taking another photo meant reloading
 * the page. The staged screen is where both of those live, which makes it the right place to land -
 * one back button rather than a Retake and a Change model crowded into the results bar.
 *
 * The photo stays. `currentFile` survives a run (and is now filled in from history too), so Start
 * detection is live the moment you get there and a second opinion is two taps: back, pick, run.
 *
 * Scrolled to the top on the way: the results page is taller than the screen, and arriving at the
 * staged screen halfway down it would show the model rows with the picture off the top.
 */
const backToStaged = () => {
    hasResults.value = false
    detectionSteps.value = []
    window.scrollTo({ top: 0 })
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

/**
 * The 1:1 cropper standing in for the staged preview on a phone.
 *
 * Only mounted there, so every read is optional: desktop submits the file exactly as it arrived.
 */
const cropper = useTemplateRef<{
    toBlob: (source: File | Blob, fileName: string) => Promise<File | Blob>
}>('cropper')

const runDetection = async () => {
    if (!currentFile.value || !selectedModel.value) return
    // The form has done its job; the column goes back to showing the answer.
    showModelPanel.value = false
    isAnalyzing.value = true
    hasResults.value = false
    detectionSteps.value = []
    try {
        const segmentModel = !canChain.value
            ? undefined
            : selectedSegmentModel.value === NONE_SEGMENT
              ? null
              : selectedSegmentModel.value
        // What was framed, not what was picked. Hands back the original bytes when the cropper
        // was never touched, so an untouched photo is not re-encoded on its way to the worker.
        const submitted =
            (await cropper.value?.toBlob(currentFile.value, 'detection.jpg')) ?? currentFile.value

        // The viewer has to show the image the boxes were measured against. Box coordinates come
        // back normalised to what was SENT, so leaving the uncropped original on screen would draw
        // every one of them in the wrong place - and quietly, since they would still look plausible.
        if (submitted !== currentFile.value) {
            if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
            imageUrl.value = URL.createObjectURL(submitted)
            currentFile.value = submitted
        }

        const result = await detectionService.run(
            submitted,
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
        refreshHistoryCount()
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
        // The bytes as well as the URL, so an old run is a re-runnable image and not just a picture:
        // backing out of these results lands on the staged screen, where Start detection has to have
        // something to send. Read back from the object URL rather than re-fetched - that is a read
        // from memory, and the alternative is asking the server for an image we are already holding.
        currentFile.value = await fetch(blobUrl).then((r) => r.blob())
    } catch {
        toast.error('Could not load that image.')
        return
    }
    detectionSteps.value = record.steps
    resultModel.value = record.model
    hasResults.value = record.steps.length > 0
    // How the image got here in the first place, so a re-run is recorded as what it is rather than
    // defaulting to 'upload'. A submission's image is neither of the two this page can send.
    currentSource.value = record.source === 'submission' ? 'upload' : record.source
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
                <!-- Named, when it can be: "an exam" is a thing to go and look for, and the student
                     who is reading this is the one who did not know where. -->
                <p v-if="blockingExam" class="tw:text-sm tw:font-semibold tw:text-navy-90">
                    {{ blockingExam.name }}
                </p>
            </div>

            <!--
                The exam is the primary action, not Back: the reason the tool is withheld is an exam
                the student has not submitted, so the thing they actually need is the way to it. Back
                only returns them to where they already were. Falls back to the class list when the
                exam cannot be named - one level of hunting rather than none, but never a dead end.
            -->
            <div class="tw:flex tw:flex-wrap tw:justify-center tw:gap-2">
                <McButton variant="outline" size="sm" @click="router.push('/')">Back</McButton>
                <McButton v-if="blockingExamPath" size="sm" @click="router.push(blockingExamPath)">
                    Go to exam
                </McButton>
                <McButton v-else size="sm" @click="router.push('/classes')">
                    Go to my classes
                </McButton>
            </div>
        </div>
    </div>

    <div v-else class="tw:flex tw:flex-col tw:lg:min-h-[calc(100vh-80px)] tw:lg:space-y-5">
        <!-- The min-height and the section spacing above are desktop shapes, hence the lg: gates:
             on a phone the stage sizes itself to the viewport and both push the page past it. The
             spacing also lands a 20px margin on the fixed scroll hint below - margins apply to
             fixed boxes - holding it off the bottom edge it is supposed to sit on. -->
        <!-- Desktop only: this block cost the stage ~90px of the screen it is the whole point of. On
             a phone nothing names the page, which is right for a camera screen - the bar's own items
             are what you came to press. -->
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
            :class="
                hasResults
                    ? 'tw:h-full'
                    : mode === 'preview'
                      ? // A MINIMUM, not a height. The staged screen (picture, zoom, models, button)
                        // is taller than the viewport on a short phone, and as a fixed height this
                        // clipped the black: the button row hung below the wrapper and sat on the
                        // page's own pale background. The camera and the chooser keep the fixed
                        // height, because those must fill the screen exactly and never scroll.
                        'tw:min-h-[calc(100dvh-3rem)]'
                      : 'tw:h-[calc(100dvh-3rem)]'
            "
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
                    <!--
                        `flex-1` + `overflow-hidden` are for the camera, where the viewfinder fills a
                        screen that must not scroll. A staged image is taller than that on a short
                        viewport, and as a flex child the stage was being COMPRESSED to fit - the
                        cropper kept its natural size and overflowed, so the run button below moved up
                        into the zoom scrubber. In the staged state the column stops constraining and
                        the page scrolls instead, which is the honest answer when content is taller
                        than the screen.
                    -->
                    <div
                        class="tw:sticky tw:top-12 tw:z-10 tw:order-1 tw:flex tw:flex-col tw:bg-black tw:p-0 tw:lg:static tw:lg:order-none tw:lg:flex-1 tw:lg:overflow-hidden tw:lg:bg-transparent tw:lg:p-5 tw:xl:p-6"
                        :class="
                            mode === 'preview' && !hasResults
                                ? 'tw:min-h-[calc(100dvh-3rem)] tw:lg:min-h-0'
                                : 'tw:flex-1 tw:overflow-hidden'
                        "
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
                        <!--
                            my-auto on a staged phone screen: the spare height splits above and below
                            the picture instead of piling into one gap. A single spacer before the
                            controls put every spare pixel in one place - on a 932pt screen that was a
                            350px void between the zoom row and the model list, which reads as a hole
                            rather than as space. Auto margins collapse to nothing on a short screen,
                            so the layout there is unchanged.
                        -->
                        <div
                            class="tw:relative tw:w-full tw:overflow-hidden tw:rounded-none tw:bg-black tw:transition-[height] tw:duration-300 tw:lg:h-auto tw:lg:flex-1 tw:lg:rounded-md tw:lg:bg-linear-to-br tw:lg:from-slate-100 tw:lg:to-slate-50 tw:lg:ring-1 tw:lg:ring-slate-200/80"
                            :class="[
                                hasResults
                                    ? 'tw:h-auto'
                                    : mode === 'empty' && !cameraOpen
                                      ? 'tw:h-[calc(100dvh-3rem-9rem)]'
                                      : mode === 'preview'
                                        ? 'tw:h-auto'
                                        : 'tw:h-[calc(100dvh-3rem)]',
                                // Flex items shrink by default. When the staged screen is taller than
                                // the column, that compressed the stage and the cropper's own
                                // contents spilled past its box - the zoom scrubber ended up
                                // overlapping the block below it by 11px on a 700pt screen. Nothing
                                // here may be squeezed; the page scrolls instead.
                                isCompact && mode === 'preview' && !hasResults ? 'tw:shrink-0' : '',
                            ]"
                        >
                            <!--
                                One step back, in the app bar's leading slot rather than on the
                                picture - and worded, because a bare chevron beside a sidebar trigger
                                is two navigation-ish marks in a row and neither of these means "go
                                back a page".

                                Where it goes depends on where you are, because the flow has two
                                steps: from a finished result it returns to the staged photo (which is
                                where the model rows and Start detection are, so "change the model and
                                run it again" is back-pick-run); from the staged photo it goes on to
                                the camera. Two labels, one slot - a Retake and a Change model side by
                                side in the results bar would be two ways out of a screen that needs
                                one, and the second of them only leads to the first.

                                Its absence from the picture is what lets the frame start directly
                                under the bar: the cropper's old 56px top band existed only to keep
                                clear of this control and of history.

                                Phone only. Desktop never took the screen with a viewfinder, so there
                                is nothing to come back from - it keeps its own "Try another model"
                                button in the controls column - and during the camera the viewfinder
                                carries its own close button in-frame.
                            -->
                            <Teleport v-if="pageOwnsBar" to="#mc-header-lead">
                                <button
                                    type="button"
                                    class="tw:-ml-1 tw:mr-1 tw:flex tw:h-9 tw:cursor-pointer tw:items-center tw:gap-0.5 tw:rounded-lg tw:pr-2 tw:pl-1 tw:text-sm tw:font-semibold tw:text-primary tw:transition-colors hover:tw:bg-primary/10"
                                    @click="hasResults ? backToStaged() : backToCapture()"
                                >
                                    <ChevronLeft class="tw:size-5" />
                                    {{ hasResults ? 'Back' : 'Retake' }}
                                </button>
                            </Teleport>

                            <!-- Opposite the back button, stacked downwards as more of them apply.

                                 Always top-3, never nudged to clear the camera's own controls: the
                                 viewfinder reserves a band above itself (see McCameraCapture's
                                 mt-14) and its close/switch buttons live inside the square below
                                 that. Offsetting this stack by hand was the old fix and it broke -
                                 the square is positioned relative to the frame and this stack
                                 relative to the stage, so the gap between them changed with the
                                 viewport height and the two collided on shorter screens.

                                 Not hidden during the camera: it opens by itself on arrival, so
                                 hiding this would put history behind "close the camera first" in
                                 exactly the state it is most wanted. -->
                            <!--
                                History lives in the app bar, not on the picture: it is the one
                                control here that is not about THIS photo, so it belongs in the
                                chrome. On the stage it also shared a corner with the camera's own
                                switch-camera button, which took two goes to stop colliding.

                                Teleported rather than duplicated - one button, one badge count, and
                                the same one in every state including while the viewfinder is live.
                            -->
                            <Teleport to="#mc-header-actions">
                                <button
                                    type="button"
                                    class="tw:relative tw:flex tw:size-9 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:transition-colors tw:text-slate-500 hover:tw:bg-slate-100 hover:tw:text-slate-700"
                                    aria-label="Recent analyses"
                                    @click="historyOpen = true"
                                >
                                    <History class="tw:size-5" />
                                    <!-- Says the feature exists AND that it has something in it,
                                         which a bare icon does not. Hidden at zero: a badge reading
                                         "0" advertises an empty drawer. -->
                                    <span
                                        v-if="historyCount > 0"
                                        class="tw:absolute tw:-top-0.5 tw:-right-0.5 tw:flex tw:min-w-4 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary tw:px-1 tw:text-[10px] tw:font-bold tw:text-white tw:tabular-nums"
                                    >
                                        {{ historyCount > 99 ? '99+' : historyCount }}
                                    </span>
                                </button>
                            </Teleport>

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
                                <!-- `fill` on a phone only: there the viewer is a fixed band across
                                     the screen, and a capture small enough to sit at natural size
                                     reads as a stamp floating in black. Desktop has room, so it
                                     keeps 1:1 and stays sharp. -->
                                <McAnnotatedImage
                                    :src="imageUrl!"
                                    :fill="isCompact"
                                    :class="
                                        isCompact
                                            ? 'tw:relative tw:w-full'
                                            : 'tw:absolute tw:inset-0 tw:h-full tw:w-full'
                                    "
                                />
                            </template>

                            <!--
                            object-scale-down, not object-contain: contain scales a small image up
                            to fill, scale-down leaves it at natural size. McAnnotatedImage uses
                            scale-down because its box overlay is positioned against the drawn rect,
                            so the preview has to agree or an image smaller than the viewer jumps
                            size the moment results land.
                        -->
                            <template v-else-if="mode === 'preview'">
                                <div
                                    class="tw:flex tw:flex-col tw:justify-start"
                                    :class="isCompact ? 'tw:relative' : 'tw:absolute tw:inset-0'"
                                >
                                    <!-- Full width, and as tall as the image itself makes it: no
                                         forced height, so the box takes the shape of what is in it.
                                         A capture is cropped square and lands as a square the width
                                         of the screen - the size it was framed at; an upload keeps
                                         its own proportions instead of being letterboxed into a
                                         square it never had.

                                         Never object-cover: the whole file is what gets analysed, so
                                         a preview cropped to fill would show a frame that was never
                                         sent.

                                         Desktop keeps the box filling its column. -->
                                    <!-- Phone: the preview IS the cropper, so what is framed is what
                                         gets analysed. Desktop keeps the plain picture - the model
                                         column is the work there, and a mouse has no pinch. -->
                                    <McImageCropper
                                        v-if="isCompact"
                                        ref="cropper"
                                        :src="imageUrl!"
                                        :disabled="isAnalyzing"
                                        class="tw:shrink-0"
                                    />

                                    <div
                                        v-else
                                        class="tw:relative tw:w-full tw:shrink-0 tw:bg-black tw:lg:flex tw:lg:min-h-0 tw:lg:flex-1 tw:lg:items-center tw:lg:justify-center tw:lg:rounded-md"
                                    >
                                        <img
                                            :src="imageUrl!"
                                            alt="Microscope Image"
                                            class="tw:block tw:w-full tw:select-none tw:lg:h-full tw:lg:object-scale-down"
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
                                </div>
                            </template>
                        </div>

                        <!--
                            Phone only, and only over a staged image: the model choice, in normal
                            flow under the stage.

                            Sits above the button, as one control block at the foot of the screen:
                            title, the two rows, then the action - with a clear step between the rows
                            and the button. They are not peers: the rows are settings you read, the
                            button is the thing that acts on them, and a small gap made them look
                            like one list whose last item happened to be green. 40px is the step that
                            reads as "and then this".

                            The bottom padding is the safe-area inset with a 1rem floor rather than a
                            flat 24px: 24 put the button 3px under the fold on a 700pt screen, and on
                            a real iPhone the number that belongs there is the home indicator's, not
                            one of mine. Centring it in the band
                            between the zoom row and the button was tried - it put equal gaps either
                            side, which on a tall screen meant two voids and a button with nothing
                            near it. Grouped, the spare height is one gap and the block is one thing.

                            The pickers themselves rather than a chip that opens a sheet - a chip
                            named the model but cost a modal to change it, which is two taps and a
                            dialog for a dropdown.

                            Below the stage, NOT in the run slot with the button. That slot is
                            anchored to the stage's bottom edge and grows upward, so putting two
                            selects in it pushed the button up onto the picture.

                            `compact` drops the per-model description paragraphs: reference material
                            for the desktop workbench, and here ~100px of prose between the action
                            and the thing it runs.
                        -->
                        <!--
                            The spare height, two thirds of it above the control block.

                            All of it above pinned the button to the bottom edge with 16px under it,
                            which on a tall phone reads as the layout having run out of screen rather
                             than as a composition. Splitting it 2:1 with the spacer below keeps the
                            block low - where a thumb is - without it touching the edge.
                        -->
                        <div
                            v-if="isCompact && mode === 'preview' && !hasResults"
                            class="tw:grow-2 tw:lg:hidden"
                        ></div>

                        <McDetectionModelPicker
                            v-if="isCompact && mode === 'preview' && !hasResults"
                            v-model:primary="selectedModel"
                            v-model:segment="selectedSegmentModel"
                            :primary-options="primaryModelOptions"
                            :segment-options="segmentModelOptions"
                            :primary-spec="selectedModelSpec"
                            :segment-spec="selectedSegmentSpec"
                            :can-chain="canChain"
                            :disabled="isAnalyzing"
                            compact
                            class="tw:px-6 tw:lg:hidden"
                        />

                        <!--
                            Where the run button lands on a phone: last, and to the right - unless the
                            screen is too short for that, in which case it swaps with the model rows
                            and goes above them.

                            Below ~720pt it is not here at all: `runButtonTarget` sends it to the app
                            bar as a bar button instead. Reordering it within the page was tried both
                            ways - under the models it fell off the bottom, above the picture it took a
                            row from the thing being framed. The bar is the only place that costs no
                            content height, which is exactly what a short screen has none of.

                            A height media query rather than JS: it is a layout fact, it has to be
                            right on first paint, and measuring it in script would flash the wrong
                            arrangement first.

                            Last because it is what you press once the two decisions above it are
                            made - the picture is framed and the models are chosen - so reading top
                            to bottom ends on the action. Right because that is the near corner for a
                            thumb; centred, it sat equidistant from both edges and further from
                            either.

                            In normal flow, not floated over the stage. It used to be absolutely
                            positioned at the stage's bottom edge, and once the cropper put its zoom
                            scrubber at the foot of the picture the two claimed the same strip and
                            the button sat on top of the ticks.
                        -->
                        <!--
                            Kept in the DOM unconditionally - a Teleport whose target is behind a
                            v-if finds null and throws - but collapsed to nothing while it is empty.
                            Left laid out, its padding held a 40px black band under the image in the
                            results state, which is what pushed the sheet off the picture.
                        -->
                        <div
                            id="detection-run-slot"
                            class="tw:items-center tw:justify-end tw:px-6 tw:pt-10 tw:pb-[max(1rem,env(safe-area-inset-bottom))] tw:lg:hidden"
                            :class="
                                isCompact && currentFile && mode === 'preview' && !hasResults
                                    ? 'tw:flex'
                                    : 'tw:hidden'
                            "
                        ></div>

                        <!-- The other third: enough that the button is above the bottom edge rather
                             than against it. Collapses to nothing on a short screen, where there is
                             no slack to give and the safe-area padding is the whole margin. -->
                        <div
                            v-if="isCompact && mode === 'preview' && !hasResults"
                            class="tw:grow tw:lg:hidden"
                        ></div>

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
                    Desktop only (hidden until lg). A phone gets the inline compact picker under the
                    stage and its run button in the app bar, so this column has no mobile form left -
                    but the Run button inside it is still the SAME element, teleported, not a second
                    copy: two run buttons would be two things to keep in sync.
                -->
                    <div
                        class="tw:order-3 tw:hidden tw:w-full tw:shrink-0 tw:flex-col tw:gap-4 tw:overflow-y-auto tw:bg-white tw:p-5 tw:md:p-6 tw:lg:order-none tw:lg:flex tw:lg:w-[400px] tw:lg:bg-slate-50/60"
                        style="min-height: 0"
                    >
                        <!--
                            Where the finished result lands on desktop, teleported up from below
                            the image. Unconditional and empty until then: a Teleport whose target
                            is behind a v-if finds null and throws, taking its content with it.
                        -->
                        <div id="detection-results-slot" class="tw:contents"></div>

                        <!-- Model -->
                        <!-- Desktop only: on a phone these live in the settings sheet, opened from
                         the image view, so the screen under the image stays one decision deep.

                         Stands down once a result is on screen: the question has been asked and
                         answered, and the column is worth more showing the answer than a form
                         restating what already ran. `showModelPanel` brings it back for a second
                         opinion on the same image without clearing anything. -->
                        <div
                            v-if="!hasResults || showModelPanel"
                            ref="modelPanel"
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
                            :to="runButtonTarget"
                            :disabled="
                                !isCompact || !currentFile || mode !== 'preview' || hasResults
                            "
                        >
                            <div
                                class="tw:order-1 tw:flex-col tw:items-center tw:gap-2 tw:lg:order-2 tw:lg:gap-3"
                                :class="[
                                    hasResults || mode === 'empty' || !currentFile
                                        ? 'tw:hidden'
                                        : 'tw:flex',
                                    // Desktop kept it through every state; now it steps aside for
                                    // the result, and comes back with the model form.
                                    hasResults && !showModelPanel ? 'tw:lg:hidden' : 'tw:lg:flex',
                                ]"
                            >
                                <!--
                                    "Start detection", not "Image Detection". The page is already
                                    called Image Detection - repeating it on the button names where
                                    you are rather than what pressing it does, and a button that
                                    reads like a heading is one nobody is sure is a button. The
                                    in-flight label follows the same verb: "Detecting…".

                                    A rounded rectangle on a phone, a block button on desktop.

                                    Sized to its label rather than the screen: this sits over a black
                                    band under the picture, where a full-width bar reads as a form
                                    footer bolted to a camera. rounded-xl rather than a full pill -
                                    the model list beside it is an iOS grouped list with the same
                                    radius, and a lozenge next to squared cards reads as borrowed
                                    from somewhere else.

                                    h-13 (52px), set as a height rather than padding: McButton's own
                                    h-9 wins over any py-*, so padding alone left it at 36px - under
                                    the 44px minimum. Desktop keeps h-9, which is fine for a mouse.
                                -->
                                <McButton
                                    class="tw:gap-2 tw:transition-all tw:lg:h-9 tw:lg:w-full tw:lg:rounded-md tw:lg:bg-primary tw:lg:px-4 tw:lg:text-sm tw:lg:font-bold tw:lg:text-primary-foreground tw:lg:shadow-md"
                                    :class="
                                        runInHeader
                                            ? 'tw:h-9 tw:rounded-lg tw:bg-transparent tw:px-2 tw:text-sm tw:font-bold tw:text-primary tw:shadow-none hover:tw:bg-primary/15'
                                            : 'tw:h-13 tw:rounded-xl tw:px-7 tw:text-sm tw:font-bold tw:shadow-lg tw:shadow-primary/25 hover:tw:shadow-xl disabled:tw:shadow-none'
                                    "
                                    :disabled="!currentFile || !selectedModel || isAnalyzing"
                                    @click="runDetection"
                                >
                                    <Loader2
                                        v-if="isAnalyzing"
                                        class="tw:w-4 tw:h-4 tw:animate-spin"
                                    />
                                    <ScanSearch v-else class="tw:w-4 tw:h-4" />
                                    {{ isAnalyzing ? 'Detecting…' : 'Start detection' }}
                                </McButton>

                                <!-- Desktop only. There the button is one control in a column of
                                     them and the caption says which state it is in; on a phone the
                                     staged photo is right above it and saying "image ready" restates
                                     what the screen already shows. -->
                                <p
                                    class="tw:hidden tw:text-center tw:text-[10px] tw:leading-relaxed tw:text-slate-400 tw:lg:block"
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
                            class="tw:order-3 tw:flex tw:flex-col tw:gap-2 tw:lg:order-3"
                            :class="
                                !hasResults || showModelPanel
                                    ? 'tw:border-t tw:border-slate-200 tw:pt-4'
                                    : ''
                            "
                        >
                            <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
                                <span
                                    class="tw:text-[10px] tw:font-bold tw:text-slate-400 tw:uppercase tw:tracking-[0.12em]"
                                >
                                    Display
                                </span>
                                <!-- The model that produced what these controls filter, sharing the
                                     heading's line rather than taking one of its own. The row was
                                     otherwise half empty, and the styling - right-aligned, mixed
                                     case, lighter - already reads it as a caption on the panel
                                     rather than as another control in it. Same on the phone, where
                                     a line of its own would also spend the whole 28px of headroom
                                     left under the results card. -->
                                <span
                                    v-if="resultModelLabel"
                                    class="tw:truncate tw:text-[11px] tw:text-slate-400"
                                >
                                    {{ resultModelLabel }}
                                </span>
                            </div>
                            <McDetectionFilters />
                        </div>

                        <!-- Desktop only, and only over a finished result: the model form is not on
                             screen, so this is the way to a second opinion on the same image. Last
                             in the column because it is the least of what is offered here - the
                             result above it is the point. -->
                        <button
                            v-if="hasResults && !showModelPanel"
                            type="button"
                            class="tw:order-4 tw:hidden tw:cursor-pointer tw:lg:order-5 tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-slate-200 tw:bg-white tw:px-3 tw:py-2 tw:text-xs tw:font-semibold tw:text-slate-500 tw:transition-colors hover:tw:bg-slate-50 hover:tw:text-slate-700 tw:lg:flex"
                            @click="openModelPanel"
                        >
                            <Cpu class="tw:size-3.5" />
                            Try another model
                        </button>
                    </div>
                </div>

                <!-- Detection summary -->
                <!--
                    On desktop the finished result belongs where the question was asked: the
                    controls column, in place of the model form that is spent once a run has
                    happened. Teleported rather than duplicated - one copy of these cards, moved -
                    and Teleport relocates DOM without touching the component tree, so the filter
                    scope above still reaches McAnnotatedImage and McDetectionFilters.

                    A phone keeps them below the image as the sheet; there is no column to move to.
                -->
                <Teleport to="#detection-results-slot" :disabled="isCompact">
                    <Transition
                        enter-active-class="tw:transition-all tw:duration-500 tw:ease-out"
                        enter-from-class="tw:opacity-0 tw:translate-y-4"
                        enter-to-class="tw:opacity-100 tw:translate-y-0"
                    >
                        <div
                            v-if="hasResults"
                            class="tw:relative tw:z-20 tw:order-2 tw:flex tw:flex-col tw:items-stretch tw:gap-4 tw:rounded-t-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-4 tw:pt-2 tw:lg:order-4 tw:lg:mt-0 tw:lg:rounded-none tw:lg:border-0 tw:lg:bg-transparent tw:lg:p-0"
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
                            The sheet's header row, phone only: one centred control that says where
                            the rest of the sheet is.
                        -->
                            <div
                                v-if="isCompact"
                                class="tw:-mt-1 tw:mb-1 tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:lg:hidden"
                            >
                                <!--
                                Scrolls to the rest of the sheet, and back up once you are there.
                                The direction is the state: pointing down while the summary is below
                                the fold, up once it is not, so it always names where the tap goes
                                rather than sitting as decoration.

                                Worded, not a bare chevron. A lone arrow at the top of a panel is as
                                easily read as decoration or a drag handle as it is a button, and the
                                thing it does - move the page - is not what an arrow there implies.
                                The label also carries the accessible name, so there is one string
                                instead of an aria-label that can drift from what is on screen.
                            -->
                                <button
                                    type="button"
                                    class="tw:flex tw:min-h-11 tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-full tw:px-4 tw:text-xs tw:font-semibold tw:text-slate-400 tw:transition-colors active:tw:scale-95 hover:tw:bg-slate-100 hover:tw:text-slate-600"
                                    @click="moreBelow ? scrollDown() : scrollTop()"
                                >
                                    {{ moreBelow ? 'Show more' : 'Back to top' }}
                                    <!-- Not animated: the fade at the fold is what says there is more,
                                     and a bouncing icon at the TOP of the sheet points the eye at
                                     the wrong end of it. -->
                                    <component
                                        :is="moreBelow ? ChevronDown : ChevronUp"
                                        class="tw:size-4"
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
                                <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
                                    <span
                                        class="tw:text-[10px] tw:font-bold tw:tracking-[0.12em] tw:text-slate-400 tw:uppercase"
                                    >
                                        Display
                                    </span>
                                    <span
                                        v-if="resultModelLabel"
                                        class="tw:truncate tw:text-[11px] tw:text-slate-400"
                                    >
                                        {{ resultModelLabel }}
                                    </span>
                                </div>
                                <McDetectionFilters />
                            </div>

                            <div
                                class="tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-3 tw:lg:p-5"
                            >
                                <div
                                    class="tw:mb-2 tw:flex tw:items-center tw:justify-between tw:lg:mb-4"
                                >
                                    <div class="tw:flex tw:items-center tw:gap-2">
                                        <span
                                            class="tw:flex tw:size-6 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary/10 tw:text-primary tw:lg:size-7"
                                        >
                                            <Target class="tw:size-4" />
                                        </span>
                                        <h2 class="tw:text-sm tw:font-bold tw:text-slate-700">
                                            Detection Results
                                        </h2>
                                    </div>
                                    <span
                                        class="tw:shrink-0 tw:rounded-full tw:bg-slate-100 tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-semibold tw:tracking-widest tw:whitespace-nowrap tw:text-slate-400 tw:uppercase"
                                    >
                                        {{ classSteps.length }} class{{
                                            classSteps.length === 1 ? '' : 'es'
                                        }}
                                        found
                                    </span>
                                </div>

                                <!-- Which model actually produced what is on screen - `resultModel`,
                                 not the picker's current value, which the user is free to change
                                 after a run. Without it a result is unattributable: two models
                                 disagree on the same slide and nothing says which one is being
                                 read, and a record loaded out of history can have run on a model
                                 that is no longer even selected.

                                 The Display heading line carries this normally. It is here only as
                                 the fallback for a run with nothing to filter - a classifier, or a
                                 detector that found no boxes - where that whole section is absent
                                 and the attribution would vanish with it. -->
                                <p
                                    v-if="resultModelLabel && !hasFilterableBoxes"
                                    class="tw:-mt-1 tw:mb-2 tw:text-[11px] tw:text-slate-400 tw:lg:-mt-2 tw:lg:mb-4"
                                >
                                    {{ resultModelLabel }}
                                </p>

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
                                class="tw:bg-white tw:rounded-2xl tw:border tw:border-slate-200 tw:p-5 tw:lg:p-5"
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
                                                seg.bold
                                                    ? 'tw:font-bold tw:text-primary'
                                                    : undefined
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
                                        AI analysis is for educational guidance only. Results should
                                        be verified by an instructor.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </Transition>
                </Teleport>
            </McDetectionFilterScope>
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

        <!--
            Phone only, and full screen: it still rises from the bottom, but it takes the whole
            viewport rather than a slice of it.

            h-dvh overrides the bottom variant's own h-auto through tailwind-merge, and rounded-none
            drops the sheet's top corners - a panel covering the screen with rounded shoulders reads
            as a card that overflowed rather than as a screen.
        -->
        <McSheet v-model:open="modelSettingsOpen">
            <McSheetContent
                side="bottom"
                class="mc-slide-up tw:h-dvh tw:overflow-y-auto tw:rounded-none tw:lg:hidden"
            >
                <McSheetHeader>
                    <McSheetTitle>Model</McSheetTitle>
                    <McSheetDescription>
                        Which models run when you tap Start detection.
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

        <!--
            Past runs, in the idiom each pointer expects: a bottom sheet under a thumb, a centred
            modal under a mouse. A sheet on a desktop viewport anchors the list to the bottom edge,
            about 700px from the button at the top of the stage that opened it, and it is a phone
            convention borrowed for no reason - a mouse has no reach to accommodate.

            v-if/v-else, so exactly ONE McDetectionHistory is mounted and the single `history` ref
            and its thumbnail fetches are never doubled. Both close on a pick: the record loads
            behind them, so staying open would hide the thing the click asked for.
        -->
        <McSheet v-if="isCompact" v-model:open="historyOpen">
            <McSheetContent
                side="bottom"
                class="mc-slide-up tw:flex tw:h-dvh tw:flex-col tw:overflow-hidden tw:rounded-none"
            >
                <!-- Present for the dialog's accessible name, not shown: the panel below carries
                     its own "Recent analyses" heading, and rendering both put the same words on
                     screen twice with the sheet's copy adding nothing the list does not say. -->
                <McSheetHeader class="tw:sr-only">
                    <McSheetTitle>Recent analyses</McSheetTitle>
                    <McSheetDescription>
                        Past runs. Pick one to load it back into the viewer.
                    </McSheetDescription>
                </McSheetHeader>

                <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:px-4 tw:pt-4 tw:pb-6">
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

        <McDialog v-else v-model:open="historyOpen">
            <!--
                Full screen here too, not a centred box. This is a list of every run there has ever
                been, and a 672px dialog showed five of two hundred - the browsing is the task, so
                the surface should be the screen.

                Content rather than ScrollContent: ScrollContent scrolls the OVERLAY and lets the
                dialog grow, which is the opposite of what a fixed full-screen panel wants. The
                overrides beat DialogContent's own centred-box defaults through tailwind-merge -
                inset-0 with translate-none over the top/left 50% centring, rounded-none over
                rounded-lg, and BOTH max-w-none and sm:max-w-none - tailwind-merge treats a
                responsive variant as its own group, so the base one alone left sm:max-w-lg
                standing and the panel came out 512px wide.

                It rises rather than appearing, matching the phone's sheet - see `.mc-slide-up` in
                main.css. The components' own `animate-in` / `slide-in-from-bottom` utilities are
                inert in this project (no animation plugin, no keyframes), so the keyframes are
                defined there rather than relied on here.
            -->
            <McDialogContent
                class="mc-slide-up tw:inset-0 tw:top-0 tw:left-0 tw:h-dvh tw:w-screen tw:max-w-none tw:sm:max-w-none tw:translate-x-0 tw:translate-y-0 tw:flex tw:flex-col tw:overflow-hidden tw:rounded-none tw:border-0"
            >
                <McDialogHeader class="tw:sr-only">
                    <McDialogTitle>Recent analyses</McDialogTitle>
                    <McDialogDescription>
                        Past runs. Pick one to load it back into the viewer.
                    </McDialogDescription>
                </McDialogHeader>

                <McDetectionHistory
                    ref="history"
                    class="tw:min-h-0 tw:flex-1"
                    :active-id="activeRecordId"
                    @select="
                        (record) => {
                            historyOpen = false
                            loadFromHistory(record)
                        }
                    "
                />
            </McDialogContent>
        </McDialog>

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
