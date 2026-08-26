import { describe, expect, it } from 'vitest'
import {
    bboxOfPolygon,
    distanceToSegment,
    insertPointOnEdge,
    isNear,
    nearestEdge,
    removePolygonPoint,
    clamp01,
    cornerPoint,
    hitTest,
    isDegenerate,
    rectFromDrag,
    resizeRect,
    toAnnotationPayload,
    topmostAt,
    translateShape,
    withDerivedBbox,
    type Shape,
} from './annotationShapes'

const box = (over: Partial<Shape> = {}): Shape => ({
    id: 'a',
    label: 'clue cell',
    x: 0.2,
    y: 0.2,
    w: 0.2,
    h: 0.2,
    polygon: null,
    expert_curated: false,
    ...over,
})

const poly = (points: [number, number][], over: Partial<Shape> = {}): Shape =>
    withDerivedBbox(
        box({
            id: 'p',
            polygon: points.map(([x, y]) => ({ x, y })),
            ...over,
        }),
    )

describe('clamp01', () => {
    it.each([
        [-1, 0],
        [0.5, 0.5],
        [2, 1],
    ])('clamps %s to %s', (input, expected) => {
        expect(clamp01(input)).toBe(expected)
    })
})

describe('rectFromDrag', () => {
    it('normalises a drag up-and-left into a positive box', () => {
        const rect = rectFromDrag({ x: 0.6, y: 0.6 }, { x: 0.2, y: 0.1 })
        expect(rect.x).toBeCloseTo(0.2, 10)
        expect(rect.y).toBeCloseTo(0.1, 10)
        expect(rect.w).toBeCloseTo(0.4, 10)
        expect(rect.h).toBeCloseTo(0.5, 10)
    })

    it('clamps a drag that leaves the picture', () => {
        expect(rectFromDrag({ x: -0.5, y: 0.5 }, { x: 0.5, y: 1.5 })).toEqual({
            x: 0,
            y: 0.5,
            w: 0.5,
            h: 0.5,
        })
    })
})

describe('bboxOfPolygon', () => {
    it('is the extent of the outline', () => {
        const bbox = bboxOfPolygon([
            { x: 0.2, y: 0.5 },
            { x: 0.6, y: 0.1 },
            { x: 0.4, y: 0.9 },
        ])
        // closeTo throughout: these are subtractions of floats, so 0.6 - 0.2 is 0.39999999999999997
        // and pinning the exact bits would test the IEEE representation rather than the geometry.
        expect(bbox.x).toBeCloseTo(0.2, 10)
        expect(bbox.y).toBeCloseTo(0.1, 10)
        expect(bbox.w).toBeCloseTo(0.4, 10)
        expect(bbox.h).toBeCloseTo(0.8, 10)
    })

    it('is empty for no points rather than NaN from Math.min of nothing', () => {
        expect(bboxOfPolygon([])).toEqual({ x: 0, y: 0, w: 0, h: 0 })
    })
})

