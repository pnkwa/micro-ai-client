import { describe, expect, it } from 'vitest'
import {
    CLASS_COLORS,
    buildClasses,
    classColorAt,
    classForDigit,
    colorForShape,
    colorOf,
    dominantLabelId,
    DEFAULT_REVIEW_BOX_COLOR,
    labelById,
    labelByName,
    reviewBoxColor,
    toColorHex,
} from './annotationClasses'
import type { Shape } from './annotationShapes'
import type { AnnotationLabel } from '~/services/annotationLabelService'

const label = (id: number, text: string, colorHex = 'aabbcc'): AnnotationLabel => ({
    id,
    label: text,
    color_hex: colorHex,
    owner_id: 1,
    created_at: '2026-08-29T00:00:00.000Z',
    updated_at: '2026-08-29T00:00:00.000Z',
})

const shape = (labelId: number | null, id = String(labelId), text = ''): Shape => ({
    id,
    labelId,
    label: text,
    x: 0,
    y: 0,
    w: 0.1,
    h: 0.1,
    polygon: null,
    expert_curated: false,
})

describe('classColorAt', () => {
    it('walks the palette in order', () => {
        expect(classColorAt(0)).toBe(CLASS_COLORS[0])
        expect(classColorAt(4)).toBe(CLASS_COLORS[4])
    })

    it('cycles past the last colour rather than running out', () => {
        expect(classColorAt(5)).toBe(CLASS_COLORS[0])
        expect(classColorAt(12)).toBe(CLASS_COLORS[2])
    })
})

describe('toColorHex and colorOf', () => {
    /** The palette stores bare hex; every render wants the '#'. Getting this backwards is silent. */
    it('strips the hash and lowercases on the way out', () => {
        expect(toColorHex('#7C5CE0')).toBe('7c5ce0')
        expect(toColorHex('7C5CE0')).toBe('7c5ce0')
    })

    it('puts the hash back on the way in', () => {
        expect(colorOf(label(1, 'BV', '7c5ce0'))).toBe('#7c5ce0')
    })

    it('round-trips', () => {
        expect(toColorHex(colorOf(label(1, 'BV', 'd97706')))).toBe('d97706')
    })
})

describe('labelByName', () => {
    const palette = [label(1, 'BV'), label(2, 'TV')]

    /** This is how a box's `label_id` is recovered: the read carries the text, not the id. */
    it('finds a label by its exact text', () => {
        expect(labelByName(palette, 'TV')?.id).toBe(2)
    })

    it('trims what it is given, so a padded name still matches', () => {
        expect(labelByName(palette, ' TV ')?.id).toBe(2)
    })

    /**
     * Exact, not case-insensitive. `UNIQUE(owner_id, label)` is exact too, so folding case here
     * would claim a row the server is perfectly willing to hold alongside another.
     */
    it('does not match on case', () => {
        expect(labelByName(palette, 'tv')).toBeNull()
    })

    it('is null for a blank name and for one nothing holds', () => {
        expect(labelByName(palette, '   ')).toBeNull()
        expect(labelByName(palette, 'GNB')).toBeNull()
    })
})

describe('labelById', () => {
    const palette = [label(1, 'BV'), label(2, 'TV')]

    it('finds a label by id', () => {
        expect(labelById(palette, 2)?.label).toBe('TV')
    })

    it('is null for the unlabeled state rather than throwing', () => {
        expect(labelById(palette, null)).toBeNull()
    })

    it('is null for an id the palette does not hold', () => {
        expect(labelById(palette, 99)).toBeNull()
    })
})

