import type { Shape } from '~/core/helpers/annotationShapes'

/**
 * Pure model for a locally-cached, unsaved pass of ONE library image (BE-ADR-030, FE side).
 *
 * The image annotator persists to the server, but the write is now throttled (a 20s idle autosave)
 * to cut label create/link calls, so there is a window where drawn boxes live only in the browser.
 * This is the cache that survives a refresh or a tab close inside that window; on reopen the page
 * offers to restore it. Per image, unlike the multi-image assignment draft in `annotationDraft.ts`.
 *
 * Framework-free on purpose: the storage/auth glue lives in `useImageAnnotationDraft`, and the parts
 * worth testing - the version + staleness guard, the shape round-trip, and the id-independent
 * signature used to tell a stale draft from a real one - live here where plain-node Vitest reaches.
 */

/** Bump when the persisted shape changes; a record from an older version is discarded on read. */
export const IMG_DRAFT_VERSION = 1

/** Drafts older than this are treated as abandoned. localStorage has no TTL of its own. */
export const IMG_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * One drawn box. Deliberately excludes the volatile `labelId` (a session-local id that means nothing
 * after reload) and carries the class TEXT instead, re-resolved against the palette on restore. A
 * polygon is stored as `[x, y]` pairs, the same shape the wire uses.
 */
export interface DraftShape {
    x: number
    y: number
    w: number
    h: number
    polygon: [number, number][] | null
    /** The class text; '' for an unnamed box. */
    label: string
    expert_curated: boolean
}

/** A class the student added that is not yet on the server (a pending palette row), kept so a
 * restored draft can recreate its vocabulary with the right colours. `color` is bare six-hex. */
export interface DraftClass {
    label: string
    color: string
}

export interface ImageAnnotationDraft {
    v: number
    savedAt: number
    imageId: number
    shapes: DraftShape[]
    pendingClasses: DraftClass[]
}

/**
 * A draft is usable only if it is the current shape, for THIS image, and recent enough to still
 * mean something.
 */
export function isUsableImageDraft(
    record: ImageAnnotationDraft | null | undefined,
    imageId: number,
    now = Date.now(),
): record is ImageAnnotationDraft {
    return (
        !!record &&
        record.v === IMG_DRAFT_VERSION &&
        record.imageId === imageId &&
        Number.isFinite(record.savedAt) &&
        now - record.savedAt <= IMG_DRAFT_MAX_AGE_MS
    )
}

/** Assemble a record from the page's current state. */
export function buildImageDraft(input: {
    imageId: number
    shapes: DraftShape[]
    pendingClasses: DraftClass[]
    now?: number
}): ImageAnnotationDraft {
    return {
        v: IMG_DRAFT_VERSION,
        savedAt: input.now ?? Date.now(),
        imageId: input.imageId,
        shapes: input.shapes,
        pendingClasses: input.pendingClasses,
    }
}

/** Editable shapes to their storable form. Drops the id and labelId; keeps the class text. */
export function toDraftShapes(shapes: Shape[]): DraftShape[] {
    return shapes.map((s) => ({
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        polygon: s.polygon ? s.polygon.map((p) => [p.x, p.y] as [number, number]) : null,
        label: s.label,
        expert_curated: s.expert_curated,
    }))
}

/**
 * Storable shapes back to editable ones. `resolveLabelId` turns the class text into its palette id
 * (the caller must have recreated any pending classes first); `newId` mints a fresh local id per
 * shape.
 */
export function draftShapesToShapes(
    shapes: DraftShape[],
    resolveLabelId: (name: string) => number | null,
    newId: () => string,
): Shape[] {
    return shapes.map((s) => ({
        id: newId(),
        label: s.label,
        labelId: s.label ? resolveLabelId(s.label) : null,
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        polygon: s.polygon ? s.polygon.map(([x, y]) => ({ x: x ?? 0, y: y ?? 0 })) : null,
        expert_curated: s.expert_curated,
    }))
}

/**
 * A comparable string keyed on geometry + class TEXT, id-independent. Used to tell a draft that
 * differs from the saved set (worth a restore prompt) from one that merely mirrors it (stale, drop
 * it). Coordinates are rounded so float noise from a round-trip does not read as a difference.
 */
export function draftSignature(shapes: DraftShape[]): string {
    const r = (n: number) => Math.round(n * 1e6) / 1e6
    return JSON.stringify(
        shapes.map((s) => [
            r(s.x),
            r(s.y),
            r(s.w),
            r(s.h),
            s.polygon ? s.polygon.map(([x, y]) => [r(x), r(y)]) : null,
            s.label,
        ]),
    )
}
