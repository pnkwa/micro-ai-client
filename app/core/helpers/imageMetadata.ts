/**
 * `images.metadata` presentation and editing.
 *
 * The column is an open FLAT key/value bag (BE-ADR-031) rather than a fixed set of columns, so the
 * detail panel renders whatever it finds instead of a form of known fields. Flat is deliberate on
 * the server's side: values stay queryable with `->>` and indexable with GIN, which an
 * array-of-single-key-objects would not be.
 *
 * All of this is DOM-free so it can be unit tested - the repo's vitest runs in `environment: 'node'`
 * with no DOM at all, so anything worth a test has to live outside the .vue file.
 */

/**
 * Keys the metadata form must never send.
 *
 * `PATCH /images/:id` refuses `verdict` with a 400. It is BE-ADR-032's authoring hint and it is
 * SELF-DESCRIBING on purpose - it records which model's output was judged, on which run, by whom -
 * so a general metadata write could only degrade it into a bare string that the authoring form
 * would then prefill a verdict from about a detector nobody named. It is written by question
 * authoring and nothing else, so here it is displayed and never edited.
 */
export const RESERVED_METADATA_KEYS = ['verdict']

/**
 * The key the export reads for each row's `title`, which is why it sorts first.
 *
 * Worth knowing: nothing could write it before `PATCH /images/:id` existed, so every exported row
 * said `"title": null` until 2026-08-26.
 */
export const TITLE_KEY = 'title'

export interface MetadataEntry {
    key: string
    /** `exif_capture_time` reads as "Exif capture time". */
    label: string
    /** Display text. Objects and arrays are JSON, because the bag can hold either. */
    value: string
    /** Reserved keys render, but they do not edit. */
    reserved: boolean
}

export const isReservedMetadataKey = (key: string): boolean => RESERVED_METADATA_KEYS.includes(key)

/** `exif_capture_time` -> `Exif capture time`. Underscores and dashes both read as spaces. */
export const humanizeMetadataKey = (key: string): string => {
    const spaced = key.replace(/[_-]+/g, ' ').trim()
    if (!spaced) return key
    return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** Display text for one value. `null`/`undefined` read as empty rather than as the word "null". */
export const formatMetadataValue = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return JSON.stringify(value)
}

/**
 * The bag as an ordered list to render.
 *
 * `title` first because it is the one key with meaning outside this panel, then the rest
 * alphabetically, then the reserved keys last - they are context, not content.
 */
export const metadataEntries = (
    metadata: Record<string, unknown> | null | undefined,
): MetadataEntry[] => {
    if (!metadata) return []
    const rank = (key: string): number => {
        if (isReservedMetadataKey(key)) return 2
        return key === TITLE_KEY ? 0 : 1
    }
    return Object.keys(metadata)
        .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
        .map((key) => ({
            key,
            label: humanizeMetadataKey(key),
            value: formatMetadataValue(metadata[key]),
            reserved: isReservedMetadataKey(key),
        }))
}

/** The title, for a tile caption or a page heading. Empty strings count as absent. */
export const metadataTitle = (
    metadata: Record<string, unknown> | null | undefined,
): string | null => {
    const title = metadata?.[TITLE_KEY]
    return typeof title === 'string' && title.trim() ? title : null
}

/** One editable row in the metadata form. Reserved keys never become one. */
export interface MetadataDraft {
    key: string
    value: string
}

/** The editable rows, in the same order the panel displays them. */
export const toMetadataDrafts = (
    metadata: Record<string, unknown> | null | undefined,
): MetadataDraft[] =>
    metadataEntries(metadata)
        .filter((entry) => !entry.reserved)
        .map(({ key, value }) => ({ key, value }))

/**
 * The PATCH body for an editing pass, or `null` when nothing changed.
 *
 * SHALLOW MERGE with an explicit `null` deleting a key, which is what the server does: an omitted
 * key is left alone. So this sends only what moved, and that is not an optimisation - the bag is
 * shared between this panel, the export's `title` and BE-ADR-032's `verdict`, so sending the whole
 * object back would let this form clobber a key it does not own, including one written in the
 * window between its read and its write.
 *
 * Returning `null` for "no change" lets the caller skip the request rather than write a no-op.
 *
 * Rules, in order:
 *  - a reserved key is never sent, in either direction;
 *  - a blank key is dropped, so a half-typed new row is not a write;
 *  - a key that disappeared from the drafts is sent as `null` to delete it;
 *  - a duplicated key keeps its LAST value, matching what the object literal would do anyway.
 */
export const metadataPatch = (
    original: Record<string, unknown> | null | undefined,
    drafts: MetadataDraft[],
): Record<string, unknown> | null => {
    const before = original ?? {}
    const after = new Map<string, string>()
    for (const draft of drafts) {
        const key = draft.key.trim()
        if (!key || isReservedMetadataKey(key)) continue
        after.set(key, draft.value)
    }

    const patch: Record<string, unknown> = {}
    for (const [key, value] of after) {
        if (formatMetadataValue(before[key]) !== value) patch[key] = value
    }
    for (const key of Object.keys(before)) {
        if (isReservedMetadataKey(key) || after.has(key)) continue
        patch[key] = null
    }

    return Object.keys(patch).length ? patch : null
}