describe('buildClasses', () => {
    const palette = [label(1, 'WBC', '111111'), label(2, 'clue cell', '222222')]

    it('counts the shapes carrying each class', () => {
        const classes = buildClasses(palette, [shape(1), shape(1, 'b')])
        expect(classes.map((c) => [c.label, c.count])).toEqual([
            ['WBC', 2],
            ['clue cell', 0],
        ])
    })

    it('takes each colour from the label rather than from its position', () => {
        const [first, second] = buildClasses(palette, [])
        expect(first).toMatchObject({ id: 1, index: 0, color: '#111111' })
        expect(second).toMatchObject({ id: 2, index: 1, color: '#222222' })
    })

    /** The old list was derived from the shapes; this one is not, so an unknown id adds nothing. */
    it('lists the palette even when the image uses none of it, and ignores ids it does not hold', () => {
        expect(buildClasses(palette, [shape(99)]).map((c) => c.count)).toEqual([0, 0])
    })

    it('does not count unlabelled shapes', () => {
        expect(buildClasses(palette, [shape(null, 'a')]).map((c) => c.count)).toEqual([0, 0])
    })
})

describe('colorForShape', () => {
    const palette = [label(1, 'a', '111111'), label(2, 'b', '222222')]

    it('is the class colour for a shape carrying a known label', () => {
        expect(colorForShape(palette, shape(2))).toBe('#222222')
    })

    it('is null for an unlabelled shape, which gets its own treatment', () => {
        expect(colorForShape(palette, shape(null, 'a'))).toBeNull()
    })

    it('is null for a label not in the palette rather than guessing a colour', () => {
        expect(colorForShape(palette, shape(99))).toBeNull()
    })
})

describe('classForDigit', () => {
    const classes = buildClasses([label(1, 'a'), label(2, 'b'), label(3, 'c')], [])

    it('maps 1 to the first class', () => {
        expect(classForDigit(classes, 1)?.label).toBe('a')
    })

    it.each([0, 10, -1, 1.5])('is null for %s', (digit) => {
        expect(classForDigit(classes, digit)).toBeNull()
    })

    /** Clamping would relabel a shape with a class nobody picked. */
    it('is null past the end of the list rather than clamping to the last', () => {
        expect(classForDigit(classes, 9)).toBeNull()
    })
})

describe('dominantLabelId', () => {
    it('returns the label most of the shapes carry', () => {
        expect(dominantLabelId([shape(1, 'a'), shape(2, 'b'), shape(2, 'c')])).toBe(2)
    })

    it('is null when nothing is labelled, so the caller can keep the current pick', () => {
        expect(dominantLabelId([])).toBeNull()
        expect(dominantLabelId([shape(null, 'a'), shape(null, 'b')])).toBeNull()
    })

    it('ignores unlabelled shapes rather than counting them as a class', () => {
        expect(dominantLabelId([shape(null, 'a'), shape(null, 'b'), shape(1, 'c')])).toBe(1)
    })

    it('keeps the first-seen label on a tie, so a reload does not flip the pick', () => {
        expect(dominantLabelId([shape(1, 'a'), shape(2, 'b')])).toBe(1)
        expect(dominantLabelId([shape(2, 'a'), shape(1, 'b')])).toBe(2)
    })
})

describe('reviewBoxColor', () => {
    // The instructor's own annotation_labels palette: label -> bare six-hex.
    const labelColors = { 'Clue cell': '7c5ce0', Lactobacilli: 'd97706' }

    it("uses the instructor's colour on an exact label match", () => {
        expect(reviewBoxColor('Clue cell', labelColors)).toBe('#7c5ce0')
    })

    it("matches the instructor's palette case-insensitively, trimming whitespace", () => {
        expect(reviewBoxColor('clue CELL', labelColors)).toBe('#7c5ce0')
        expect(reviewBoxColor('  LACTOBACILLI ', labelColors)).toBe('#d97706')
    })

    it('returns the default colour for a label the instructor has no class for', () => {
        expect(reviewBoxColor('epithelial', labelColors)).toBe(DEFAULT_REVIEW_BOX_COLOR)
    })

    it('returns the default colour for an unlabelled box', () => {
        expect(reviewBoxColor(null, labelColors)).toBe(DEFAULT_REVIEW_BOX_COLOR)
        expect(reviewBoxColor('   ', labelColors)).toBe(DEFAULT_REVIEW_BOX_COLOR)
    })
})
