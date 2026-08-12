import { detectionService } from '~/services/detectionService'

/**
 * Whether the signed-in caller may use the AI detection tool (client request 5.2).
 *
 * The rule is BE-ADR-012's: a student sitting an exam must not have it, because the detector's
 * class labels ARE the diagnosis being examined. Staff always may — the auto-grader is the same
 * endpoint.
 *
 * NONE OF THIS IS THE BOUNDARY. `POST /detections` re-derives the rule server-side and 403s
 * regardless, which is the whole point: hiding a nav item has never stopped anyone typing a URL.
 * This exists so a student meets a clear message at the door instead of after picking a model and
 * uploading a photo.
 *
 * STATE IS SHARED (useState), not per-caller. The sidebar mounts once around NuxtPage for the
 * whole session, so a per-caller ref there would be answered once and then never again: a student
 * who entered the app mid-exam would keep Image Detection disabled after submitting, until a full
 * reload. Sharing means whoever refreshes it — a navigation, a tab refocus, the exam form on
 * submit — updates every reader at once.
 *
 * Fails OPEN on a network error, deliberately. A flaky request must not lock a student out of a
 * tool they are entitled to; if they are not entitled to it the server refuses the run anyway, so
 * guessing wrong here costs one rejected upload rather than a leaked answer.
 */

/** Bounds the request rate however many triggers fire. Well under an exam window's resolution. */
const MIN_REFRESH_GAP_MS = 15_000

export function useDetectionAvailability() {
    const available = useState('ai-available', () => true)
    const reason = useState<string | null>('ai-unavailable-reason', () => null)
    const lastCheckedAt = useState('ai-available-checked-at', () => 0)
    const isChecking = ref(false)

    const authStore = useAuth()

    /**
     * `force` skips the throttle, for the moments we know the answer just changed — submitting an
     * exam is the obvious one, and making the student wait out a throttle there is exactly the
     * lockout this is meant to fix.
     */
    const refresh = async ({ force = false }: { force?: boolean } = {}) => {
        if (!authStore.isSignedIn) return

        // Staff are never restricted, so asking is pure cost.
        if (authStore.user?.user_type === 'staff') {
            available.value = true
            reason.value = null
            return
        }

        if (!force && Date.now() - lastCheckedAt.value < MIN_REFRESH_GAP_MS) return

        isChecking.value = true
        try {
            const result = await detectionService.availability()
            available.value = result.available
            reason.value = result.reason
            lastCheckedAt.value = Date.now()
        } catch {
            available.value = true
            reason.value = null
        } finally {
            isChecking.value = false
        }
    }

    /** What to tell the student. Null when nothing is being withheld. */
    const message = computed(() =>
        available.value
            ? null
            : reason.value === 'exam_open'
              ? 'The AI tool is unavailable while you have an exam open. It returns once you submit, or once the exam closes.'
              : 'The AI tool is currently unavailable.',
    )

    return { available, reason, message, isChecking, refresh }
}
