import type { Shape } from './annotationShapes'

/**
 * The annotator's class list: the labels in play, in a stable order, each with a colour.
 *
 * THERE IS NO CLASS ENTITY. Labels are free text by decision (BE-ADR-030): the tool exists to
 * describe what the models do NOT detect - clue cells, WBCs and GNDs are none of them model
 * outputs - so a vocabulary frozen to a fixed list would make the dataset useless for the next
 * checkpoint. A "class" here is therefore just a label string that something already uses, and the
 * class list is derived rather than stored.
 *
 * Colour is assigned BY POSITION, which is why the order has to be append-only. Sorting the list
 * would recolour every class the moment a label sorting before them appeared, and a colour that
 * moves is worse than an arbitrary one: people navigate this panel by colour.
 */

/**
 * Five colours, cycled.
 *
 * Deliberately not `core/helpers/colors.ts`, which is the app-wide deterministic label map shared
 * by the detection overlay and the confidence bars. Reusing it would have meant either restyling
 * /image-detection and grading, or accepting two palettes anyway - so the annotator owns its own
 * and the rest of the app is left alone.
 */
export const CLASS_COLORS = ['#7C5CE0', '#D97706', '#2E9BD6', '#64748B', '#DB5A7E'] as const

/** The colour for a position in the class list. Cycles past the fifth. */
export function classColorAt(index: number): string {
    return CLASS_COLORS[
        ((index % CLASS_COLORS.length) + CLASS_COLORS.length) % CLASS_COLORS.length
    ]!
}

export interface AnnotationClass {
    label: string
    color: string
    /** 0-based. The 1-9 keycap is this plus one, and only the first nine get one. */
    index: number
    /** How many shapes on the current image carry it. */
    count: number
}

/**
 * Fold any labels the shapes use into the known list, preserving existing order.
 *
 * APPEND-ONLY, which is the whole contract: an existing label keeps its position and therefore its
 * colour, and anything new lands at the end. Called when an image loads and whenever a label is
 * typed, so the list grows across a session without ever reshuffling.
 *
 * Blank labels are not classes - an unlabelled shape is unfinished work, and giving it a row would
 * put a nameless entry at the top of the picker.
 */
export function mergeClassLabels(known: string[], shapes: Shape[]): string[] {
    return mergeLabels(
        known,
        shapes.map((shape) => shape.label),
    )
}

/**
 * The same fold, over bare label strings.
 *
 * Exists for the page-load seed, which reads every label the library already uses from the dataset
 * export and so has no shapes to fold - only names. Same append-only contract, same trimming, same
 * blank rule, because the two have to agree about what counts as a class or the picker's colours
 * would depend on which route filled it.
 */
export function mergeLabels(known: string[], labels: string[]): string[] {
    const seen = new Set(known)
    const merged = [...known]
    for (const raw of labels) {
        const label = raw.trim()
        if (label && !seen.has(label)) {
            seen.add(label)
            merged.push(label)
        }
    }
    return merged
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
export function dominantLabel(shapes: Shape[]): string | null {
    const counts = new Map<string, number>()
    for (const shape of shapes) {
        const label = shape.label.trim()
        if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    let best: string | null = null
    let bestCount = 0
    for (const [label, count] of counts) {
        if (count > bestCount) {
            best = label
            bestCount = count
        }
    }
    return best
}

/** The class list to render, with per-image counts. */
export function buildClasses(known: string[], shapes: Shape[]): AnnotationClass[] {
    const counts = new Map<string, number>()
    for (const shape of shapes) {
        const label = shape.label.trim()
        if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return known.map((label, index) => ({
        label,
        color: classColorAt(index),
        index,
        count: counts.get(label) ?? 0,
    }))
}

/** The colour a shape draws in, or null for an unlabelled one, which has its own treatment. */
export function colorForShape(known: string[], shape: Shape): string | null {
    const label = shape.label.trim()
    if (!label) return null
    const index = known.indexOf(label)
    return index === -1 ? null : classColorAt(index)
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
