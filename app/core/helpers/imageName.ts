/**
 * An image's display name: where it comes from, and what may be typed into it.
 *
 * *** THE NAME IS `metadata.title`, AND NOTHING ELSE MOVES WITH IT. *** The bytes are addressed by
 * the row id and the content hash, so renaming is one `PATCH /images/:id { metadata: { title } }`
 * and every URL the annotator builds is untouched. That separation is the whole safety property
 * here: a rename that could reach the storage key is a rename that can produce a black canvas.
 *
 * Every image used to read `Image 42`, because upload stored the bytes and threw the filename away.
 * That is fixed at the source - the uploader now takes the name off the file - so renaming is a
 * correction rather than the only route to a usable name.
 */

import { TITLE_KEY } from './imageMetadata'

/** No slashes, no Windows-reserved punctuation, nothing that reads as a path. */
const FORBIDDEN = /[/\\:*?"<>|]/g

/** Long enough for a lab convention, short enough to stay in a card footer. */
export const TITLE_MAX = 120

/**
 * A trailing extension, split off so it can be shown but not edited.
 *
 * Deliberately narrow: 1 to 5 characters, letters and digits, after a dot that is not the first
 * character. `IMG_0417.png` splits; `Slide 14. Gram stain` and `.hidden` do not, because a full
 * stop mid-sentence is not an extension and stripping it would eat a real word.
 */
const EXTENSION = /^(.+)(\.[A-Za-z0-9]{1,5})$/

export interface SplitName {
    /** What the rename input holds and what a person edits. */
    base: string
    /** `.png`, or an empty string. Rendered beside the input, never inside it. */
    ext: string
}

export function splitExtension(name: string): SplitName {
    const match = EXTENSION.exec(name)
    return match ? { base: match[1]!, ext: match[2]! } : { base: name, ext: '' }
}

/**
 * The title an uploaded file arrives with: its name, WITHOUT the extension.
 *
 * Dropping `.png` is deliberate. The extension says nothing a microscopy library cares about, every
 * file in a batch carries the same one, and keeping it would mean every rename has to protect a
 * suffix that is only noise. `splitExtension` still handles a title that has one, because a title
 * typed by hand or backfilled from elsewhere may.
 */
export function titleFromFilename(filename: string): string {
    return sanitizeTitle(splitExtension(filename).base)
}

/**
 * What an image is CALLED, on every surface that names one.
 *
 * *** ONE FIELD, ONE FALLBACK, FIVE SURFACES: *** the card footer, the inspector header, the
 * lightbox title, the annotator's queue row and its pager pill. They already shared the field and
 * disagreed about the fallback - the annotator said `IMG_42` where the library said `Image 42` for
 * the same untitled row - which is exactly the kind of drift that makes someone think they are
 * looking at two different pictures.
 *
 * `IMG_` rather than `Image `, because it reads as a name rather than as a sentence about one, and
 * that is what the surfaces around it are shaped for: mono, truncated, beside a filename.
 */
export function imageDisplayName(
    metadata: Record<string, unknown> | null | undefined,
    id: number,
): string {
    const title = metadata?.[TITLE_KEY]
    return typeof title === 'string' && title.trim() ? title : `IMG_${id}`
}

/** Trimmed, stripped of path punctuation, capped. Applied on commit, not on every keystroke. */
export function sanitizeTitle(value: string): string {
    return value.replace(FORBIDDEN, '').trim().slice(0, TITLE_MAX)
}

/**
 * Why a name cannot be committed, or null when it can.
 *
 * DUPLICATES ARE NOT AN ERROR. The id is the identity, two slides photographed the same day
 * genuinely share a name, and refusing that would make the library harder to use than the paper
 * process it replaces. The caller shows a muted line instead; see `duplicateNote`.
 */
export function titleError(value: string): string | null {
    const clean = sanitizeTitle(value)
    if (!clean) return 'A name cannot be empty.'
    if (value.trim().length > TITLE_MAX) return `Keep it under ${TITLE_MAX} characters.`
    return null
}

/** The non-blocking note under the input when the name is already in use nearby. */
export function duplicateNote(value: string, taken: string[]): string | null {
    const clean = sanitizeTitle(value).toLowerCase()
    if (!clean) return null
    return taken.some((name) => name.toLowerCase() === clean)
        ? `Another image here is also called ${sanitizeTitle(value)}.`
        : null
}