describe('isNear', () => {
    it('hits inside the tolerance and misses outside it', () => {
        expect(isNear({ x: 0.1, y: 0.1 }, { x: 0.11, y: 0.1 }, 0.02)).toBe(true)
        expect(isNear({ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, 0.02)).toBe(false)
    })

    it('measures radially, not per axis', () => {
        // 0.03 on each axis is ~0.042 apart, which a per-axis test would wrongly call a hit.
        expect(isNear({ x: 0.1, y: 0.1 }, { x: 0.13, y: 0.13 }, 0.04)).toBe(false)
    })
})

describe('isDegenerate', () => {
    it('rejects a click, which the rectangle tool produces as a zero-area box', () => {
        expect(isDegenerate(box({ w: 0, h: 0 }))).toBe(true)
    })

    it('rejects a polygon under three points, which the server refuses outright', () => {
        expect(
            isDegenerate(
                poly([
                    [0.1, 0.1],
                    [0.2, 0.2],
                ]),
            ),
        ).toBe(true)
    })

    it('accepts a real box and a real triangle', () => {
        expect(isDegenerate(box())).toBe(false)
        expect(
            isDegenerate(
                poly([
                    [0.1, 0.1],
                    [0.3, 0.1],
                    [0.2, 0.3],
                ]),
            ),
        ).toBe(false)
    })
})

describe('translateShape', () => {
    it('moves a box', () => {
        const moved = translateShape(box(), 0.1, 0.1)
        expect(moved.x).toBeCloseTo(0.3, 10)
        expect(moved.y).toBeCloseTo(0.3, 10)
    })

    it('stops a box at the edge instead of pushing it out', () => {
        expect(translateShape(box(), 5, 5)).toMatchObject({ x: 0.8, y: 0.8 })
        expect(translateShape(box(), -5, -5)).toMatchObject({ x: 0, y: 0 })
    })

    it('moves a polygon as a unit, so meeting an edge stops it rather than deforming it', () => {
        const triangle = poly([
            [0.1, 0.1],
            [0.3, 0.1],
            [0.2, 0.3],
        ])
        const moved = translateShape(triangle, -5, 0)
        // The outline keeps its shape: the two base vertices stay 0.2 apart.
        expect(moved.polygon![1]!.x - moved.polygon![0]!.x).toBeCloseTo(0.2, 10)
        expect(moved.x).toBeCloseTo(0, 10)
    })

    it('keeps a polygon bbox in step with its outline', () => {
        const moved = translateShape(
            poly([
                [0.1, 0.1],
                [0.3, 0.1],
                [0.2, 0.3],
            ]),
            0.1,
            0,
        )
        expect(moved).toMatchObject(bboxOfPolygon(moved.polygon!))
    })
})

describe('resizeRect', () => {
    it('holds the opposite corner still', () => {
        const resized = resizeRect(box(), 'nw', { x: 0.1, y: 0.1 })
        const se = cornerPoint(resized, 'se')
        expect(se.x).toBeCloseTo(0.4, 10)
        expect(se.y).toBeCloseTo(0.4, 10)
        expect(resized).toMatchObject({ x: 0.1, y: 0.1 })
    })

    it('flips rather than inverting when a corner is dragged past its opposite', () => {
        const resized = resizeRect(box(), 'nw', { x: 0.9, y: 0.9 })
        expect(resized.w).toBeGreaterThan(0)
        expect(resized.h).toBeGreaterThan(0)
        expect(resized).toMatchObject({ x: 0.4, y: 0.4 })
    })
})

describe('hitTest', () => {
    it('hits inside a box and misses outside it', () => {
        expect(hitTest(box(), { x: 0.3, y: 0.3 })).toBe(true)
        expect(hitTest(box(), { x: 0.9, y: 0.9 })).toBe(false)
    })

    it('uses the OUTLINE for a polygon, not its bounding box', () => {
        // A triangle whose top-left bbox corner is outside the shape itself.
        const triangle = poly([
            [0, 1],
            [1, 1],
            [1, 0],
        ])
        expect(hitTest(triangle, { x: 0.8, y: 0.8 })).toBe(true)
        expect(hitTest(triangle, { x: 0.1, y: 0.1 })).toBe(false)
    })
})

describe('topmostAt', () => {
    it('picks the LAST drawn, so a small box over a large one is selectable', () => {
        const under = box({ id: 'under', x: 0, y: 0, w: 1, h: 1 })
        const over = box({ id: 'over', x: 0.4, y: 0.4, w: 0.1, h: 0.1 })
        expect(topmostAt([under, over], { x: 0.45, y: 0.45 })?.id).toBe('over')
    })

    it('is null on empty space', () => {
        expect(topmostAt([box()], { x: 0.9, y: 0.9 })).toBeNull()
    })
})

describe('toAnnotationPayload', () => {
    it('sends the complete set, because PUT is replace-all', () => {
        const { annotations } = toAnnotationPayload([box({ id: '1' }), box({ id: '2' })])
        expect(annotations).toHaveLength(2)
    })

    it('never sends the local id', () => {
        const [first] = toAnnotationPayload([box()]).annotations
        expect(first).not.toHaveProperty('id')
    })

    it('drops degenerate shapes rather than letting the server refuse them', () => {
        const { annotations } = toAnnotationPayload([box(), box({ id: 'z', w: 0, h: 0 })])
        expect(annotations).toHaveLength(1)
    })

    it('sends a polygon as pairs, with its bbox alongside', () => {
        const triangle = poly([
            [0.1, 0.1],
            [0.3, 0.1],
            [0.2, 0.3],
        ])
        const [first] = toAnnotationPayload([triangle]).annotations
        expect(first!.polygon).toEqual([
            [0.1, 0.1],
            [0.3, 0.1],
            [0.2, 0.3],
        ])
        expect(first!.x).toBeCloseTo(0.1, 10)
        expect(first!.y).toBeCloseTo(0.1, 10)
    })

    it('OMITS polygon for a plain box, because the column is nullable', () => {
        const [first] = toAnnotationPayload([box()]).annotations
        expect(first).not.toHaveProperty('polygon')
    })

    it('omits expert_curated unless it is set', () => {
        expect(toAnnotationPayload([box()]).annotations[0]).not.toHaveProperty('expert_curated')
        expect(toAnnotationPayload([box({ expert_curated: true })]).annotations[0]).toMatchObject({
            expert_curated: true,
        })
    })
})

describe('distanceToSegment', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 1, y: 0 }

    it('is the perpendicular distance when the foot falls on the segment', () => {
        expect(distanceToSegment({ x: 0.5, y: 0.25 }, a, b)).toBeCloseTo(0.25, 10)
    })

    /** The reason this is not a distance to the infinite line through a and b. */
    it('measures to the ENDPOINT when the point is off the end', () => {
        expect(distanceToSegment({ x: 3, y: 0 }, a, b)).toBeCloseTo(2, 10)
    })

    it('treats a degenerate edge as a point', () => {
        expect(distanceToSegment({ x: 0, y: 1 }, a, a)).toBeCloseTo(1, 10)
    })
})

