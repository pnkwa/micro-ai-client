/**
 * Zoom for a live camera preview, by whichever of the two mechanisms the device actually has.
 *
 * NATIVE is the camera's own zoom, driven through `applyConstraints`. Android Chrome exposes it;
 * iOS Safari and most desktop webcams do not. Where it exists it is the better one - the sensor
 * does the work, so the full resolution survives and nothing needs cropping at capture.
 *
 * DIGITAL is the fallback: the caller scales the preview with a CSS transform and crops the middle
 * of the frame at capture. That genuinely loses pixels, which is the honest trade on a device
 * whose camera will not zoom itself.
 *
 * Shared by the exam's capture screen (StudentExamForm) and the detection page's viewfinder so the
 * two cannot drift - the crop maths in `cropRect` is the half that has to agree with the preview,
 * and it is easy to get subtly wrong in two places.
 */

/** `zoom` is an optional extension, absent from lib.dom's MediaTrackCapabilities. */
type ZoomRange = { min?: number; max?: number; step?: number }

/** Digital zoom cap. Past ~4x a preview is mush and the crop has thrown away most of the frame. */
const DIGITAL_ZOOM_MAX = 4

export function useCameraZoom() {
    const zoom = ref(1)
    const zoomMin = ref(1)
    const zoomMax = ref(1)
    const zoomStep = ref(0.1)
    const nativeZoom = ref(false)

    /** False when the device offers no zoom at all, so callers can hide a dead control. */
    const canZoom = computed(() => zoomMax.value > zoomMin.value)

    /** The CSS transform for the preview: identity under native zoom, which is already in the frames. */
    const previewTransform = computed(() => (nativeZoom.value ? undefined : `scale(${zoom.value})`))

    const reset = () => {
        zoom.value = 1
        zoomMin.value = 1
        zoomMax.value = 1
        nativeZoom.value = false
    }

    /** Read the track's capabilities and pick the mechanism. Call once per stream. */
    const setUpZoom = (track: MediaStreamTrack) => {
        const caps = (track.getCapabilities?.() ?? {}) as { zoom?: ZoomRange }
        const range = caps.zoom

        if (range && typeof range.max === 'number' && range.max > (range.min ?? 1)) {
            nativeZoom.value = true
            zoomMin.value = range.min ?? 1
            zoomMax.value = range.max
            zoomStep.value = range.step || 0.1
            zoom.value = (track.getSettings() as { zoom?: number }).zoom ?? zoomMin.value
            return
        }

        nativeZoom.value = false
        zoomMin.value = 1
        zoomMax.value = DIGITAL_ZOOM_MAX
        zoomStep.value = 0.1
        zoom.value = 1
    }

    const applyZoom = (value: number, track?: MediaStreamTrack | null) => {
        zoom.value = value
        // Digital zoom is the preview transform plus the crop at capture, so there is nothing to
        // push to the track.
        if (!nativeZoom.value) return
        void track
            ?.applyConstraints({ advanced: [{ zoom: value }] } as unknown as MediaTrackConstraints)
            .catch(() => {
                // A device that advertised a range but refuses the value: leave the preview as it
                // is rather than fighting it.
            })
    }

    /** Step by five slider increments - one button press should be a visible change, not a nudge. */
    const zoomBy = (direction: 1 | -1, track?: MediaStreamTrack | null) => {
        const next = zoom.value + direction * zoomStep.value * 5
        applyZoom(Math.min(zoomMax.value, Math.max(zoomMin.value, next)), track)
    }

    /**
     * The source rectangle to draw at capture: a centred square, cropped to match what the preview
     * is showing.
     *
     * Square because a field of view down an eyepiece is a circle - a 4:3 or 16:9 frame spends its
     * extra width on the black surround - and because the preview frame is square, so anything
     * wider would capture more than the student framed.
     */
    const cropRect = (width: number, height: number) => {
        const factor = nativeZoom.value ? 1 : zoom.value
        const side = Math.min(width, height) / factor
        return { sx: (width - side) / 2, sy: (height - side) / 2, side }
    }

    return {
        zoom,
        zoomMin,
        zoomMax,
        zoomStep,
        nativeZoom,
        canZoom,
        previewTransform,
        setUpZoom,
        applyZoom,
        zoomBy,
        cropRect,
        reset,
    }
}

/** The first video track of a stream, or null. Both callers need it to drive native zoom. */
export function videoTrackOf(stream: MediaStream | null | undefined): MediaStreamTrack | null {
    return stream?.getVideoTracks()[0] ?? null
}
