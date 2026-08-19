import { describe, expect, it } from 'vitest'
import { clampOffset, coverScale, cropRect, isUntouched } from './imageCrop'

const square = { w: 1000, h: 1000 }
const wide = { w: 2000, h: 1000 }
const tall = { w: 1000, h: 2000 }
const SIZE = 400

describe('coverScale', () => {
    it('fits the short side, so the window is always covered', () => {
        expect(coverScale(square, SIZE)).toBeCloseTo(0.4)
        expect(coverScale(wide, SIZE)).toBeCloseTo(0.4) // height is the short side
        expect(coverScale(tall, SIZE)).toBeCloseTo(0.4) // width is
    })

    it('does not divide by zero before the image has measured', () => {
        expect(coverScale({ w: 0, h: 0 }, SIZE)).toBe(1)
        expect(coverScale(square, 0)).toBe(1)
    })
})

describe('clampOffset', () => {
    it('pins a source that exactly covers, leaving nothing to pan', () => {
        const t = { scale: 0.4, x: 120, y: -80 }
        expect(clampOffset(square, SIZE, t)).toEqual({ x: 0, y: 0 })
    })

    it('allows panning along the overhanging axis only', () => {
        // wide at cover: drawn 800x400, so 200px of slack each side horizontally, none vertically.
        const t = { scale: 0.4, x: 500, y: 500 }
        expect(clampOffset(wide, SIZE, t)).toEqual({ x: 200, y: 0 })
    })

    it('clamps symmetrically in the negative direction', () => {
        expect(clampOffset(wide, SIZE, { scale: 0.4, x: -500, y: 0 }).x).toBe(-200)
    })

    it('leaves an offset inside the slack untouched', () => {
        expect(clampOffset(wide, SIZE, { scale: 0.4, x: 75, y: 0 }).x).toBe(75)
    })
})

describe('cropRect', () => {
    it('selects the whole image when it exactly covers a square source', () => {
        expect(cropRect(square, SIZE, { scale: 0.4, x: 0, y: 0 })).toEqual({
            sx: 0,
            sy: 0,
            side: 1000,
        })
    })

    it('selects the centre square of a wide source', () => {
        expect(cropRect(wide, SIZE, { scale: 0.4, x: 0, y: 0 })).toEqual({
            sx: 500,
            sy: 0,
            side: 1000,
        })
    })

    /** Dragging the image right shows what was to its left, so the source rect moves left. */
    it('moves the source rect opposite the drag', () => {
        const right = cropRect(wide, SIZE, { scale: 0.4, x: 200, y: 0 })
        expect(right.sx).toBe(0)
        const left = cropRect(wide, SIZE, { scale: 0.4, x: -200, y: 0 })
        expect(left.sx).toBe(1000)
    })

    it('takes a smaller region as the user zooms in', () => {
        expect(cropRect(square, SIZE, { scale: 0.8, x: 0, y: 0 }).side).toBe(500)
        expect(cropRect(square, SIZE, { scale: 1.6, x: 0, y: 0 }).side).toBe(250)
    })

    /** The guarantee the canvas depends on: never ask for a pixel outside the source. */
    it('never selects outside the image, at any pan or zoom', () => {
        for (const nat of [square, wide, tall]) {
            for (const scale of [0.4, 0.55, 1, 2.5]) {
                for (const x of [-5000, -200, 0, 200, 5000]) {
                    for (const y of [-5000, -200, 0, 200, 5000]) {
                        const t = { scale, ...clampOffset(nat, SIZE, { scale, x, y }) }
                        const r = cropRect(nat, SIZE, t)
                        expect(r.sx).toBeGreaterThanOrEqual(0)
                        expect(r.sy).toBeGreaterThanOrEqual(0)
                        expect(r.sx + r.side).toBeLessThanOrEqual(nat.w)
                        expect(r.sy + r.side).toBeLessThanOrEqual(nat.h)
                    }
                }
            }
        }
    })

    it('stays square whatever the source shape', () => {
        for (const nat of [square, wide, tall]) {
            const r = cropRect(nat, SIZE, { scale: 0.6, x: 10, y: -10 })
            expect(r.side).toBe(Math.min(Math.round(SIZE / 0.6), nat.w, nat.h))
        }
    })
})

describe('isUntouched', () => {
    it('is true for a square source sitting exactly as it arrived', () => {
        expect(isUntouched(square, SIZE, { scale: 0.4, x: 0, y: 0 })).toBe(true)
    })

    it('is false once panned or zoomed', () => {
        expect(isUntouched(square, SIZE, { scale: 0.4, x: 12, y: 0 })).toBe(false)
        expect(isUntouched(square, SIZE, { scale: 0.9, x: 0, y: 0 })).toBe(false)
    })

    /** A non-square source is always cropped, even sitting still - that is the point of the window. */
    it('is false for a non-square source even untouched', () => {
        expect(isUntouched(wide, SIZE, { scale: 0.4, x: 0, y: 0 })).toBe(false)
        expect(isUntouched(tall, SIZE, { scale: 0.4, x: 0, y: 0 })).toBe(false)
    })
})
