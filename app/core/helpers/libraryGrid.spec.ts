import { describe, expect, it } from 'vitest'
import { gridMetrics } from './libraryGrid'

describe('gridMetrics', () => {
    it('gives each layout its own card, gap, padding and footer', () => {
        expect(gridMetrics('full')).toEqual({ col: 208, gap: 16, pad: 20, footer: 44 })
        expect(gridMetrics('medium')).toEqual({ col: 140, gap: 14, pad: 16, footer: 44 })
        expect(gridMetrics('compact')).toEqual({ col: 116, gap: 10, pad: 12, footer: 40 })
    })

    it('shrinks monotonically as the screen does', () => {
        const full = gridMetrics('full')
        const medium = gridMetrics('medium')
        const compact = gridMetrics('compact')
        expect(medium.col).toBeLessThan(full.col)
        expect(compact.col).toBeLessThan(medium.col)
        expect(compact.pad).toBeLessThan(medium.pad)
        expect(medium.pad).toBeLessThan(full.pad)
    })
})
