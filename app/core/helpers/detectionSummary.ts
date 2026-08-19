/**
 * The "AI Analysis Summary" prose on /image-detection.
 *
 * The summary exists to *teach*, not to announce a verdict. It points the student at the
 * morphology worth looking at and leaves the reading to them - the class the model picked is
 * scaffolding for that, never the answer. This is ML-ADR-001 ("boxes are elements, not
 * verdicts") expressed as copy, and the wording is the client's, from
 * `.claude/image_detection_summary_spec.md`.
 *
 * Two things about that spec are worth knowing before editing this file:
 *
 *  - It writes the candidiasis code as `VCC`. The models emit **`VVC`** (the checkpoints'
 *    `model.names` is `0:TV, 1:GU, 2:BV, 3:HL, 4:VVC`, mirrored in the server's
 *    `model-manifest.ts`). Keyed on `VCC` this map would silently never match, so `VVC` is
 *    what appears below and `CLASS_SUMMARIES` is guarded by a test.
 *  - It marks emphasis as `**markdown**`. The client renders no markdown and uses no
 *    `v-html`; emphasis here is structural. So the copy is stored pre-split into
 *    `SummarySegment`s and the page maps each to a `<span>`.
 *
 * Kept as a pure function so it is testable under the plain-Vitest setup (`environment:
 * 'node'`) rather than needing a Nuxt context.
 */
import type { DetectionStep } from '~/services/detectionService'

/** One run of text. `bold` ones become `<span class="tw:font-bold tw:text-primary">`. */
export type SummarySegment = { text: string; bold?: boolean }

/**
 * When a second class counts as a live alternative worth naming.
 *
 * Both conditions matter. `ALT_MIN` keeps near-zero classes from being dressed up as
 * "possibilities" - with five classes there is always a runner-up, and one at 0.04 is noise.
 * `ALT_GAP` keeps the callout off a confident call, where raising a doubt the model does not
 * have would be its own kind of misdirection.
 */
export const ALT_MIN = 0.3
export const ALT_GAP = 0.2

/** A detect/segment pass that found nothing reports this instead of a class. */
const NONE = 'none'

/**
 * The spec's per-class copy, keyed by class **code**, pre-split at the `**…**` boundaries.
 *
 * Verbatim from the spec - including its British/American mix and its hedging, which is
 * deliberate. Do not tighten the language into something more assertive: "may appear",
 * "consider whether" is the whole point.
 */
export const CLASS_SUMMARIES: Record<string, SummarySegment[]> = {
    HL: [
        {
            text:
                'This field shows predominantly normal-appearing cells without a clear morphological ' +
                'feature strongly suggestive of the four target conditions. Look at the overall cellular ' +
                'appearance and background carefully. However, the absence of obvious abnormal findings ' +
                'does not completely exclude another condition, particularly when some atypical features ' +
                'are present.',
        },
    ],
    VVC: [
        { text: 'Look for fungal elements among the vaginal cells, particularly ' },
        { text: 'yeast cells and/or elongated pseudohyphal structures', bold: true },
        {
            text:
                '. These fungal elements may appear as distinct structures against the cellular ' +
                'background. Examine the highlighted regions and consider whether the observed structures ' +
                'are consistent with fungal morphology.',
        },
    ],
    BV: [
        {
            text:
                'Look closely at the vaginal epithelial cells and their surrounding background. A key ' +
                'feature to consider is ',
        },
        { text: 'bacterial overgrowth associated with epithelial cells', bold: true },
        {
            text:
                ', which may make the cell borders appear less distinct or “coated.” Examine the ' +
                'highlighted areas and consider whether the bacterial pattern is consistent with this ' +
                'finding.',
        },
    ],
    GU: [
        { text: 'Look closely at the ' },
        { text: 'white blood cells', bold: true },
        { text: ', particularly their cytoplasm. A key feature to look for is ' },
        { text: 'intracellular cocci within neutrophils/white blood cells', bold: true },
        {
            text:
                '. Examine the highlighted regions carefully and consider whether the observed organisms ' +
                'are located inside the white blood cells.',
        },
    ],
    TV: [
        { text: 'Look for ' },
        { text: 'Trichomonas organisms', bold: true },
        {
            text:
                ' among the cells and background material. When visible, they may appear as relatively ' +
                'large, irregular or oval-shaped organisms, sometimes with a characteristic surrounding ' +
                'halo or granular appearance. Examine the highlighted regions and consider whether any ' +
                'structures show morphology compatible with Trichomonas.',
        },
    ],
}

/**
 * `probs` and `labels` are parallel arrays straight off the worker contract - `probs[i]` is
 * `labels[i]`'s best box confidence. Zip and rank them.
 *
 * `labels` is null for the legacy classifier, whose vocabulary was never stored; there is
 * nothing to rank in that case, so there is no alternative to offer either.
 */
export function rankedClasses(step: DetectionStep): { label: string; prob: number }[] {
    const labels = step.labels
    if (!labels?.length) return []
    return labels
        .map((label, i) => ({ label, prob: step.probs[i] ?? 0 }))
        .sort((a, b) => b.prob - a.prob)
}

/**
 * The runner-up class, when it has enough support to be worth raising - otherwise null.
 *
 * Ranked off `probs` rather than trusting `predicted_class` to be the top entry, so the two
 * cannot disagree. A `none` runner-up is not a competing reading and is skipped.
 */
export function alternativeClass(step: DetectionStep): string | null {
    const ranked = rankedClasses(step)
    const [top, second] = ranked
    if (!top || !second) return null
    if (second.label === NONE) return null
    if (second.prob < ALT_MIN) return null
    if (top.prob - second.prob > ALT_GAP) return null
    return second.label
}

