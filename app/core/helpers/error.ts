export const apiErrorMessage = (err: unknown, fallback: string): string => {
    const message = (err as { data?: { message?: string | string[] } })?.data?.message
    if (Array.isArray(message)) return message.join(', ')
    return message ?? fallback
}

/**
 * The HTTP status behind a failed `$api` call, when there is one.
 *
 * ofetch puts it on `response.status` and also on `statusCode`; a network failure has neither, and
 * returns undefined here rather than a misleading 0.
 */
export const apiErrorStatus = (err: unknown): number | undefined => {
    const e = err as { response?: { status?: number }; statusCode?: number }
    return e?.response?.status ?? e?.statusCode
}

/**
 * Was this refused rather than missing?
 *
 * Worth telling apart on IMAGES specifically. Until v0.7 an image URL carried an unguessable UUID,
 * so possessing it WAS the authorization and 404 was the only realistic failure. An image is
 * addressed by an integer id now and the route checks authentication only, with the real
 * permission union a recorded deferral (BE-ADR-031), so a 403 is a live possibility and an image
 * URL is no longer shareable between users. A caller that cannot tell the two apart can only say
 * "broken", which is wrong half the time.
 */
export const isForbidden = (err: unknown): boolean => apiErrorStatus(err) === 403

/**
 * A uniqueness conflict, which several surfaces treat as an ordinary outcome rather than a failure.
 *
 * Minting an annotation label is the case that needs it: `UNIQUE(owner_id, label)` means asking for
 * a class you already hold comes back 409, and the annotator reaches that constantly because typing
 * a name onto a chip cannot know what the palette already has. The caller reuses the existing row.
 */
export const isConflict = (err: unknown): boolean => apiErrorStatus(err) === 409
