/**
 * The shapes a person draws, and the payload they become.
 *
 * Pure, no DOM, for the same reason as `viewportTransform.ts`: this is the arithmetic that decides
 * where a box actually is, and the export carries it outward as if it were a measurement. The
 * component owns pointers; this owns geometry.
 *
 * EVERYTHING HERE IS NORMALIZED [0,1] against the original image. That is the space
 * `image_annotations` and `detection_boxes` both store (ML-ADR-002), so nothing downstream needs the
 * image's pixel dimensions and an export needs no rescaling anyone would have to trust. Converting
 * to pixels anywhere in this file would be a bug.
 */

/** A point in normalized image space. */
export type Point = { x: number; y: number }

/**
 * One drawn region.
 *
 * `id` is LOCAL ONLY and never sent. `PUT /images/:id/annotations` is replace-all in one
 * transaction, so the server assigns ids and the client never reconciles them for shapes a person
 * just drew - which is exactly why an editing session can hand out throwaway ids like this.
 */
export interface Shape {
    id: string
    label: string
    x: number
    y: number
    w: number
    h: number
    /** Outline for a polygon; null for a plain box. */
    polygon: Point[] | null
    /** Vetted by a domain expert. Writable only through the replace-all PUT. */
    expert_curated: boolean
}

/** Minimum edge, in normalized units, below which a drag is treated as a click rather than a box. */
const MIN_EDGE = 0.002

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

export const clampPoint = (point: Point): Point => ({ x: clamp01(point.x), y: clamp01(point.y) })

/**
 * The box two dragged corners describe, in any direction.
 *
 * Normalising the direction here rather than at the call site is what lets someone drag up-and-left
 * and get a box instead of a negative width that renders as nothing.
 */
export function rectFromDrag(a: Point, b: Point): Pick<Shape, 'x' | 'y' | 'w' | 'h'> {
    const x1 = clamp01(Math.min(a.x, b.x))
    const y1 = clamp01(Math.min(a.y, b.y))
    const x2 = clamp01(Math.max(a.x, b.x))
    const y2 = clamp01(Math.max(a.y, b.y))
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/**
 * A polygon's extent.
 *
 * The server recomputes this on write and IGNORES whatever box was sent alongside, so the two
 * descriptions of one region cannot disagree. We compute it anyway so the local list, the hit test
 * and the selection outline all agree with what the server will store.
 */
export function bboxOfPolygon(points: Point[]): Pick<Shape, 'x' | 'y' | 'w' | 'h'> {
    if (!points.length) return { x: 0, y: 0, w: 0, h: 0 }
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** Keep a shape's bbox in step with its outline after a vertex moves. */
export function withDerivedBbox(shape: Shape): Shape {
    return shape.polygon ? { ...shape, ...bboxOfPolygon(shape.polygon) } : shape
}

/**
 * Too small or too incomplete to mean anything.
 *
 * A click with the rectangle tool selected produces a zero-area box, and an abandoned polygon can
 * hold one or two points. Neither is a region, and the server refuses a polygon under three points
 * outright, so they are dropped rather than sent and rejected.
 */
export function isDegenerate(shape: Shape): boolean {
    if (shape.polygon) return shape.polygon.length < 3
    return shape.w < MIN_EDGE || shape.h < MIN_EDGE
}

/** Move a whole shape by a normalized delta, keeping it inside the picture. */
export function translateShape(shape: Shape, dx: number, dy: number): Shape {
    if (shape.polygon) {
        // Clamped as a UNIT, against the bounding box, then applied to every vertex. Clamping each
        // vertex on its own would deform the outline as it met an edge rather than stopping it.
        const ddx = Math.min(Math.max(dx, -shape.x), 1 - (shape.x + shape.w))
        const ddy = Math.min(Math.max(dy, -shape.y), 1 - (shape.y + shape.h))
        return withDerivedBbox({
            ...shape,
            polygon: shape.polygon.map((p) => ({ x: p.x + ddx, y: p.y + ddy })),
        })
    }
    return {
        ...shape,
        x: Math.min(Math.max(0, shape.x + dx), 1 - shape.w),
        y: Math.min(Math.max(0, shape.y + dy), 1 - shape.h),
    }
}

/**
 * Are two points within `tolerance` of each other?
 *
 * The tolerance is in NORMALIZED units, so the caller converts from screen pixels using the current
 * zoom - otherwise "click the first dot to close" would need a pixel-perfect click when zoomed out
 * and accept a click half an image away when zoomed in.
 */
export function isNear(a: Point, b: Point, tolerance: number): boolean {
    return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance
}

/** Which corner of a rectangle a resize handle is. */
export type Corner = 'nw' | 'ne' | 'se' | 'sw'

export const CORNERS: Corner[] = ['nw', 'ne', 'se', 'sw']

/** The normalized position of one corner handle. */
export function cornerPoint(shape: Shape, corner: Corner): Point {
    return {
        x: corner === 'nw' || corner === 'sw' ? shape.x : shape.x + shape.w,
        y: corner === 'nw' || corner === 'ne' ? shape.y : shape.y + shape.h,
    }
}

/**
 * Drag one corner to a new point, holding the opposite corner still.
 *
 * Goes back through `rectFromDrag`, so dragging a corner past its opposite flips the box rather
 * than inverting it - which is what someone means when they overshoot.
 */
export function resizeRect(shape: Shape, corner: Corner, to: Point): Shape {
    const opposite: Record<Corner, Corner> = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' }
    return { ...shape, ...rectFromDrag(cornerPoint(shape, opposite[corner]), to) }
}

/**
 * Distance from a point to a line SEGMENT, not to the infinite line through it.
 *
 * The difference is the whole value here: an infinite line would report a click far off the end of
 * one edge as being right on it, so clicking near a polygon would insert a vertex into whichever
 * edge happened to be collinear rather than the one under the cursor.
 */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy
    // A degenerate edge (two identical vertices) is just a point.
    if (!lengthSq) return Math.hypot(point.x - a.x, point.y - a.y)
    // Projection of the point onto the segment, clamped to it - the clamp is what makes it a
    // segment rather than a line.
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq))
    return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

