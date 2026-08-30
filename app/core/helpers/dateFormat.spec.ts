import { describe, expect, it } from 'vitest'
import { formatDay, formatDayShort, formatDayTime } from './dateFormat'

describe('formatDay', () => {
    it('spells the month, so a slashed date can never be read the wrong way round', () => {
        expect(formatDay('2026-08-29T14:02:00.000Z')).toBe('29 Aug 2026')
    })

    it('is empty for anything unparseable rather than rendering "Invalid Date"', () => {
        expect(formatDay('not a date')).toBe('')
        expect(formatDay(null)).toBe('')
        expect(formatDay(undefined)).toBe('')
        expect(formatDay('')).toBe('')
    })
})

describe('formatDayShort', () => {
    const now = new Date('2026-08-30T00:00:00.000Z')

    it('drops the year within the current one, where it is noise', () => {
        expect(formatDayShort('2026-08-29T14:02:00.000Z', now)).toBe('29 Aug')
    })

    it('keeps the year on anything older, where it is the fact that matters', () => {
        expect(formatDayShort('2025-11-04T14:02:00.000Z', now)).toBe('4 Nov 2025')
    })

    it('is empty for anything unparseable', () => {
        expect(formatDayShort('nope', now)).toBe('')
    })
})

describe('formatDayTime', () => {
    it('appends a 24-hour clock', () => {
        // Asserted in UTC: the runner's zone would otherwise decide the hour.
        const formatted = formatDayTime('2026-08-29T14:02:00.000Z')
        expect(formatted).toMatch(/^29 Aug 2026, \d{2}:\d{2}$/)
    })

    it('is empty for anything unparseable', () => {
        expect(formatDayTime(null)).toBe('')
    })
})