describe('nearestEdge', () => {
    // A unit square, wound clockwise from the origin.
    const square = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
    ]

    it('finds the edge under the point, by its starting vertex', () => {
        expect(nearestEdge(square, { x: 0.5, y: 0.02 })?.index).toBe(0)
        expect(nearestEdge(square, { x: 0.98, y: 0.5 })?.index).toBe(1)
    })

    it('considers the CLOSING edge, which runs from the last vertex back to the first', () => {
        expect(nearestEdge(square, { x: 0.02, y: 0.5 })?.index).toBe(3)
    })

    it('is null when there is no edge to measure', () => {
        expect(nearestEdge([{ x: 0, y: 0 }], { x: 0, y: 0 })).toBeNull()
    })
})

describe('insertPointOnEdge', () => {
    const triangle = poly([
        [0, 0],
        [1, 0],
        [0.5, 1],
    ])

    it('inserts BETWEEN the two vertices the edge was drawn on', () => {
        const next = insertPointOnEdge(triangle, { x: 0.5, y: 0.01 }, 0.05)
        expect(next!.polygon).toHaveLength(4)
        expect(next!.polygon![1]).toEqual({ x: 0.5, y: 0.01 })
    })

    it('is null when nothing is close enough, so the click can mean something else', () => {
        expect(insertPointOnEdge(triangle, { x: 0.5, y: 0.5 }, 0.01)).toBeNull()
    })

    it('is null for a rectangle, which has no outline to insert into', () => {
        expect(insertPointOnEdge(box(), { x: 0.2, y: 0.2 }, 1)).toBeNull()
    })

    it('keeps the bbox in step with the new outline', () => {
        const next = insertPointOnEdge(triangle, { x: 0.5, y: -0.5 }, 1)!
        expect(next).toMatchObject(bboxOfPolygon(next.polygon!))
    })
})

describe('removePolygonPoint', () => {
    it('removes the named vertex', () => {
        const square = poly([
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
        ])
        const next = removePolygonPoint(square, 1)!
        expect(next.polygon).toHaveLength(3)
        expect(next.polygon).not.toContainEqual({ x: 1, y: 0 })
    })

    /** Three is what the server accepts, so a two-point polygon would be drawn and then rejected. */
    it('refuses to go below three, and says so by returning null', () => {
        const triangle = poly([
            [0, 0],
            [1, 0],
            [0.5, 1],
        ])
        expect(removePolygonPoint(triangle, 0)).toBeNull()
    })

    it('is null for a rectangle', () => {
        expect(removePolygonPoint(box(), 0)).toBeNull()
    })
})
