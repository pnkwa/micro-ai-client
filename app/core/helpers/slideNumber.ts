/**
 * Slide labels (2.2, "Slide ID อาจจะมี letter code เช่น Slide V7").
 *
 * The label physically written on a slide: historically an integer, now carrying an optional
 * letter prefix and suffix ("V7", "VVC12", "G3A").
 *
 * MIRRORED FROM micro-ai-server/src/slide-collections/slide-number.ts, with the same rules and cases.
 * The server normalizes on write and on lookup, so this copy is not what makes grading correct;
 * it is here so the two forms (instructor authoring, student exam entry) can validate and display
 * without a round-trip, and so the student sees "V7" rather than a rejected keystroke. Change both
 * together; the pattern is hand-mirrored the way model-manifest.ts <-> manifest.py is
 * (docs/cross-repo-contract.md).
 */

/**
 * Canonical form: optional letter prefix, number, optional letter suffix.
 * PROVISIONAL. Taken from the "Slide V7" example in the request, not from a real answer key.
 */
export const SLIDE_NUMBER_PATTERN = /^[A-Z]{0,3}[0-9]{1,4}[A-Z]?$/

/** Keep in step with the varchar(16) columns server-side. */
export const SLIDE_NUMBER_MAX_LENGTH = 16

/**
 * Reduce any way a human writes a slide label to the one stored, comparable form.
 *
 *   "Slide V7" | "slide v7" | " v7 " | "V07" -> "V7"
 *   7 | "07"                                 -> "7"
 *   "" | "abc!" | null                       -> null
 */
export function normalizeSlideNumber(raw: string | number | null | undefined): string | null {
    if (raw == null) return null

    const compact = String(raw)
        .trim()
        .toUpperCase()
        .replace(/^SLIDE\s*/, '')
        .replace(/\s+/g, '')

    if (compact === '') return null

    // Strip leading zeros from the numeric run only. The inner 0* is greedy but \d+ needs one
    // digit, so a bare "0" survives.
    const stripped = compact.replace(
        /^([A-Z]*)0*(\d+)/,
        (_full, prefix: string, digits: string) => `${prefix}${digits}`,
    )

    if (stripped.length > SLIDE_NUMBER_MAX_LENGTH) return null
    return SLIDE_NUMBER_PATTERN.test(stripped) ? stripped : null
}

/** Whether a raw value normalizes to a usable slide label. */
export function isValidSlideNumber(raw: string | number | null | undefined): boolean {
    return normalizeSlideNumber(raw) !== null
}

interface SlideNumberParts {
    prefix: string
    num: number
    suffix: string
}

function parts(label: string): SlideNumberParts {
    const m = /^([A-Z]*)(\d*)([A-Z]*)$/.exec(label)
    return {
        prefix: m?.[1] ?? '',
        num: m?.[2] ? Number.parseInt(m[2], 10) : -1,
        suffix: m?.[3] ?? '',
    }
}

/**
 * Natural order: prefix alphabetically, then the number NUMERICALLY, then the suffix. A plain
 * string sort puts V10 before V2, which reads as a broken list.
 */
export function compareSlideNumbers(a: string, b: string): number {
    const left = parts(a)
    const right = parts(b)
    if (left.prefix !== right.prefix) return left.prefix < right.prefix ? -1 : 1
    if (left.num !== right.num) return left.num - right.num
    if (left.suffix === right.suffix) return 0
    return left.suffix < right.suffix ? -1 : 1
}
