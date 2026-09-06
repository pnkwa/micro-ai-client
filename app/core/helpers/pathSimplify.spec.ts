import { describe, expect, it } from 'vitest'
import { enforceMinSpacing, simplifyPath, smoothClosedPath } from './pathSimplify'

const line = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ x: i / (count - 1), y: 0.5 }))

describe('simplifyPath', () => {
    it('collapses a straight run to its ends', () => {
        expect(simplifyPath(line(50), 0.01)).toEqual([
            { x: 0, y: 0.5 },
            { x: 1, y: 0.5 },
        ])
    })

    /**
     * The property that matters for a traced outline: a corner is the shape, not noise.
     *
     * An L, deliberately, with collinear points along both arms. A first attempt at this test used
     * a Z whose middle point sat exactly ON the chord between the ends - which RDP drops, correctly,
     * keeping the two shoulders that actually bend. The corner has to be off the chord to be a
     * corner at all.
     */
    it('keeps a corner and drops the collinear points either side of it', () => {
        const path = [
            { x: 0, y: 0 },
            { x: 0.5, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 0.5 },
            { x: 1, y: 1 },
        ]
        expect(simplifyPath(path, 0.01)).toEqual([
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
        ])
    })

    it('drops a wobble smaller than the tolerance and keeps one larger', () => {
        const wobble = [
            { x: 0, y: 0 },
            { x: 0.5, y: 0.02 },
            { x: 1, y: 0 },
        ]
        expect(simplifyPath(wobble, 0.05)).toHaveLength(2)
        expect(simplifyPath(wobble, 0.005)).toHaveLength(3)
    })

    it('thins a traced circle to a shape that is still a circle', () => {
        const circle = Array.from({ length: 200 }, (_, i) => {
            const angle = (i / 200) * Math.PI * 2
            return { x: 0.5 + Math.cos(angle) * 0.3, y: 0.5 + Math.sin(angle) * 0.3 }
        })
        const simplified = simplifyPath(circle, 0.004)
        expect(simplified.length).toBeLessThan(40)
        expect(simplified.length).toBeGreaterThan(7)
        // Every kept point is still on the circle: thinning must not move anything.
        for (const point of simplified) {
            expect(Math.hypot(point.x - 0.5, point.y - 0.5)).toBeCloseTo(0.3, 5)
        }
    })

    it('returns short paths and a zero tolerance untouched', () => {
        const two = [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
        ]
        expect(simplifyPath(two, 0.1)).toEqual(two)
        expect(simplifyPath(line(5), 0)).toHaveLength(5)
    })

    it('handles a path that starts and ends in the same place', () => {
        const loop = [
            { x: 0.5, y: 0.5 },
            { x: 0.9, y: 0.5 },
            { x: 0.9, y: 0.9 },
            { x: 0.5, y: 0.5 },
        ]
        expect(simplifyPath(loop, 0.01)).toEqual(loop)
    })
})

describe('smoothClosedPath', () => {
    const square = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
    ]

    it('leaves fewer than three points alone', () => {
        const two = [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
        ]
        expect(smoothClosedPath(two, 2)).toEqual(two)
    })

    it('doubles the vertex count on each pass', () => {
        expect(smoothClosedPath(square, 1)).toHaveLength(8)
        expect(smoothClosedPath(square, 2)).toHaveLength(16)
    })

    it('cuts every corner, so no original sharp vertex survives, and stays inside the hull', () => {
        const smoothed = smoothClosedPath(square, 1)
        for (const corner of square) {
            expect(smoothed.some((p) => p.x === corner.x && p.y === corner.y)).toBe(false)
        }
        // Chaikin points are convex mixes of neighbours, so none escapes the square.
        for (const p of smoothed) {
            expect(p.x).toBeGreaterThanOrEqual(0)
            expect(p.x).toBeLessThanOrEqual(1)
            expect(p.y).toBeGreaterThanOrEqual(0)
            expect(p.y).toBeLessThanOrEqual(1)
        }
    })

    it('rounds the closing seam like any other corner', () => {
        // The wrap-around edge from the last vertex (0,1) back to the first (0,0) is cut too, which
        // is what stops a freehand trace closing on a sharp terminal.
        const smoothed = smoothClosedPath(square, 1)
        expect(smoothed).toContainEqual({ x: 0, y: 0.75 })
        expect(smoothed).toContainEqual({ x: 0, y: 0.25 })
    })
})

describe('enforceMinSpacing', () => {
    it('leaves a three-point ring and a non-positive distance alone', () => {
        const tri = [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0.5, y: 1 },
        ]
        expect(enforceMinSpacing(tri, 0.5)).toEqual(tri)
        expect(enforceMinSpacing(line(5), 0)).toEqual(line(5))
    })

    it('drops a node within minDist of the one before it', () => {
        const path = [
            { x: 0, y: 0 },
            { x: 0.02, y: 0 },
            { x: 0.5, y: 0 },
            { x: 0.5, y: 0.5 },
        ]
        expect(enforceMinSpacing(path, 0.1)).toEqual([
            { x: 0, y: 0 },
            { x: 0.5, y: 0 },
            { x: 0.5, y: 0.5 },
        ])
    })

    it('drops a trailing node that crowds the first, so the closing edge is not a sliver', () => {
        const path = [
            { x: 0, y: 0 },
            { x: 0.5, y: 0 },
            { x: 0.5, y: 0.5 },
            { x: 0.02, y: 0 },
        ]
        expect(enforceMinSpacing(path, 0.1)).toEqual([
            { x: 0, y: 0 },
            { x: 0.5, y: 0 },
            { x: 0.5, y: 0.5 },
        ])
    })
})
