import { describe, expect, it } from 'vitest'
import {
    duplicateNote,
    imageDisplayName,
    sanitizeTitle,
    splitExtension,
    titleError,
    titleFromFilename,
    TITLE_MAX,
} from './imageName'

describe('splitExtension', () => {
    it('splits a real extension so it can be shown outside the input', () => {
        expect(splitExtension('IMG_0417.png')).toEqual({ base: 'IMG_0417', ext: '.png' })
    })

    it('leaves a full stop mid-name alone, which is not an extension', () => {
        expect(splitExtension('Slide 14. Gram stain')).toEqual({
            base: 'Slide 14. Gram stain',
            ext: '',
        })
    })

    it('does not treat a leading dot as an extension', () => {
        expect(splitExtension('.hidden')).toEqual({ base: '.hidden', ext: '' })
    })

    it('takes only the LAST suffix', () => {
        expect(splitExtension('scan.2026.tiff')).toEqual({ base: 'scan.2026', ext: '.tiff' })
    })

    it('has no extension to offer when there is none', () => {
        expect(splitExtension('IMG_0417')).toEqual({ base: 'IMG_0417', ext: '' })
    })
})

describe('titleFromFilename', () => {
    it('is the filename without its extension', () => {
        expect(titleFromFilename('IMG_0417.png')).toBe('IMG_0417')
    })

    it('strips path punctuation a filename should never have carried', () => {
        expect(titleFromFilename('week3/slide:14.jpg')).toBe('week3slide14')
    })

    it('survives a file with no extension', () => {
        expect(titleFromFilename('capture')).toBe('capture')
    })
})

describe('imageDisplayName', () => {
    it('is the title when there is one', () => {
        expect(imageDisplayName({ title: 'Slide 14' }, 42)).toBe('Slide 14')
    })

    /** The fallback the annotator already used, now shared, so five surfaces cannot disagree. */
    it('falls back to IMG_ plus the id', () => {
        expect(imageDisplayName(null, 42)).toBe('IMG_42')
        expect(imageDisplayName({}, 42)).toBe('IMG_42')
    })

    it('treats a blank title as absent', () => {
        expect(imageDisplayName({ title: '   ' }, 42)).toBe('IMG_42')
    })
})

describe('sanitizeTitle', () => {
    it('trims and caps', () => {
        expect(sanitizeTitle('  IMG_0417  ')).toBe('IMG_0417')
        expect(sanitizeTitle('a'.repeat(TITLE_MAX + 40))).toHaveLength(TITLE_MAX)
    })
})

describe('titleError', () => {
    it('refuses a name that is empty once cleaned', () => {
        expect(titleError('   ')).not.toBeNull()
        expect(titleError('///')).not.toBeNull()
    })

    it('refuses a name past the cap', () => {
        expect(titleError('a'.repeat(TITLE_MAX + 1))).not.toBeNull()
    })

    it('accepts an ordinary name', () => {
        expect(titleError('IMG_0417')).toBeNull()
    })
})

describe('duplicateNote', () => {
    /** A note, never a refusal: the id is the identity and two slides can share a name. */
    it('mentions a name already in use, matched case-insensitively', () => {
        expect(duplicateNote('img_0412', ['IMG_0412', 'IMG_0413'])).toContain('img_0412')
    })

    it('is silent when the name is free', () => {
        expect(duplicateNote('IMG_9999', ['IMG_0412'])).toBeNull()
    })

    it('is silent for an empty name, which has its own error', () => {
        expect(duplicateNote('  ', ['IMG_0412'])).toBeNull()
    })
})
