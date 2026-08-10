import { describe, expect, it } from 'vitest'
import { compareSlideNumbers, isValidSlideNumber, normalizeSlideNumber } from './slideNumber'

/**
 * MIRROR TEST. These cases are deliberately identical to
 * micro-ai-server/src/slide-collections/slide-number.spec.ts.
 *
 * The normalizer is hand-mirrored across the two repos (there is no shared package), so the only
 * thing standing between them and a silent divergence is that both sides assert the same table.
 * A student's label has to canonicalize the same way here as it does at grade time, or the lookup
 * misses and a correct answer is marked wrong with nothing logged. Change one file, change both.
 */
describe('normalizeSlideNumber', () => {
    it.each([
        ['Slide V7', 'V7'],
        ['slide v7', 'V7'],
        ['Slide  V7', 'V7'],
        [' v7 ', 'V7'],
        ['V7', 'V7'],
        ['v 7', 'V7'],
        ['V07', 'V7'],
        ['V007', 'V7'],
    ])('%s -> %s', (raw, expected) => {
        expect(normalizeSlideNumber(raw)).toBe(expected)
    })

    it('keeps bare numbers, stripping leading zeros', () => {
        expect(normalizeSlideNumber('7')).toBe('7')
        expect(normalizeSlideNumber('07')).toBe('7')
        expect(normalizeSlideNumber(7)).toBe('7')
        expect(normalizeSlideNumber('0')).toBe('0')
    })

    it('keeps multi-letter prefixes and a letter suffix', () => {
        expect(normalizeSlideNumber('VVC12')).toBe('VVC12')
        expect(normalizeSlideNumber('G3A')).toBe('G3A')
        expect(normalizeSlideNumber('g03a')).toBe('G3A')
    })

    it('returns null for anything unusable', () => {
        expect(normalizeSlideNumber(null)).toBeNull()
        expect(normalizeSlideNumber(undefined)).toBeNull()
        expect(normalizeSlideNumber('')).toBeNull()
        expect(normalizeSlideNumber('   ')).toBeNull()
        expect(normalizeSlideNumber('Slide')).toBeNull()
        expect(normalizeSlideNumber('abc!')).toBeNull()
        expect(normalizeSlideNumber('V7-B')).toBeNull()
        expect(normalizeSlideNumber('TOOLONG12')).toBeNull()
        expect(normalizeSlideNumber('V12345')).toBeNull()
    })

    it('is idempotent: normalizing an already-normal label changes nothing', () => {
        for (const label of ['V7', '7', 'VVC12', 'G3A', '0']) {
            expect(normalizeSlideNumber(label)).toBe(label)
        }
    })

    it('matches a student typing v7 to a key stored as V7', () => {
        expect(normalizeSlideNumber('v7')).toBe(normalizeSlideNumber('Slide V7'))
        expect(normalizeSlideNumber(' V07 ')).toBe(normalizeSlideNumber('v7'))
    })
})

describe('isValidSlideNumber', () => {
    it('tracks normalizeSlideNumber', () => {
        expect(isValidSlideNumber('Slide V7')).toBe(true)
        expect(isValidSlideNumber(7)).toBe(true)
        expect(isValidSlideNumber('')).toBe(false)
        expect(isValidSlideNumber('abc!')).toBe(false)
    })
})

describe('compareSlideNumbers', () => {
    it('orders numerically within a prefix, not lexicographically', () => {
        expect(['V10', 'V2', 'V1'].sort(compareSlideNumbers)).toEqual(['V1', 'V2', 'V10'])
    })

    it('orders bare numbers numerically', () => {
        expect(['10', '2', '1'].sort(compareSlideNumbers)).toEqual(['1', '2', '10'])
    })

    it('orders by letter prefix first, then number', () => {
        expect(['V2', 'G3', 'V1', 'G10'].sort(compareSlideNumbers)).toEqual([
            'G3',
            'G10',
            'V1',
            'V2',
        ])
    })

    it('puts unprefixed labels before prefixed ones', () => {
        expect(['V1', '2'].sort(compareSlideNumbers)).toEqual(['2', 'V1'])
    })

    it('breaks ties on the letter suffix', () => {
        expect(['V7B', 'V7A', 'V7'].sort(compareSlideNumbers)).toEqual(['V7', 'V7A', 'V7B'])
    })

    it('is 0 for equal labels', () => {
        expect(compareSlideNumbers('V7', 'V7')).toBe(0)
    })
})