/**
 * The edge nearest a point, as the index of the vertex the edge STARTS at.
 *
 * The ring is closed, so the last edge runs from the final vertex back to the first, and it has to
 * be considered like any other - a click on the closing edge is the easy one to forget.
 */
export function nearestEdge(
    points: Point[],
    point: Point,
): { index: number; distance: number } | null {
    if (points.length < 2) return null
    let best = { index: 0, distance: Infinity }
    for (let i = 0; i < points.length; i++) {
        const a = points[i]!
        const b = points[(i + 1) % points.length]!
        const distance = distanceToSegment(point, a, b)
        if (distance < best.distance) best = { index: i, distance }
    }
    return best
}

/**
 * Insert a vertex into whichever edge is under `point`, or return null if none is close enough.
 *
 * Null rather than an unchanged shape, so the caller can tell "nothing to do here" from "done" and
 * fall through to whatever the click would otherwise have meant.
 */
export function insertPointOnEdge(shape: Shape, point: Point, tolerance: number): Shape | null {
    if (!shape.polygon) return null
    const edge = nearestEdge(shape.polygon, point)
    if (!edge || edge.distance > tolerance) return null
    const polygon = [...shape.polygon]
    // After the edge's starting vertex, which is what puts it between the two it was drawn on.
    polygon.splice(edge.index + 1, 0, clampPoint(point))
    return withDerivedBbox({ ...shape, polygon })
}

/**
 * Remove one vertex, unless doing so would leave fewer than three.
 *
 * Returns null in that case rather than silently refusing, so the caller can say why. Three is not
 * an arbitrary floor: it is what the server accepts, so a two-point polygon could be drawn here and
 * then rejected on save.
 */
export function removePolygonPoint(shape: Shape, index: number): Shape | null {
    if (!shape.polygon || shape.polygon.length <= 3) return null
    const polygon = shape.polygon.filter((_, i) => i !== index)
    return withDerivedBbox({ ...shape, polygon })
}

const pointInRect = (shape: Shape, point: Point): boolean =>
    point.x >= shape.x &&
    point.x <= shape.x + shape.w &&
    point.y >= shape.y &&
    point.y <= shape.y + shape.h

/** Ray casting. Standard, and worth having rather than approximating a polygon by its box. */
const pointInPolygon = (points: Point[], point: Point): boolean => {
    let inside = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i]!
        const b = points[j]!
        const straddles = a.y > point.y !== b.y > point.y
        if (straddles && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside
        }
    }
    return inside
}

export function hitTest(shape: Shape, point: Point): boolean {
    return shape.polygon ? pointInPolygon(shape.polygon, point) : pointInRect(shape, point)
}

/**
 * The topmost shape under a point.
 *
 * Last drawn wins, because that is the one on top and the one someone just made. Searching from the
 * end is what makes a small box drawn over a large one selectable at all.
 */
export function topmostAt(shapes: Shape[], point: Point): Shape | null {
    for (let i = shapes.length - 1; i >= 0; i--) {
        if (hitTest(shapes[i]!, point)) return shapes[i]!
    }
    return null
}

/** The server's cap. Exported so the UI can say so before a save is refused. */
export const MAX_ANNOTATIONS = 1000

export interface AnnotationPayloadItem {
    label: string
    x: number
    y: number
    w: number
    h: number
    polygon?: number[][]
    expert_curated?: boolean
}

/**
 * The body of `PUT /images/:id/annotations`.
 *
 * Replace-all, so this is the COMPLETE set every time rather than a diff. Degenerate shapes are
 * dropped here rather than filtered by the caller, because "what gets sent" is one question with
 * one answer and splitting it invites the list and the payload to disagree.
 *
 * `polygon` goes out as `[[x, y], ...]` - the wire format is pairs, not objects, matching
 * `detection_boxes.polygon` - and is OMITTED entirely for a plain box, because the column is
 * nullable and sending an empty array is not the same as sending nothing.
 */
export function toAnnotationPayload(shapes: Shape[]): { annotations: AnnotationPayloadItem[] } {
    const annotations = shapes
        .filter((shape) => !isDegenerate(shape))
        .map((shape) => ({
            label: shape.label,
            x: shape.x,
            y: shape.y,
            w: shape.w,
            h: shape.h,
            ...(shape.polygon ? { polygon: shape.polygon.map((p) => [p.x, p.y]) } : {}),
            ...(shape.expert_curated ? { expert_curated: true } : {}),
        }))
    return { annotations }
}
