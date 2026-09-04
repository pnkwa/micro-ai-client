import {
    buildImageDraft,
    isUsableImageDraft,
    type DraftClass,
    type DraftShape,
    type ImageAnnotationDraft,
} from '~/core/helpers/imageAnnotationDraft'

/**
 * Per-image local cache of unsaved annotator work (BE-ADR-030, FE side). Backs the "restore your
 * unsaved work" prompt: the server write is throttled to cut label create/link calls, so this is
 * what protects the boxes drawn inside that window against a refresh or a tab close.
 *
 * Plain `localStorage` behind a keyed API rather than a single reactive `useStorage`, because the
 * open image changes as the person walks the queue and the key changes with it. Every access is
 * wrapped in try/catch: a private window, blocked site data or a thumbnail context can throw or
 * come back empty, and a lost draft must never take the page down with it.
 */
export function useImageAnnotationDraft() {
    const auth = useAuth()
    // Scope to the signed-in user so a shared browser never restores one person's work into
    // another's session. `sub` is the user id from the JWT; unauthenticated falls back to 'anon'.
    const keyFor = (imageId: number) =>
        `annot-img-draft:${auth.jwtUserInfo?.sub ?? 'anon'}:${imageId}`

    /** The draft to restore for this image, or null when there is none / it is stale / wrong version. */
    function load(imageId: number): ImageAnnotationDraft | null {
        try {
            const raw = localStorage.getItem(keyFor(imageId))
            if (!raw) return null
            const parsed = JSON.parse(raw) as ImageAnnotationDraft
            if (isUsableImageDraft(parsed, imageId)) return parsed
            localStorage.removeItem(keyFor(imageId)) // drop a stale / old-version record on read
            return null
        } catch {
            return null
        }
    }

    /** Write the current pass. Synchronous, so it doubles as the beforeunload flush. */
    function save(
        imageId: number,
        state: { shapes: DraftShape[]; pendingClasses: DraftClass[] },
    ): void {
        try {
            localStorage.setItem(
                keyFor(imageId),
                JSON.stringify(buildImageDraft({ imageId, ...state })),
            )
        } catch {
            /* storage full or unavailable - the work stays in memory, only the safety net is lost */
        }
    }

    /** Drop the draft - once the work is saved to the server, or the person discards it. */
    function clear(imageId: number): void {
        try {
            localStorage.removeItem(keyFor(imageId))
        } catch {
            /* nothing to do */
        }
    }

    return { load, save, clear }
}
