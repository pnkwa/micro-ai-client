import type { AnnotationLabel } from '~/services/annotationLabelService'
import type { Shape } from './annotationShapes'

/**
 * The annotator's class list: the caller's own labels, with a per-image tally.
 *
 * A CLASS IS A ROW NOW, NOT A STRING (BE-ADR-038). It used to be neither: the list was derived from
 * whatever text the images happened to carry, and the colour came from a class's POSITION in that
 * derived list, which forced an append-only ordering rule on everything that touched it. A colour
 * that moved was worse than an arbitrary one, because people navigate this panel by colour.
 *
 * That whole problem is now the server's, and better solved: the palette is stored, per-user, and
 * the colour is authored rather than computed. This module is left with two jobs - counting a
 * palette against an image, and resolving a shape to its colour.
 *
 * Still free text, deliberately, for the reason BE-ADR-030 gave: the tool exists to describe what
 * the models do NOT detect, so a vocabulary frozen to the manifest's five classes would make the
 * dataset useless for the next checkpoint.
 */

/**
 * The colours offered when minting a label, cycled.
 *
 * NO LONGER WHAT ANYTHING IS COLOURED WITH. These are a starting suggestion so someone who types a
 * class name and picks nothing still gets a distinct colour, and the swatches the picker offers
 * before the full colour input. Once created, a label's colour is its own and lives on the server.
 *
 * Deliberately not `core/helpers/colors.ts`, which is the app-wide deterministic label map shared by
 * the detection overlay and the confidence bars. That one still hashes a name to a colour and is
 * still correct for model output, where nobody authored anything.
 */
export const CLASS_COLORS = ['#7C5CE0', '#D97706', '#2E9BD6', '#64748B', '#DB5A7E'] as const

/** The colour to offer at a position in the palette. Cycles past the fifth. */
export function classColorAt(index: number): string {
    return CLASS_COLORS[
        ((index % CLASS_COLORS.length) + CLASS_COLORS.length) % CLASS_COLORS.length
    ]!
}

/** Bare six-digit hex, which is what the palette stores. `#7C5CE0` goes out as `7c5ce0`. */
export function toColorHex(color: string): string {
    return color.replace('#', '').toLowerCase()
}

/** A palette colour as CSS. The wire holds `color_hex` bare; every render wants the `#`. */
export function colorOf(label: AnnotationLabel): string {
    return `#${label.color_hex}`
}

export interface AnnotationClass {
    /** The label row's server id. This is what a write sends and what a pick emits. */
    id: number
    label: string
    color: string
    /** 0-based position in the palette. The 1-9 keycap is this plus one, and only the first nine. */
    index: number
    /** How many shapes on the current image carry it. */
    count: number
}

/** The label a shape carries, or null when it is unnamed or names something not in the palette. */
export function labelById(palette: AnnotationLabel[], id: number | null): AnnotationLabel | null {
    if (id === null) return null
    return palette.find((entry) => entry.id === id) ?? null
}

/**
 * The label with this exact text, or null.
 *
 * How a box's `label_id` is recovered: the annotation read resolves the label's TEXT and colour but
 * does not carry its id, and `UNIQUE(owner_id, label)` makes the text a key within one palette. The
 * match is exact after trimming rather than case-insensitive, because the uniqueness constraint the
 * lookup leans on is exact too - treating "BV" and "bv" as one here would find a row the server is
 * perfectly willing to hold twice.
 */
export function labelByName(palette: AnnotationLabel[], name: string): AnnotationLabel | null {
    const wanted = name.trim()
    if (!wanted) return null
    return palette.find((entry) => entry.label === wanted) ?? null
}

/** The class list to render, in palette order, with per-image counts. */
export function buildClasses(palette: AnnotationLabel[], shapes: Shape[]): AnnotationClass[] {
    const counts = new Map<number, number>()
    for (const shape of shapes) {
        if (shape.labelId === null) continue
        counts.set(shape.labelId, (counts.get(shape.labelId) ?? 0) + 1)
    }
    return palette.map((entry, index) => ({
        id: entry.id,
        label: entry.label,
        color: colorOf(entry),
        index,
        count: counts.get(entry.id) ?? 0,
    }))
}

/** The colour a shape draws in, or null for an unlabelled one, which has its own treatment. */
export function colorForShape(palette: AnnotationLabel[], shape: Shape): string | null {
    const label = labelById(palette, shape.labelId)
    return label ? colorOf(label) : null
}

/**
 * The label most of these shapes carry, or null when none of them is labelled.
 *
 * This is what the picked class becomes when an image opens, so the picker describes the image in
 * front of you rather than the last one you touched. Without it the pick is set once per session
 * and never revisited: open an image of TV after one of BV and BV stays highlighted at count 0,
 * which is both wrong on its face and a trap, since the next shape drawn silently takes it.
 *
 * Ties go to the label seen FIRST in draw order - `Map` keeps insertion order and the comparison is
 * strict, so an image split evenly keeps the earlier class rather than flipping on reload.
 *
 * Null for an unlabelled image is deliberate and the caller relies on it: a blank image must not
 * clear the pick, because labelling a run of empty images with one class is the ordinary flow.
 */
export function dominantLabelId(shapes: Shape[]): number | null {
    const counts = new Map<number, number>()
    for (const shape of shapes) {
        if (shape.labelId === null) continue
        counts.set(shape.labelId, (counts.get(shape.labelId) ?? 0) + 1)
    }
    let best: number | null = null
    let bestCount = 0
    for (const [id, count] of counts) {
        if (count > bestCount) {
            best = id
            bestCount = count
        }
    }
    return best
}

/**
 * The class a number key picks. `1` is the first, `9` the ninth, and nothing beyond that.
 *
 * Returns null rather than clamping: a tenth class exists in the list and is pickable with the
 * mouse, and silently reassigning `9` to it would relabel a shape with a class the person did not
 * mean.
 */
export function classForDigit(classes: AnnotationClass[], digit: number): AnnotationClass | null {
    if (!Number.isInteger(digit) || digit < 1 || digit > 9) return null
    return classes[digit - 1] ?? null
}
