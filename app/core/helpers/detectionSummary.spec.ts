import { describe, expect, it } from 'vitest'
import type { DetectionStep } from '~/services/detectionService'
import {
    ALT_GAP,
    ALT_MIN,
    CLASS_SUMMARIES,
    alternativeClass,
    buildSummary,
    rankedClasses,
    type SummaryInput,
} from './detectionSummary'

/**
 * The summary is the one surface where a student is told what to look at, so the tests that
 * matter most here are not about formatting - they are that a student is never handed the
 * diagnosis, and that the class map is keyed on the codes the models actually emit.
 */

/** The vaginal-smear vocabulary as the server manifest reports it. */
const ELEMENTS: Record<string, string> = {
    BV: 'Clue cell',
    VVC: 'Pseudohyphae / budding yeast',
    TV: 'Trichomonas trophozoite',
    GU: 'WBC with intracellular diplococci',
    HL: 'Epithelial cell with adhered rods',
}
const DISPLAY_TEXT: Record<string, string> = {
    BV: 'Bacterial vaginosis',
    VVC: 'Vaginal candidiasis',
    TV: 'Trichomonas vaginalis',
    GU: 'Gonococcal infection',
    HL: 'Healthy',
}

const LABELS = ['TV', 'GU', 'BV', 'HL', 'VVC']

const step = (over: Partial<DetectionStep> = {}): DetectionStep =>
    ({
        id: 1,
        step: 'detect',
        step_order: 0,
        predicted_class: 'BV',
        confidence: 0.9,
        probs: [0, 0, 0.9, 0, 0],
        labels: LABELS,
        boxes: [],
        created_at: '2026-08-15T00:00:00.000Z',
        ...over,
    }) as DetectionStep

const build = (over: Partial<SummaryInput> = {}) =>
    buildSummary({
        step: step(),
        elements: ELEMENTS,
        displayText: DISPLAY_TEXT,
        isStaff: false,
        segment: { present: false, count: 0, confidence: 0 },
        ...over,
    })

const text = (segs: { text: string }[]) => segs.map((s) => s.text).join('')

describe('CLASS_SUMMARIES', () => {
    /**
     * GUARD. The client's spec writes the candidiasis code as `VCC`; the checkpoints emit
     * `VVC`. A map keyed on the typo matches nothing and degrades to the fallback with no
     * error, so if someone re-copies the spec this is what catches it.
     */
    it('is keyed on the codes the models emit, VVC not VCC', () => {
        expect(Object.keys(CLASS_SUMMARIES).sort()).toEqual(['BV', 'GU', 'HL', 'TV', 'VVC'])
    })

    it('never names a diagnosis in its copy', () => {
        for (const [code, segs] of Object.entries(CLASS_SUMMARIES)) {
            const body = text(segs).toLowerCase()
            for (const name of Object.values(DISPLAY_TEXT)) {
                // "Healthy" is the one display name that is also ordinary English, and the HL
                // copy does not use it; every other name would be handing over the answer.
                expect(body, `${code} mentions ${name}`).not.toContain(name.toLowerCase())
            }
        }
    })
})

describe('rankedClasses', () => {
    it('pairs probs to labels and sorts descending', () => {
        const ranked = rankedClasses(step({ probs: [0.1, 0.5, 0.2, 0, 0.9] }))
        expect(ranked.map((r) => r.label)).toEqual(['VVC', 'GU', 'BV', 'TV', 'HL'])
        expect(ranked[0]).toEqual({ label: 'VVC', prob: 0.9 })
    })

    it('returns nothing when the model reports no vocabulary', () => {
        expect(rankedClasses(step({ labels: null }))).toEqual([])
    })

    it('treats a missing prob as zero rather than NaN', () => {
        expect(rankedClasses(step({ probs: [0.4] })).at(-1)?.prob).toBe(0)
    })
})

describe('alternativeClass', () => {
    /** probs indexed against LABELS = TV, GU, BV, HL, VVC */
    it('fires when the runner-up is strong and close', () => {
        expect(alternativeClass(step({ probs: [0, 0, 0.6, 0, 0.45] }))).toBe('VVC')
    })

    it('is silent when the runner-up is below ALT_MIN', () => {
        expect(alternativeClass(step({ probs: [0, 0, 0.35, 0, ALT_MIN - 0.01] }))).toBeNull()
    })

    it('is silent when the top class is far ahead', () => {
        expect(alternativeClass(step({ probs: [0, 0, 0.95, 0, 0.95 - ALT_GAP - 0.01] }))).toBeNull()
    })

    it('accepts the exact boundary', () => {
        expect(alternativeClass(step({ probs: [0, 0, ALT_MIN + ALT_GAP, 0, ALT_MIN] }))).toBe('VVC')
    })

    it('is silent without a vocabulary to rank', () => {
        expect(alternativeClass(step({ labels: null }))).toBeNull()
    })

    it('never offers "none" as an alternative reading', () => {
        const s = step({ labels: ['BV', 'none'], probs: [0.5, 0.45] })
        expect(alternativeClass(s)).toBeNull()
    })
})

