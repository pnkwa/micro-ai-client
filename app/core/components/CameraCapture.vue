<script setup lang="ts">
import { CheckCircle2, Loader2, X, SwitchCamera, Images } from '@lucide/vue'
import { useCameraZoom, videoTrackOf } from '~/core/composables/cameraZoom'
import { cameraFailureOf, type CameraStartFailure } from '~/core/composables/cameraCapture'

/**
 * The capture screen: live preview, shutter, then keep-or-retake.
 *
 * Full-screen rather than a centred dialog, and rather than a viewfinder embedded in a page -
 * framing a slide down a microscope eyepiece needs every pixel of preview the phone has, and a
 * boxed modal spends most of them on chrome. This is the layout every phone camera app uses:
 * preview filling the screen, a thin header, controls in a bar along the bottom under the thumb.
 *
 * Shared by the exam capture flow (StudentExamForm) and the detection page's shutter so the two
 * cannot drift - the crop maths in useCameraZoom is the half that has to agree with the preview,
 * and this markup is the half that has to agree with the crop.
 *
 * Rendered as McCameraCapture (core components are globally registered with the Mc prefix).
 */

const props = withDefaults(
    defineProps<{
        open: boolean
        /** Header text while framing; the review step always reads "Keep this photo?". */
        title?: string
        /** Prefix for the emitted File's name, e.g. `station-3` or `detection`. */
        fileName?: string
        /**
         * Offer "pick an existing image" beside the shutter. On a screen that opens straight into
         * the camera this is the only route to the gallery, so the choice of camera-or-image lives
         * here rather than on a chooser screen in front of it.
         */
        gallery?: boolean
        /**
         * Render in place, filling the caller's box, instead of taking the whole screen.
         *
         * The exam flow wants the takeover: it interrupts a form to grab one photo and hands you
         * straight back. A scanner screen is the opposite - the camera IS the screen's content, so
         * it belongs inside the app frame with the nav still above it, and a black sheet over the
         * top would only hide the app you are using.
         */
        inline?: boolean
        /**
         * Preview only - no header, no zoom row, no shutter, and no keep-or-retake step.
         *
         * For a caller that already has its own controls around the viewfinder and wants to keep
         * them: the desktop detection panel, whose Upload / shutter / Clear row and zoom slider sit
         * under the stage and predate this component. It drives the preview through the exposed
         * `takeShot` and zoom bindings instead, and a shot is handed straight over rather than
         * being reviewed, which is how that screen has always behaved.
         */
        bare?: boolean
        /**
         * Fill the whole frame with the feed and mark the 1:1 crop on top of it, instead of showing
         * a square preview with black either side of it.
         *
         * You still capture a square - a field of view down an eyepiece is a circle, and the square
         * is what the models are fed - but you get to see what is around it while you line the slide
         * up, which is most of the job on a phone held over an eyepiece.
         */
        fullBleed?: boolean
    }>(),
    {
        title: 'Take a photo',
        fileName: 'photo',
        gallery: false,
        inline: false,
        bare: false,
        fullBleed: false,
    },
)

const emit = defineEmits<{
    'update:open': [boolean]
    /**
     * A photo the caller can keep. Deliberately does NOT close the screen: a caller that rejects
     * the file (an unusable-image guard) leaves it open on the review step so the student can
     * simply retake, rather than starting the whole flow again.
     */
    capture: [File]
    /** The stream never started. The caller decides where to send the user instead. */
    fail: [CameraStartFailure]
    /** The gallery button. The caller owns the file input, so it opens its own picker. */
    gallery: []
}>()

const video = useTemplateRef<HTMLVideoElement>('video')
const starting = ref(false)

// The still being reviewed. Held as a Blob because that is what becomes the File on "Use photo";
// the URL is only for showing it.
const shot = ref<{ url: string; blob: Blob } | null>(null)
let stream: MediaStream | null = null

