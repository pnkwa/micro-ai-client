import { describe, expect, it } from 'vitest'
import {
    formatMetadataValue,
    humanizeMetadataKey,
    isReservedMetadataKey,
    metadataEntries,
    metadataPatch,
    metadataTitle,
    toMetadataDrafts,
} from './imageMetadata'

// The BE-ADR-032 authoring hint, in the shape the server actually stores it.
const verdict = {
    value: 'partial',
    model: 'best_5class_v2',
    detection_id: 91,
    note: null,
    by: 7,
    at: '2026-08-20T10:00:00.000Z',
}

describe('humanizeMetadataKey', () => {
    it.each([
        ['title', 'Title'],
        ['exif_capture_time', 'Exif capture time'],
        ['capture-device', 'Capture device'],
        ['stain__method', 'Stain method'],
    ])('reads %s as %s', (key, expected) => {
        expect(humanizeMetadataKey(key)).toBe(expected)
    })

    it('leaves a key it cannot improve alone', () => {
        expect(humanizeMetadataKey('_')).toBe('_')
    })
})

describe('formatMetadataValue', () => {
    it.each([
        ['a string', 'Budding yeast', 'Budding yeast'],
        ['a number', 400, '400'],
        ['a boolean', true, 'true'],
        ['zero', 0, '0'],
        ['false', false, 'false'],
    ])('renders %s', (_name, value, expected) => {
        expect(formatMetadataValue(value)).toBe(expected)
    })

    it.each([
        ['null', null],
        ['undefined', undefined],
    ])('renders %s as empty rather than as the word', (_name, value) => {
        expect(formatMetadataValue(value)).toBe('')
    })

    it('renders an object as JSON, because the bag can hold one', () => {
        expect(formatMetadataValue({ a: 1 })).toBe('{"a":1}')
    })
})

describe('isReservedMetadataKey', () => {
    it('reserves verdict, which PATCH refuses with a 400', () => {
        expect(isReservedMetadataKey('verdict')).toBe(true)
    })

    it.each(['title', 'notes', 'verdict_note'])('does not reserve %s', (key) => {
        expect(isReservedMetadataKey(key)).toBe(false)
    })
})

describe('metadataEntries', () => {
    it.each([
        ['null', null],
        ['undefined', undefined],
        ['an empty bag', {}],
    ])('returns nothing for %s', (_name, metadata) => {
        expect(metadataEntries(metadata)).toEqual([])
    })

    it('sorts title first, then the rest alphabetically, then the reserved keys', () => {
        const entries = metadataEntries({
            verdict,
            stain: 'Gram',
            title: 'Budding yeast, 400x',
            magnification: 400,
        })
        expect(entries.map((e) => e.key)).toEqual(['title', 'magnification', 'stain', 'verdict'])
    })

    it('marks only the reserved key as reserved', () => {
        const entries = metadataEntries({ title: 'x', verdict })
        expect(entries.map((e) => [e.key, e.reserved])).toEqual([
            ['title', false],
            ['verdict', true],
        ])
    })

    it('labels and formats each entry', () => {
        expect(metadataEntries({ exif_capture_time: '2026-08-01' })[0]).toEqual({
            key: 'exif_capture_time',
            label: 'Exif capture time',
            value: '2026-08-01',
            reserved: false,
        })
    })
})

describe('metadataTitle', () => {
    it('reads the title', () => {
        expect(metadataTitle({ title: 'Clue cells' })).toBe('Clue cells')
    })

    it.each([
        ['a missing bag', null],
        ['a bag without one', { stain: 'Gram' }],
        ['a blank string', { title: '   ' }],
        ['a non-string', { title: 42 }],
    ])('has no title for %s', (_name, metadata) => {
        expect(metadataTitle(metadata as Record<string, unknown>)).toBeNull()
    })
})

describe('toMetadataDrafts', () => {
    it('drops the reserved key, so the form cannot send what PATCH refuses', () => {
        expect(toMetadataDrafts({ title: 'x', verdict })).toEqual([{ key: 'title', value: 'x' }])
    })
})

describe('metadataPatch', () => {
    it('is null when nothing moved, so the caller can skip the request', () => {
        expect(metadataPatch({ title: 'x' }, [{ key: 'title', value: 'x' }])).toBeNull()
    })

    it('sends only the key that changed', () => {
        const patch = metadataPatch({ title: 'old', stain: 'Gram' }, [
            { key: 'title', value: 'new' },
            { key: 'stain', value: 'Gram' },
        ])
        expect(patch).toEqual({ title: 'new' })
    })

    it('sends a new key', () => {
        expect(metadataPatch({}, [{ key: 'stain', value: 'Gram' }])).toEqual({ stain: 'Gram' })
    })

    it('sends null to delete a key the drafts dropped', () => {
        expect(
            metadataPatch({ title: 'x', stain: 'Gram' }, [{ key: 'title', value: 'x' }]),
        ).toEqual({ stain: null })
    })

    it('never sends the reserved key, even when it is the only difference', () => {
        expect(metadataPatch({ verdict }, [])).toBeNull()
    })

    it('never sends the reserved key when a draft tries to set it', () => {
        expect(metadataPatch({}, [{ key: 'verdict', value: 'correct' }])).toBeNull()
    })

    it('ignores a half-typed row with no key yet', () => {
        expect(metadataPatch({}, [{ key: '   ', value: 'orphan' }])).toBeNull()
    })

    it('trims a key before comparing, so whitespace is not a change', () => {
        expect(metadataPatch({ title: 'x' }, [{ key: ' title ', value: 'x' }])).toBeNull()
    })

    it('keeps the last value when a key is duplicated', () => {
        expect(
            metadataPatch({}, [
                { key: 'stain', value: 'first' },
                { key: 'stain', value: 'second' },
            ]),
        ).toEqual({ stain: 'second' })
    })

    it('compares against the FORMATTED original, so a number typed back unchanged is not a write', () => {
        expect(
            metadataPatch({ magnification: 400 }, [{ key: 'magnification', value: '400' }]),
        ).toBeNull()
    })

    it('clears a value to empty rather than deleting the key', () => {
        expect(metadataPatch({ title: 'x' }, [{ key: 'title', value: '' }])).toEqual({ title: '' })
    })

    it('treats a missing bag as empty', () => {
        expect(metadataPatch(null, [{ key: 'title', value: 'x' }])).toEqual({ title: 'x' })
    })
})
