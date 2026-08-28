import { describe, expect, it } from 'vitest'
import {
    CLASS_COLORS,
    buildClasses,
    classColorAt,
    classForDigit,
    colorForShape,
    mergeClassLabels,
} from './annotationClasses'
import type { Shape } from './annotationShapes'

const shape = (label: string, id = label): Shape => ({
    id,
    label,
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

describe('mergeClassLabels', () => {
    it('appends new labels at the end', () => {
        expect(mergeClassLabels(['clue cell'], [shape('WBC')])).toEqual(['clue cell', 'WBC'])
    })

    /** The contract the colours depend on. */
    it('never reorders what it already knows, so a class keeps its colour', () => {
        const known = ['zebra', 'apple']
        const merged = mergeClassLabels(known, [shape('banana')])
        expect(merged).toEqual(['zebra', 'apple', 'banana'])
        expect(classColorAt(merged.indexOf('zebra'))).toBe(classColorAt(0))
    })

    it('does not duplicate a label already known', () => {
        expect(mergeClassLabels(['WBC'], [shape('WBC'), shape('WBC', 'b')])).toEqual(['WBC'])
    })

    it('ignores blank and whitespace labels, which are unfinished shapes not classes', () => {
        expect(mergeClassLabels([], [shape(''), shape('   ')])).toEqual([])
    })

    it('trims, so " WBC" does not become a second class', () => {
        expect(mergeClassLabels(['WBC'], [shape(' WBC ')])).toEqual(['WBC'])
    })
})

describe('buildClasses', () => {
    it('counts the shapes carrying each class', () => {
        const classes = buildClasses(['WBC', 'clue cell'], [shape('WBC'), shape('WBC', 'b')])
        expect(classes.map((c) => [c.label, c.count])).toEqual([
            ['WBC', 2],
            ['clue cell', 0],
        ])
    })

    it('gives each class its position and colour', () => {
        const [first, second] = buildClasses(['a', 'b'], [])
        expect(first).toMatchObject({ index: 0, color: CLASS_COLORS[0] })
        expect(second).toMatchObject({ index: 1, color: CLASS_COLORS[1] })
    })
})

describe('colorForShape', () => {
    it('is the class colour for a known label', () => {
        expect(colorForShape(['a', 'b'], shape('b'))).toBe(CLASS_COLORS[1])
    })

    it('is null for an unlabelled shape, which gets its own treatment', () => {
        expect(colorForShape(['a'], shape(''))).toBeNull()
    })

    it('is null for a label not in the list rather than guessing a colour', () => {
        expect(colorForShape(['a'], shape('unknown'))).toBeNull()
    })
})

describe('classForDigit', () => {
    const classes = buildClasses(['a', 'b', 'c'], [])

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