describe('buildSummary', () => {
    it.each(Object.keys(CLASS_SUMMARIES))('opens with the spec copy for %s', (code) => {
        const out = build({ step: step({ predicted_class: code }) })
        expect(text(out)).toContain(text(CLASS_SUMMARIES[code] as { text: string }[]))
    })

    it('keeps the spec bold runs bold', () => {
        const out = build({ step: step({ predicted_class: 'GU' }) })
        expect(out.filter((s) => s.bold).map((s) => s.text)).toContain('white blood cells')
    })

    it('reports an empty field rather than a class', () => {
        const out = build({ step: step({ predicted_class: 'none', confidence: 0 }) })
        expect(text(out)).toContain('no recognisable diagnostic element')
        expect(text(out)).not.toContain('confidence')
    })

    it('falls back to the manifest element for a class outside the spec', () => {
        // The legacy Fungi/Non-Fungi classifier is still selectable on the page.
        const out = build({
            step: step({ predicted_class: 'Fungi', labels: null }),
            elements: { Fungi: 'Fungal element' },
            displayText: {},
        })
        expect(text(out)).toContain('Fungal element')
    })

    it('degrades gracefully when the manifest names no element either', () => {
        const out = build({
            step: step({ predicted_class: 'Weird', labels: null }),
            elements: {},
            displayText: {},
        })
        expect(text(out)).toContain('Weird')
        expect(text(out).length).toBeGreaterThan(60)
    })

    it('reports the confidence the model had', () => {
        const out = build({ step: step({ confidence: 0.874 }) })
        expect(out.filter((s) => s.bold).map((s) => s.text)).toContain('87%')
    })

    it('leaves no space stranded inside a bold run', () => {
        const out = build({
            step: step({ predicted_class: 'BV', probs: [0, 0, 0.6, 0, 0.45] }),
            isStaff: true,
            segment: { present: true, count: 2, confidence: 0.5 },
        })
        // Plain runs carry the spacing; a bold run that also did would bold the space and, worse,
        // hide a missing one from review.
        for (const seg of out.filter((s) => s.bold)) expect(seg.text).toBe(seg.text.trim())
    })

    it('renders as prose with no space before punctuation', () => {
        // The bug the old markup had: Vue condensed the whitespace around each <span> into a
        // space, rendering "Clue cell , which it".
        const out = build({
            step: step({ predicted_class: 'GU', probs: [0, 0.6, 0.45, 0, 0] }),
            isStaff: true,
            segment: { present: true, count: 2, confidence: 0.5 },
        })
        expect(text(out)).not.toMatch(/ [,.]/)
    })

    describe('the alternative-possibility block', () => {
        const close = step({ predicted_class: 'BV', probs: [0, 0, 0.6, 0, 0.45] })

        it('is absent on a confident call', () => {
            expect(text(build())).not.toContain('Alternative possibility')
        })

        it('gives staff the alternative by name', () => {
            const out = build({ step: close, isStaff: true })
            expect(text(out)).toContain('Alternative possibility')
            expect(text(out)).toContain('Vaginal candidiasis')
        })

        it('gives students the discriminating morphology, never the name', () => {
            const out = build({ step: close, isStaff: false })
            expect(text(out)).toContain('Alternative possibility')
            expect(text(out)).toContain('Pseudohyphae / budding yeast')
            expect(text(out)).not.toContain('Vaginal candidiasis')
        })
    })

    describe('the fungal segmentation pass', () => {
        it('says nothing was run', () => {
            expect(text(build())).toContain('No fungal segmentation was run')
        })

        it('reports outlined elements with the strongest confidence', () => {
            const out = build({ segment: { present: true, count: 3, confidence: 0.812 } })
            expect(text(out)).toContain('81% confidence on the strongest')
            expect(out.filter((s) => s.bold).map((s) => s.text)).toContain('3')
        })

        it('reports a clean field as an answer, not a failure', () => {
            const out = build({ segment: { present: true, count: 0, confidence: 0 } })
            expect(text(out)).toContain('bacterial and cellular rather than fungal')
        })
    })

    describe('role', () => {
        /**
         * THE REGRESSION GUARD (ML-ADR-001). Whatever else changes about this copy, a student
         * must not be able to read the diagnosis off it.
         */
        it.each(Object.keys(CLASS_SUMMARIES))(
            'never leaks a diagnosis name to a student, for %s',
            (code) => {
                const out = build({
                    step: step({ predicted_class: code, probs: [0, 0, 0.6, 0, 0.45] }),
                    isStaff: false,
                })
                const body = text(out)
                for (const name of Object.values(DISPLAY_TEXT)) {
                    expect(body, `leaked ${name}`).not.toContain(name)
                }
            },
        )

        it('gives staff the classification outright, and last', () => {
            const out = build({ isStaff: true })
            expect(text(out)).toContain('Bacterial vaginosis')
            expect(out.at(-1)?.text).toBe('.')
            expect(out.at(-2)?.text).toBe('Bacterial vaginosis')
        })

        it('omits the staff line when the manifest has no name for the class', () => {
            const out = build({ isStaff: true, displayText: {} })
            expect(text(out)).not.toContain('Model’s classification')
        })
    })
})
