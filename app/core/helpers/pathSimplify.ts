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

/** How far `point` sits off the line through `a` and `b`. Zero-length lines fall back to a radius. */
function perpendicularDistance(point: Point, a: Point, b: Point): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y)
    return Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x) / Math.sqrt(lengthSquared)
}
