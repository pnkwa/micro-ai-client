import type { Point } from './annotationShapes'

/**
 * Thin a traced path down to the points that carry its shape.
 *
 * A finger dragged around a cell wall emits a point every few milliseconds: two hundred of them for
 * an outline a dozen would describe. That matters three times over. The wire carries every point,
 * the editor draws a handle on every point, and a polygon with two hundred vertices cannot be
 * adjusted afterwards by anyone.
 *
 * Ramer-Douglas-Peucker: keep the point furthest from the line between the ends, recurse on both
 * halves, and drop anything that never strays further than `tolerance`. It preserves corners, which
 * is the property that matters here - a simplifier that averaged instead would round off exactly
 * the sharp features someone traced deliberately.
 *
 * Tolerance is in the same NORMALISED units as the points, so the caller converts from screen
 * pixels through the viewport's own scale and the result holds at any zoom.
 */
export function simplifyPath(points: Point[], tolerance: number): Point[] {
    if (points.length <= 2 || tolerance <= 0) return [...points]

    const first = points[0]!
    const last = points[points.length - 1]!

    let furthest = 0
    let index = 0
    for (let i = 1; i < points.length - 1; i++) {
        const distance = perpendicularDistance(points[i]!, first, last)
        if (distance > furthest) {
            furthest = distance
            index = i
        }
    }

    if (furthest <= tolerance) return [first, last]

    // The split point belongs to both halves, so one copy of it is dropped when they are joined.
    const head = simplifyPath(points.slice(0, index + 1), tolerance)
    const tail = simplifyPath(points.slice(index), tolerance)
    return [...head.slice(0, -1), ...tail]
}

/**
 * Round the corners of a CLOSED ring by Chaikin's corner-cutting.
 *
 * RDP thins a trace but preserves corners, so hand wobble survives as a run of little angular
 * vertices and the point where the trace was started and finished meets its neighbour as a hard
 * chord. Chaikin replaces every vertex with two points set a quarter of the way in from each
 * adjoining edge, which rounds every corner at once; two passes turn a jittery freehand outline
 * into a smooth one. The ring is treated as closed, so the START-END join is rounded like any other
 * corner rather than left as the sharp terminal a freehand trace tends to finish on.
 *
 * Each pass roughly doubles the vertex count, so callers simplify the result to keep the polygon
 * editable. Fewer than three points is not a ring and is returned unchanged.
 */
export function smoothClosedPath(points: Point[], iterations = 1): Point[] {
    if (points.length < 3) return [...points]
    let ring = points
    for (let pass = 0; pass < iterations; pass++) {
        const next: Point[] = []
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!
            const b = ring[(i + 1) % ring.length]!
            next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 })
            next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 })
        }
        ring = next
    }
    return ring
}

/**
 * Drop nodes that crowd the one before them, so an automatically traced polygon never stacks two
 * nodes almost on top of each other.
 *
 * Greedy along a CLOSED ring: keep the first, then keep a node only when it is at least `minDist`
 * from the last one kept; finally drop trailing nodes that crowd the first, so the wrap-around
 * closing edge is not a sliver either. Distance is in the same NORMALISED units as the points. It
 * never returns fewer than three points - a shape too small for the spacing collapses to a stub the
 * caller then rejects, rather than being trimmed to a line here.
 */
export function enforceMinSpacing(points: Point[], minDist: number): Point[] {
    if (points.length <= 3 || minDist <= 0) return [...points]
    const kept: Point[] = [points[0]!]
    for (let i = 1; i < points.length; i++) {
        const p = points[i]!
        const last = kept[kept.length - 1]!
        if (Math.hypot(p.x - last.x, p.y - last.y) >= minDist) kept.push(p)
    }
    while (kept.length > 3) {
        const first = kept[0]!
        const last = kept[kept.length - 1]!
        if (Math.hypot(last.x - first.x, last.y - first.y) >= minDist) break
        kept.pop()
    }
    return kept
}

/** How far `point` sits off the line through `a` and `b`. Zero-length lines fall back to a radius. */
function perpendicularDistance(point: Point, a: Point, b: Point): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y)
    return Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x) / Math.sqrt(lengthSquared)
}