/**
 * Which camera to ask for. 'environment' first: both callers photograph something on a bench, so
 * the rear camera is the right default on a phone, and a laptop with only a front camera still
 * gets one because the constraint is `ideal` rather than `exact` (an exact one throws
 * OverconstrainedError there instead of falling back).
 */
const facing = ref<'environment' | 'user'>('environment')

// Mirror the preview for a user-facing camera (selfie-style, so a raised left hand shows on the
// left); a rear camera keeps its true orientation. Read from the track rather than from `facing`,
// because `ideal` means the browser may hand back the other one.
//
// "Unless it is environment", NOT "only when it is user": plenty of cameras report no facingMode at
// all - Chrome's built-in webcam on macOS among them - and those are overwhelmingly the front-facing
// kind, where an unmirrored preview swaps the user's left and right and makes the thing unusable to
// frame with. Requiring a confirmed 'user' was tried and is wrong for exactly that hardware.
//
// The capture is never mirrored either way (see takeShot): the mirror helps you aim, and would be a
// false record in the file.
const mirrored = ref(false)

// More than one camera to switch between. Labels stay empty before permission is granted, but the
// *count* of videoinputs does not, so this is safe to read either side of the prompt.
const hasMultipleCameras = ref(false)

const {
    zoom,
    zoomMin,
    zoomMax,
    zoomStep,
    canZoom,
    nativeZoom,
    previewTransform,
    setUpZoom,
    applyZoom,
    zoomBy,
    cropRect,
    reset: resetZoom,
} = useCameraZoom()

/**
 * Mirror and zoom share one `transform`, so they are written together - setting either on its own
 * would drop the other. Mirroring is preview-only (see takeShot); the digital zoom scale is the
 * same one the crop matches.
 */
const previewStyle = computed(() => ({
    transform:
        [mirrored.value ? 'scaleX(-1)' : '', previewTransform.value ?? '']
            .filter(Boolean)
            .join(' ') || undefined,
}))

const track = () => videoTrackOf(stream)

const stopStream = () => {
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
}

const clearShot = () => {
    if (shot.value) URL.revokeObjectURL(shot.value.url)
    shot.value = null
}

const close = () => {
    emit('update:open', false)
}

// Escape closes it, like every other overlay in the app. Bound on window rather than the overlay
// itself: a keydown handler on the div only fires while the div holds focus, and focus sits on the
// shutter or wherever the user last tapped.
const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
}

const start = async () => {
    starting.value = true
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facing.value } },
            audio: false,
        })
        // The overlay mounts in the same tick the request started, so the element is there by now;
        // the guard is for the user closing the screen while the prompt was still up.
        if (!props.open) return stopStream()

        const t = track()
        if (t) {
            setUpZoom(t)
            mirrored.value = t.getSettings().facingMode !== 'environment'
        }

        // Only worth offering once permission has been granted, which is also when the device list
        // becomes trustworthy.
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            hasMultipleCameras.value = devices.filter((d) => d.kind === 'videoinput').length > 1
        } catch {
            hasMultipleCameras.value = false
        }

        if (video.value) {
            video.value.srcObject = stream
            await video.value.play()
        }
    } catch (err) {
        emit('fail', cameraFailureOf(err))
        close()
    } finally {
        starting.value = false
    }
}

/** Swap front/rear on a phone that has both. Tears the stream down and re-asks; permission is
 *  already granted by this point, so there is no second prompt. */
const flipCamera = async () => {
    facing.value = facing.value === 'environment' ? 'user' : 'environment'
    stopStream()
    resetZoom()
    await start()
}

/**
 * The source square that the on-screen guide is showing, under object-cover.
 *
 * cover scales the frame by max(fitW, fitH) and centres it, and the guide is a centred square of
 * side min(containerW, containerH) - so the region inside the guide is a centred square of the
 * SOURCE, of side guide/(coverScale x digitalZoom). Both are centred, which is the only reason this
 * stays a centre crop and not an offset one.
 */
