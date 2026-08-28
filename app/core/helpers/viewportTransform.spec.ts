import { describe, expect, it } from 'vitest'
import {
    MAX_SCALE,
    MIN_SCALE,
    safeScale,
    clampPan,
    clampScale,
    fitScale,
    fitTransform,
    panBy,
    toImagePoint,
    toNormalizedPoint,
    toScreenPoint,
    zoomAt,
    zoomByStep,
    zoomPercent,
} from './viewportTransform'

// A landscape image in a square viewport, so fit is decided by the WIDE axis and the two axes
// cannot accidentally agree - which is what hides a transposed w/h.
const natural = { w: 800, h: 400 }
const viewport = { w: 400, h: 400 }
// fitScale = min(400/800, 400/400) = 0.5

describe('fitScale', () => {
    it('contains rather than covers: the narrow axis letterboxes', () => {
        expect(fitScale(natural, viewport)).toBe(0.5)
    })

    it('scales a small image UP to fill the frame', () => {
        expect(fitScale({ w: 100, h: 100 }, viewport)).toBe(4)
    })

    it.each([
        ['no image', { w: 0, h: 0 }, viewport],
        ['no viewport', natural, { w: 0, h: 0 }],
    ])('falls back to 1 with %s', (_name, n, v) => {
        expect(fitScale(n, v)).toBe(1)
    })
})

describe('clampScale', () => {
    it('floors at fit, so the image is never stranded inside the frame', () => {
        expect(clampScale(0.1, 0.5)).toBe(0.5)
    })

    it('ceilings at MAX_SCALE', () => {
        expect(clampScale(1000, 0.5)).toBe(MAX_SCALE)
    })

    it('leaves a scale between the two alone', () => {
        expect(clampScale(2, 0.5)).toBe(2)
    })
})

describe('clampPan', () => {
    it('locks to centre while the image fits, whatever offset it is handed', () => {
        expect(clampPan(natural, viewport, { scale: 0.5, x: 999, y: -999 })).toEqual({
            x: 0,
            y: 0,
        })
    })

    it('allows exactly the overhang once the image is bigger than the viewport', () => {
        // At scale 1 the image is 800x400 in a 400x400 box: 400px of horizontal overhang, half
        // of it on each side, and none vertically.
        expect(clampPan(natural, viewport, { scale: 1, x: 500, y: 500 })).toEqual({
            x: 200,
            y: 0,
        })
        expect(clampPan(natural, viewport, { scale: 1, x: -500, y: 0 })).toEqual({
            x: -200,
            y: 0,
        })
    })

    it('normalises negative zero, which Object.is would otherwise report as a change', () => {
        const { x } = clampPan(natural, viewport, { scale: 0.5, x: -10, y: 0 })
        expect(Object.is(x, -0)).toBe(false)
    })
})

describe('toImagePoint', () => {
    it('maps the viewport centre to the image centre when centred', () => {
        expect(
            toImagePoint(natural, viewport, fitTransform(natural, viewport), { x: 200, y: 200 }),
        ).toEqual({ x: 400, y: 200 })
    })

    it('maps the top-left of a fitted image to its first pixel', () => {
        // At fit the image is 400x200, letterboxed vertically: it starts at y = 100.
        expect(
            toImagePoint(natural, viewport, fitTransform(natural, viewport), { x: 0, y: 100 }),
        ).toEqual({ x: 0, y: 0 })
    })

    it('does NOT clamp, so a drag off the picture reports where it went', () => {
        const point = toImagePoint(natural, viewport, fitTransform(natural, viewport), {
            x: -50,
            y: 0,
        })
        expect(point.x).toBeLessThan(0)
    })
})

describe('toNormalizedPoint', () => {
    it('returns the [0,1] space the API stores', () => {
        expect(
            toNormalizedPoint(natural, viewport, fitTransform(natural, viewport), {
                x: 200,
                y: 200,
            }),
        ).toEqual({ x: 0.5, y: 0.5 })
    })

    it('DOES clamp, because a stored annotation outside the picture cannot be true', () => {
        const point = toNormalizedPoint(natural, viewport, fitTransform(natural, viewport), {
            x: -500,
            y: 9999,
        })
        expect(point).toEqual({ x: 0, y: 1 })
    })
})