export interface SummaryInput {
    step: DetectionStep
    /** `ModelSpec.elements` for the model that ran - code → morphology. */
    elements: Record<string, string>
    /** `ModelSpec.displayText` for the model that ran - code → diagnosis name. */
    displayText: Record<string, string>
    /** Staff are checking the model; students are learning from it. */
    isStaff: boolean
    segment: { present: boolean; count: number; confidence: number }
}

const pct = (n: number) => Math.round(n * 100)

/** The opening paragraph: the spec's class copy, or a graceful fallback. */
function classBody(step: DetectionStep, elements: Record<string, string>): SummarySegment[] {
    const predicted = step.predicted_class

    if (!predicted || predicted === NONE) {
        return [
            { text: 'The model found ' },
            { text: 'no recognisable diagnostic element', bold: true },
            { text: ' in this field.' },
        ]
    }

    const spec = CLASS_SUMMARIES[predicted]
    if (spec) return spec

    // Not one of the five vaginal-smear classes. The model dropdown still offers the legacy
    // Fungi/Non-Fungi classifier and the fungal segmenter, whose vocabularies the spec says
    // nothing about - so fall back to describing whatever element the manifest names for the
    // code, and stay silent rather than blank if it names none.
    const element = elements[predicted]
    if (!element) {
        return [
            { text: 'The model reported this field as ' },
            { text: predicted, bold: true },
            {
                text:
                    '. Examine the highlighted regions and consider which morphological features led ' +
                    'it there.',
            },
        ]
    }
    return [
        { text: 'The strongest morphological signal the model found in this field is ' },
        { text: element, bold: true },
        { text: '. Each outlined element on the image is one instance of it.' },
    ]
}

/**
 * The competing-possibilities block.
 *
 * Staff get the alternative's diagnosis name; students get only its discriminating
 * morphology. Handing a student "Bacterial vaginosis" is handing over the answer they are
 * there to reach - the same reason the main summary is keyed on `elements` rather than
 * `displayText` (BE-ADR-012, and ML-ADR-001's scoping of "without giving an explicit
 * diagnosis" to a student actively being assessed).
 */
function alternativeBlock(
    alt: string,
    elements: Record<string, string>,
    displayText: Record<string, string>,
    isStaff: boolean,
): SummarySegment[] {
    const feature = elements[alt]
    const out: SummarySegment[] = [
        {
            text:
                ' The image contains findings that may support more than one interpretation. The most ' +
                'likely classification does not necessarily represent the only possibility. Examine the ' +
                'highlighted regions for features that could support an alternative interpretation, and ' +
                'compare the observed morphology with the characteristic findings of each condition. ',
        },
        { text: 'Alternative possibility:', bold: true },
        { text: ' Some features in the field may also be compatible with ' },
    ]

    if (isStaff && displayText[alt]) {
        out.push({ text: displayText[alt] as string, bold: true })
    } else {
        out.push({ text: 'another pattern' })
    }

    if (feature) {
        out.push({ text: '. Pay particular attention to ' })
        out.push({ text: feature, bold: true })
        out.push({ text: ' before deciding which interpretation best fits the image.' })
    } else {
        out.push({
            text: '. Weigh its characteristic findings against this field before deciding which interpretation best fits the image.',
        })
    }
    return out
}

/** The fungal segmenter's finding, ported from the summary this replaced. */
function segmentBlock(segment: SummaryInput['segment']): SummarySegment[] {
    if (!segment.present) {
        return [
            {
                text: ' No fungal segmentation was run, so nothing here speaks to fungal elements either way.',
            },
        ]
    }
    if (segment.count > 0) {
        return [
            { text: ' A separate model looked for fungal elements: it outlined ' },
            { text: String(segment.count), bold: true },
            {
                text: ` of them (${pct(segment.confidence)}% confidence on the strongest), so look for hyphae and budding forms among the cells.`,
            },
        ]
    }
    return [
        { text: ' A separate model looked for fungal elements: it outlined ' },
        { text: 'none', bold: true },
        { text: ', so the elements here are bacterial and cellular rather than fungal.' },
    ]
}

/**
 * Assemble the whole summary, in reading order: what to look at, what else it might be, how
 * sure the model was, what the fungal pass said, and - staff only - the class itself.
 */
export function buildSummary(input: SummaryInput): SummarySegment[] {
    const { step, elements, displayText, isStaff, segment } = input
    const out: SummarySegment[] = [...classBody(step, elements)]

    const alt = alternativeClass(step)
    if (alt) out.push(...alternativeBlock(alt, elements, displayText, isStaff))

    // Phrased without a subject ("it") on purpose: the class copy above does not always leave
    // one - the HL paragraph describes a field, not a finding - so "recognised it" would dangle.
    if (step.predicted_class && step.predicted_class !== NONE) {
        out.push({ text: ' The model’s confidence in this reading was ' })
        out.push({ text: `${pct(step.confidence)}%`, bold: true })
        out.push({ text: '.' })
    }

    out.push(...segmentBlock(segment))

    out.push({
        text:
            ' These are the features the model keyed on, not a diagnosis - read them against the field ' +
            'yourself and reach your own.',
    })

    // Staff are verifying the model rather than learning from it, so they get the call outright.
    // Deliberately last: it must not be the frame the rest of the summary is read through.
    if (isStaff) {
        const name = displayText[step.predicted_class]
        if (name) {
            out.push({ text: ' Model’s classification: ' })
            out.push({ text: name, bold: true })
            out.push({ text: '.' })
        }
    }

    return out
}