const fullBleedCrop = (el: HTMLVideoElement) => {
    const box = el.getBoundingClientRect()
    const cover = Math.max(box.width / el.videoWidth, box.height / el.videoHeight)
    const guide = Math.min(box.width, box.height)
    const factor = nativeZoom.value ? 1 : zoom.value
    const side = Math.min(guide / (cover * factor), el.videoWidth, el.videoHeight)
    return { sx: (el.videoWidth - side) / 2, sy: (el.videoHeight - side) / 2, side }
}

const takeShot = () => {
    const el = video.value
    if (!el?.videoWidth) return

    // Sourced from videoWidth/Height, not the element's CSS box: the element is sized to fit the
    // screen and drawing at that size would submit a downscaled copy. Either crop gives the centred
    // 1:1 region matching what the preview is showing, zoom included.
    const { sx, sy, side } = props.fullBleed
        ? fullBleedCrop(el)
        : cropRect(el.videoWidth, el.videoHeight)

    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const ctx = canvas.getContext('2d')

    // The mirror IS baked in, so the file matches the frame it was taken from. A mirrored preview
    // and an unmirrored file disagree about left and right, and the person who framed the shot is
    // the one who has to reconcile them - they aimed at one image and were handed its flip.
    //
    // The cost, stated plainly: a mirrored photo is not a faithful record. Anything with a
    // handedness to it - text on a label, an asymmetric field - comes out reversed in the saved
    // image and in whatever the detector reads. Only front-facing cameras are affected, since only
    // they mirror (see `mirrored`); a rear camera writes the source untouched.
    //
    // Flipped on the destination, not the source: the crop rect is computed in the video's own
    // coordinates, so the same region is read and only the drawing is reversed.
    if (ctx && mirrored.value) {
        ctx.translate(side, 0)
        ctx.scale(-1, 1)
    }
    ctx?.drawImage(el, sx, sy, side, side, 0, 0, side, side)

    canvas.toBlob(
        (blob) => {
            if (!blob) return
            if (props.bare) {
                emit('capture', toFile(blob))
                return
            }
            clearShot()
            shot.value = { url: URL.createObjectURL(blob), blob }
        },
        // JPEG to match what the workers expect and what `accept` allows; PNG would be several
        // times the size for a photograph and is not in the accepted set.
        'image/jpeg',
        0.92,
    )
}

const toFile = (blob: Blob) =>
    new File([blob], `${props.fileName}-${Date.now()}.jpg`, { type: 'image/jpeg' })

const useShot = () => {
    const current = shot.value
    if (!current) return
    emit('capture', toFile(current.blob))
}

// For a `bare` caller, which owns the controls this component is not rendering.
defineExpose({ takeShot, zoom, zoomMin, zoomMax, zoomStep, canZoom, applyZoom, zoomBy, track })

// Opening and closing drive the stream, so the whole lifecycle hangs off one prop rather than the
// caller having to remember to start and stop it. This is the one place a watcher earns its keep:
// it is a side effect on a transition, not derived state.
watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            window.addEventListener('keydown', onKeydown)
            facing.value = 'environment'
            void start()
            return
        }
        window.removeEventListener('keydown', onKeydown)
        starting.value = false
        stopStream()
        clearShot()
        resetZoom()
    },
)

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    stopStream()
    clearShot()
})
</script>