describe('zoomAt', () => {
    it('holds the point under the cursor still, which is the whole point', () => {
        // A SQUARE source here, so zooming in leaves slack on both axes and the anchor is
        // actually reachable. The landscape fixture used elsewhere has no vertical slack at all,
        // which is a different property - see the clamp test below.
        const square = { w: 800, h: 800 }
        const before = fitTransform(square, viewport)
        const cursor = { x: 120, y: 160 }
        const anchor = toImagePoint(square, viewport, before, cursor)

        const after = zoomAt(square, viewport, before, 2, cursor)
        const moved = toImagePoint(square, viewport, after, cursor)

        expect(after.scale).toBe(1)
        expect(moved.x).toBeCloseTo(anchor.x, 6)
        expect(moved.y).toBeCloseTo(anchor.y, 6)
    })

    /**
     * The priority when the two rules disagree, which they do on any axis with no overhang.
     *
     * Holding the cursor's point still would require an offset the clamp forbids, and the clamp
     * wins: letting the anchor win would expose an edge, and a shape drawn against an image whose
     * border has drifted off-screen is placed by guesswork. Pinned because it is a real trade-off
     * rather than an accident, and the obvious "anchor is always preserved" test fails on it.
     */
    it('lets the pan clamp win on an axis with no slack, rather than exposing an edge', () => {
        const cursor = { x: 120, y: 160 }
        // Landscape in a square viewport: at scale 1 there is horizontal overhang and no vertical.
        const after = zoomAt(natural, viewport, fitTransform(natural, viewport), 2, cursor)

        expect(after.y).toBe(0)
        expect(after).toEqual({ ...after, ...clampPan(natural, viewport, after) })
    })

    it('returns the SAME transform when the zoom is clamped away', () => {
        const fitted = fitTransform(natural, viewport)
        expect(zoomAt(natural, viewport, fitted, 0.5, { x: 0, y: 0 })).toBe(fitted)
    })

    it('never exceeds the ceiling', () => {
        const zoomed = zoomAt(natural, viewport, { scale: 8, x: 0, y: 0 }, 100, { x: 0, y: 0 })
        expect(zoomed.scale).toBe(MAX_SCALE)
    })

    it('leaves the result within the pan bounds', () => {
        const zoomed = zoomAt(natural, viewport, fitTransform(natural, viewport), 2, { x: 0, y: 0 })
        expect(zoomed).toEqual({ ...zoomed, ...clampPan(natural, viewport, zoomed) })
    })
})

describe('zoomByStep', () => {
    it('zooms about the centre, so a centred image stays centred', () => {
        const stepped = zoomByStep(natural, viewport, fitTransform(natural, viewport), 2)
        expect(stepped).toEqual({ scale: 1, x: 0, y: 0 })
    })
})

describe('panBy', () => {
    it('moves by the delta while there is slack', () => {
        expect(panBy(natural, viewport, { scale: 1, x: 0, y: 0 }, { x: 50, y: 0 })).toEqual({
            scale: 1,
            x: 50,
            y: 0,
        })
    })

    it('refuses to expose an edge', () => {
        expect(panBy(natural, viewport, { scale: 1, x: 0, y: 0 }, { x: 9999, y: 9999 })).toEqual({
            scale: 1,
            x: 200,
            y: 0,
        })
    })

    it('cannot move an image that fits', () => {
        expect(panBy(natural, viewport, fitTransform(natural, viewport), { x: 40, y: 40 })).toEqual(
            {
                scale: 0.5,
                x: 0,
                y: 0,
            },
        )
    })
})

describe('zoomPercent', () => {
    it.each([
        [1, 100],
        [0.5, 50],
        [2.004, 200],
    ])('reads scale %s as %s%%', (scale, expected) => {
        expect(zoomPercent({ scale, x: 0, y: 0 })).toBe(expected)
    })
})

describe('toScreenPoint', () => {
    const fitted = fitTransform(natural, viewport)

    it('round-trips with toNormalizedPoint', () => {
        const screen = { x: 137, y: 208 }
        const back = toScreenPoint(
            natural,
            viewport,
            fitted,
            toNormalizedPoint(natural, viewport, fitted, screen),
        )
        expect(back.x).toBeCloseTo(screen.x, 6)
        expect(back.y).toBeCloseTo(screen.y, 6)
    })

    it('puts the image centre at the viewport centre when centred', () => {
        const point = toScreenPoint(natural, viewport, fitted, { x: 0.5, y: 0.5 })
        expect(point.x).toBeCloseTo(200, 10)
        expect(point.y).toBeCloseTo(200, 10)
    })

    it('accounts for the letterbox: a fitted landscape image starts below the top edge', () => {
        // 800x400 fitted into 400x400 paints 400x200, so the top edge sits at y = 100.
        const point = toScreenPoint(natural, viewport, fitted, { x: 0, y: 0 })
        expect(point.x).toBeCloseTo(0, 10)
        expect(point.y).toBeCloseTo(100, 10)
    })

    it('follows the pan', () => {
        const panned = { ...fitted, scale: 1, x: 30, y: -20 }
        const point = toScreenPoint(natural, viewport, panned, { x: 0.5, y: 0.5 })
        expect(point.x).toBeCloseTo(230, 10)
        expect(point.y).toBeCloseTo(180, 10)
    })
})

describe('safeScale', () => {
    /**
     * The guard that exists because a zero scale blanked the whole canvas: every downstream
     * division by it yields Infinity or NaN, and the symptom is a black void with no error.
     */
    it.each([
        ['zero', 0],
        ['negative', -3],
        ['NaN', NaN],
        ['Infinity', Infinity],
        ['-Infinity', -Infinity],
    ])('falls back to 1 for %s', (_name, value) => {
        expect(safeScale(value)).toBe(1)
    })

    it('clamps into the usable range', () => {
        expect(safeScale(0.0001)).toBe(MIN_SCALE)
        expect(safeScale(1000)).toBe(MAX_SCALE)
    })

    it('leaves an ordinary scale alone', () => {
        expect(safeScale(0.37)).toBe(0.37)
    })
})

describe('fitScale guards', () => {
    it('never returns a scale that cannot paint, whatever it is handed', () => {
        for (const viewport of [
            { w: 0, h: 0 },
            { w: 400, h: 0 },
            { w: NaN, h: 400 },
        ]) {
            const scale = fitScale({ w: 800, h: 400 }, viewport)
            expect(Number.isFinite(scale)).toBe(true)
            expect(scale).toBeGreaterThan(0)
        }
    })
})
