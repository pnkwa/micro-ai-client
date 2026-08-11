import { detectionService } from '~/services/detectionService'

/**
 * Whether the signed-in caller may use the AI detection tool (client request 5.2).
 *
 * The rule is BE-ADR-012's: a student sitting an exam must not have it, because the detector's
 * class labels ARE the diagnosis being examined. Staff always may — the auto-grader is the same
 * endpoint.
 *
 * NONE OF THIS IS THE BOUNDARY. `POST /detections` re-derives the rule server-side and 403s
 * regardless of what happens here, which is the whole point: hiding a nav item has never stopped
 * anyone typing a URL. This exists so a student meets a clear message at the door instead of
 * after picking a model and uploading a photo.
 *
 * Fails OPEN on a network error, deliberately. A flaky request must not lock a student out of a
 * tool they are entitled to; if they are not entitled to it, the server refuses the run anyway,
 * so the worst case of guessing wrong here is one wasted upload rather than a leaked answer.
 */
export function useDetectionAvailability() {
    const available = ref(true)
    const reason = ref<string | null>(null)
    const isChecking = ref(false)

    const refresh = async () => {
        isChecking.value = true
        try {
            const result = await detectionService.availability()
            available.value = result.available
            reason.value = result.reason
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