<template>
    <!-- Teleported to body so a caller's own stacking context cannot trap it, and given the dialog
         roles by hand - this is not one of the McDialog surfaces because the video has to fill the
         viewport rather than sit in a panel. -->
    <Teleport to="body" :disabled="inline">
        <div
            v-if="open"
            :role="inline ? undefined : 'dialog'"
            :aria-modal="inline ? undefined : 'true'"
            :aria-label="inline ? undefined : title"
            class="tw:flex tw:flex-col tw:bg-black"
            :class="inline ? 'tw:absolute tw:inset-0' : 'tw:fixed tw:inset-0 tw:z-50'"
        >
            <!--
                Floated over the preview rather than sitting in the column, the way a phone camera
                app does it: a header row in the flow costs the frame ~56px of the height it is
                competing for, and on a screen that is already mostly black the row reads as chrome
                bolted above the picture. The scrim is what keeps the white controls legible when
                the frame behind them is a bright field.
            -->
            <div
                v-if="!inline"
                class="tw:absolute tw:inset-x-0 tw:top-0 tw:z-10 tw:flex tw:items-center tw:justify-between tw:bg-linear-to-b tw:from-black/70 tw:to-transparent tw:p-3 tw:pb-8 tw:text-white"
            >
                <button
                    type="button"
                    class="tw:cursor-pointer tw:rounded-full tw:p-2 tw:transition-colors tw:hover:bg-white/15"
                    aria-label="Close the camera"
                    @click="close"
                >
                    <X class="tw:size-5" />
                </button>
                <span class="tw:text-sm tw:font-medium">
                    {{ shot ? 'Keep this photo?' : title }}
                </span>
                <!-- Doubles as the balance for the close button, so the title stays centred
                     whether or not there is a second camera to switch to. -->
                <button
                    v-if="hasMultipleCameras && !shot"
                    type="button"
                    class="tw:cursor-pointer tw:rounded-full tw:p-2 tw:transition-colors tw:hover:bg-white/15"
                    aria-label="Switch camera"
                    :disabled="starting"
                    @click="flipCamera"
                >
                    <SwitchCamera class="tw:size-5" />
                </button>
                <span v-else class="tw:size-9" aria-hidden="true" />
            </div>

            <!--
                Three cases, not two.

                INLINE (the desktop workbench) gets no padding and no radius of its own. It is not a
                floating panel: it fills a stage that already has a rounded, ringed, clipping box
                around it, so a 16px gutter and a second corner radius drew a frame inside a frame
                inside a frame - and the gutter came off the height, which is the binding dimension
                there, so the picture paid for the decoration twice. Black either side of the square
                is the viewfinder's own surround, and it matches the staged image, which sits on
                black in the same box.

                No padding on a phone either: the frame is width-bound there, so every pixel of
                gutter comes straight off the preview (32px of it, on a 375px screen). The modal the
                exam flow opens is the one case that becomes a floating panel, once the screen is
                wide enough for that to look deliberate.

                Top-aligned on a phone for the same reason square mode looks right in a phone
                camera app: the preview sits under the header and the controls own the space below
                it, rather than the frame floating mid-screen with black above and below. Centred
                again from sm up, where the frame is a panel on a large dark surface.
            -->
            <div
                class="tw:flex tw:min-h-0 tw:flex-1 tw:justify-center"
                :class="
                    fullBleed
                        ? 'tw:items-center tw:px-0 tw:pt-14 tw:pb-0'
                        : inline
                          ? 'tw:items-center tw:p-0'
                          : 'tw:items-start tw:p-0 tw:sm:items-center tw:sm:p-4'
                "
                :style="fullBleed ? { containerType: 'size' } : undefined"
            >
                <!--
                    The 1:1 frame. Fixed square because a field of view down an eyepiece is a
                    circle - a wider frame just adds black surround - and because what is captured
                    has to be what is shown here.

                    aspect-square with a plain w-full would let max-h break the ratio (the width
                    stays definite and only the height clamps), so the cap goes on the WIDTH
                    instead: min() takes the smaller of the row's width and 70vh, and the height
                    follows from the ratio. Square at every size.

                    Inline on a wide screen is the one case that inverts: the box it fills is
                    landscape (a column of a two-column row), so HEIGHT is the binding dimension and
                    the width follows. Sized by width there, the square is taller than the box and
                    the zoom row and shutter end up on top of the picture.

                    overflow-hidden clips the digitally zoomed preview to this frame rather than
                    letting it spill over the controls above and below.

                    Full-bleed is square too, NOT the whole screen. It used to fill a 390x796 stage,
                    and object-cover then scaled a 640x480 camera up by 1.66x to reach it - so the
                    centred square the shutter keeps was only ~235 source pixels wide. The preview
                    was a heavy zoom, the file was small, and one caused the other. Sized as a square
                    the cover scale is 0.81 and the crop keeps 480x480: the sensor's full height,
                    no enlargement, twice the detail for the detector.

                    What is lost is the strip of context above and below the square. It was never
                    captured, and paying a 2x resolution cost for it is the wrong trade on a page
                    whose output is fed to a model.

                    The width cap matters as much as the ratio: an aspect-square wider than the space
                    left is TALLER than it too, and centring an oversized box overflows it in both
                    directions - the square pushed back up through the reserved band and the buttons
                    collided again on a 600px screen. Capped by WIDTH, because the height then follows
                    the ratio; capping the height instead leaves the width definite and breaks the
                    square, and a viewfinder that is not square no longer shows what gets captured.

                    100cqh, not a calc() of viewport minus the chrome: the row above sets
                    container-type: size, so this reads the height actually available after the
                    reserved band and the controls, whatever they happen to measure. The arithmetic
                    version was wrong by a couple of pixels and collided anyway.

                    Centred in the space below a reserved band, not in the whole frame: the square's
                    own corner controls (close, switch camera) sit inside it, and the host page puts
                    ITS controls in the band above. The band is padding on the row (pt-14), so the
                    square centres in what is left and the two sets of buttons cannot meet however
                    tall the viewport is. Centring in the whole frame was the bug - the square's top
                    moved with the height and the buttons collided on shorter screens.
                -->
                <div
                    class="tw:relative tw:overflow-hidden tw:bg-navy-100"
                    :class="
                        fullBleed
                            ? 'tw:aspect-square tw:w-full tw:max-w-[min(100%,100cqh)]'
                            : inline
                              ? 'tw:aspect-square tw:w-full tw:max-w-[min(100%,70vh)] tw:rounded-none tw:lg:h-full tw:lg:w-auto tw:lg:max-w-none'
                              : 'tw:aspect-square tw:w-full tw:max-w-[min(100%,70vh)] tw:rounded-none tw:sm:rounded-xl'
                    "
                >
                    <!--
                        Kept mounted under the still rather than swapped out: tearing the video down
                        on every capture would stop the stream and make "Retake" restart the whole
                        permission-and-warmup cycle.

                        object-cover, not contain: the frame is square and the camera is not, so the
                        preview shows the centre square - exactly the region takeShot() crops.
                        Contain would letterbox and show more than gets captured.
                    -->
                    <video
                        ref="video"
                        class="tw:size-full tw:object-cover"
                        :class="shot ? 'tw:invisible' : ''"
                        :style="previewStyle"
                        playsinline
                        muted
                        autoplay
                    ></video>
                    <img
                        v-if="shot"
                        :src="shot.url"
                        alt="The photo you just took"
                        class="tw:absolute tw:inset-0 tw:size-full tw:object-cover"
                    />

                    <!-- Inline has no header bar, so the two controls that lived in it sit on the
                         preview instead: close at the left, switch camera at the right. -->
                    <button
                        v-if="inline && !bare && !shot"
                        type="button"
                        class="tw:absolute tw:top-3 tw:left-3 tw:z-10 tw:flex tw:size-9 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:bg-black/45 tw:text-white tw:backdrop-blur-sm tw:transition-colors tw:hover:bg-black/65"
                        aria-label="Close the camera"
                        @click="close"
                    >
                        <X class="tw:size-5" />
                    </button>

                    <button
                        v-if="inline && !bare && hasMultipleCameras && !shot"
                        type="button"
                        class="tw:absolute tw:top-3 tw:right-3 tw:z-10 tw:flex tw:size-9 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:bg-black/45 tw:text-white tw:backdrop-blur-sm tw:transition-colors tw:hover:bg-black/65"
                        aria-label="Switch camera"
                        :disabled="starting"
                        @click="flipCamera"
                    >
                        <SwitchCamera class="tw:size-5" />
                    </button>

                    <!-- The badge the desktop panel has always shown while the feed is live. Only
                         in bare mode: everywhere else the shutter under the preview is the thing
                         that says the camera is running. -->
                    <div
                        v-if="bare && !starting"
                        class="tw:pointer-events-none tw:absolute tw:top-2 tw:right-2 tw:flex tw:items-center tw:gap-1.5 tw:rounded-full tw:bg-black/40 tw:px-2.5 tw:py-1 tw:backdrop-blur-sm"
                    >
                        <span class="tw:size-1.5 tw:animate-pulse tw:rounded-full tw:bg-red-400" />
                        <span class="tw:text-[10px] tw:font-bold tw:tracking-widest tw:text-white">
                            LIVE
                        </span>
                    </div>

                    <span
                        v-if="starting"
                        class="tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:text-white"
                    >
                        <Loader2 class="tw:size-8 tw:animate-spin" />
                    </span>
                </div>
            </div>

            <!--
                Zoom and shutter as one bar, not two rows adrift in the black: they are the same
                job (frame the shot, take it), and grouping them puts the whole control surface in
                one place under the thumb. Scrimmed for the same reason as the header - on a wide
                screen the frame reaches behind it.

                pb accounts for the home indicator on a phone, so the shutter is not sitting on the
                gesture bar.
            -->
            <div
                v-if="!bare"
                class="tw:relative tw:z-10 tw:flex tw:flex-col tw:gap-1 tw:bg-linear-to-t tw:from-black/70 tw:to-transparent tw:pt-8"
            >
                <!--
                    Hidden while reviewing a still: zooming then would suggest it re-frames the
                    photo, and it cannot - the crop is already baked in. Retake to change it.
                -->
                <McCameraZoomControl
                    v-if="canZoom && !shot"
                    class="tw:px-6"
                    :zoom="zoom"
                    :min="zoomMin"
                    :max="zoomMax"
                    :step="zoomStep"
                    @update:zoom="applyZoom($event, track())"
                    @step="zoomBy($event, track())"
                />

                <div
                    class="tw:flex tw:items-center tw:justify-center tw:gap-8 tw:p-6 tw:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
                >
                    <template v-if="shot">
                        <McButton variant="outline" @click="clearShot">Retake</McButton>
                        <McButton @click="useShot">
                            <CheckCircle2 class="tw:mr-1.5 tw:size-4" />
                            Use photo
                        </McButton>
                    </template>
                    <!--
                        Gallery left, shutter centre, spacer right - the arrangement of every phone
                        camera app, and the spacer is what keeps the shutter on the screen's centre
                        line rather than shunted right by the gallery button.

                        The shutter is a ring rather than a labelled button for the same reason: it
                        is the one control here, and this is the shape people already know.
                    -->
                    <template v-else>
                        <button
                            v-if="gallery"
                            type="button"
                            class="tw:flex tw:size-12 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:bg-white/15 tw:text-white tw:transition-colors tw:hover:bg-white/25"
                            aria-label="Choose an image instead"
                            @click="emit('gallery')"
                        >
                            <Images class="tw:size-5" />
                        </button>
                        <span v-else class="tw:size-12" aria-hidden="true" />

                        <button
                            type="button"
                            aria-label="Take the photo"
                            :disabled="starting"
                            class="tw:size-16 tw:cursor-pointer tw:rounded-full tw:border-4 tw:border-white tw:bg-white/25 tw:transition-transform tw:hover:scale-105 tw:disabled:cursor-not-allowed tw:disabled:opacity-40"
                            @click="takeShot"
                        ></button>

                        <span class="tw:size-12" aria-hidden="true" />
                    </template>
                </div>
            </div>
        </div>
    </Teleport>
</template>
