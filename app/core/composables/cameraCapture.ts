/**
 * Which camera routes a device actually has, resolved once on mount.
 *
 * There are two different "cameras" a browser can offer, and they are not interchangeable:
 *
 * `inAppCamera` is our own capture screen (getUserMedia, McCameraCapture). It needs a secure
 * context - localhost counts, a LAN IP over plain http does not - and it works on a laptop webcam
 * as well as a phone.
 *
 * `osCamera` is the `capture="environment"` handoff to the phone's own camera app. That attribute
 * is a TOUCH-DEVICE hint: desktop browsers parse it and ignore it, so on a laptop it silently opens
 * a file dialog. Enumerating devices is the wrong test for it - a MacBook has a webcam and still
 * ignores `capture` - so this asks whether the input is a touch one instead.
 *
 * Extracted from the exam capture flow so the detection page reaches the same verdict from the same
 * probes; the two screens offer the camera under identical conditions or students meet a "Take
 * photo" that works in one place and dead-ends in the other.
 */
export function useCameraAvailability() {
    const hasVideoInput = ref(true)
    const inAppCamera = ref(false)
    const osCamera = ref(false)
    const cameraBlocked = ref(false)

    /** True only where one of the two routes can really produce a photo. */
    const canTakePhoto = computed(
        () => (inAppCamera.value && hasVideoInput.value) || osCamera.value,
    )

    /** Our own screen can run: a secure context with getUserMedia and a camera attached. */
    const canUseInAppCamera = computed(() => inAppCamera.value && hasVideoInput.value)

    onMounted(async () => {
        inAppCamera.value = Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia)
        osCamera.value =
            navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches

        // enumerateDevices() needs no permission to report device *kinds* (labels stay empty until
        // it is granted), so a videoinput either exists or it does not. Absent API, or a throw, or
        // an empty list on a browser that reports nothing: all leave the option showing.
        try {
            const devices = await navigator.mediaDevices?.enumerateDevices()
            if (devices?.length && !devices.some((d) => d.kind === 'videoinput'))
                hasVideoInput.value = false
        } catch {
            // Leave it visible.
        }

        // Only Chromium knows the 'camera' permission name; Safari and Firefox throw on it, which
        // is why this cannot be the thing that decides whether the camera is offered - only whether
        // we can say up front that it is blocked.
        try {
            const status = await navigator.permissions?.query({
                name: 'camera' as PermissionName,
            })
            if (!status) return
            cameraBlocked.value = status.state === 'denied'
            status.onchange = () => (cameraBlocked.value = status.state === 'denied')
        } catch {
            // Stay optimistic.
        }
    })

    return {
        hasVideoInput,
        inAppCamera,
        osCamera,
        cameraBlocked,
        canTakePhoto,
        canUseInAppCamera,
    }
}

/** What went wrong starting the stream, as something a caller can act on. */
export type CameraStartFailure = 'denied' | 'missing' | 'failed'

/** DOMException names are the only reliable signal here; anything unrecognised is just 'failed'. */
export function cameraFailureOf(err: unknown): CameraStartFailure {
    const name = err instanceof DOMException ? err.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'missing'
    return 'failed'
}

export const cameraFailureMessage: Record<CameraStartFailure, string> = {
    denied: 'Camera access was denied. Pick a photo from your device instead.',
    missing: 'No camera found. Pick a photo from your device instead.',
    failed: 'The camera could not be started. Pick a photo from your device instead.',
}
