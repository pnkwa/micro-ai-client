import { useStorage, StorageSerializers } from '@vueuse/core'
import {
    buildDraftRecord,
    isUsableDraft,
    type AnnotationDraftRecord,
    type AnnotationDraftClass,
    type DraftField,
} from '~/core/helpers/annotationDraft'

/**
 * Local, per-student draft of an in-progress annotation assignment so a refresh, an accidental tab
 * close, or a crash does not lose drawn boxes and form answers (BE-ADR-039 keeps nothing on the
 * server until Submit). localStorage-backed via `useStorage`, exactly as the auth store persists a
 * session. The trade-off is per-device scope: clearing site data or switching browsers loses it.
 */
export function useAnnotationDraft(assignmentId: number) {
    // Scope to the signed-in student so a shared browser never restores one student's work into
    // another's session. `sub` is the user id from the JWT; unauthenticated falls back to 'anon'.
    const auth = useAuth()
    const userId = auth.jwtUserInfo?.sub ?? 'anon'
    const store = useStorage<AnnotationDraftRecord | null>(
        `annot-draft:${userId}:${assignmentId}`,
        null,
        undefined,
        { serializer: StorageSerializers.object },
    )

    /** The draft to restore, or null when there is none / it is stale / it is the wrong version. */
    function load(): AnnotationDraftRecord | null {
        if (isUsableDraft(store.value)) return store.value
        if (store.value) store.value = null // clear stale/old-version records on read
        return null
    }

    function save(input: {
        currentIndex: number
        fields: DraftField[]
        extraClasses: AnnotationDraftClass[]
    }): void {
        store.value = buildDraftRecord(input)
    }

    /** Drop the draft call once the work has been submitted. */
    function clear(): void {
        store.value = null
    }

    return { load, save, clear }
}
