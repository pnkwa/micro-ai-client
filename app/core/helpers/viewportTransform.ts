/**
 * Pan/zoom arithmetic for the annotation canvas.
 *
 * Pure, no DOM: the component owns the pointer and wheel events, this owns the numbers. Same split
 * as `core/composables/imageCrop.ts`, and for the same reason - the repo's vitest runs in
 * `environment: 'node'` with no DOM at all, so arithmetic worth trusting has to live outside the
 * .vue file.
 *
 * It is worth trusting here specifically because annotation coordinates are derived from it. A
 * wobble in the CSS is cosmetic; an error in `toImagePoint` puts a box somewhere the person did not
 * draw it, and the export carries that outward as if it were a measurement.
 *
 * The model: the image is drawn CENTRED in the viewport, scaled by `scale`, then displaced by
 * `x`/`y` CSS pixels. Everything below inverts or preserves that one relationship.
 */

export interface ViewTransform {
    scale: number
    x: number
    y: number
}

/** ImageSize pixel dimensions of the source image. */
export interface ImageSize {
    w: number
    h: number
}

/** CSS pixel dimensions of the box the image is displayed in. */
export interface Viewport {
    w: number
    h: number
}

/**
 * Hard ceiling on magnification.
 *
 * 16x, because past that a microscopy pixel is a blank square the size of a thumbnail and the only
 * thing gained is the ability to place a box edge more precisely than the image can justify.
 */
export const MAX_SCALE = 16

/**
 * The scale at which the whole image fits inside the viewport: CONTAIN, not cover.
 *
 * The opposite choice from `imageCrop.coverScale`, and deliberately. A crop window must never show
 * letterbox, because the region selected would be partly nothing. An annotation canvas must never
 * HIDE anything, because a shape drawn against an image whose edges are off-screen is a shape
 * placed by guesswork.
 */
export function fitScale(natural: ImageSize, viewport: Viewport): number {
    if (!natural.w || !natural.h || !viewport.w || !viewport.h) return 1
    return Math.min(viewport.w / natural.w, viewport.h / natural.h)
}

/**
 * Keep the scale between "the whole image fits" and the ceiling.
 *
 * Fit is the FLOOR rather than some fraction of it: zooming out past the point where the picture
 * fills the frame leaves it stranded in the middle of a field of background, which is motion
 * without information.
 */
export function clampScale(scale: number, fit: number): number {
    return Math.min(MAX_SCALE, Math.max(fit, scale))
}

/**
 * Keep the image covering the viewport once it is bigger than it, and centred while it is not.
 *
 * The slack on each axis is how much of the scaled image hangs outside the viewport, halved because
 * the offsets are measured from the centred position. At or below fit there is no slack, so the
 * image locks to the middle rather than drifting into a corner.
 */
export function clampPan(
    natural: ImageSize,
    viewport: Viewport,
    t: ViewTransform,
): { x: number; y: number } {
    const drawnW = natural.w * t.scale
    const drawnH = natural.h * t.scale
    const slackX = Math.max(0, (drawnW - viewport.w) / 2)
    const slackY = Math.max(0, (drawnH - viewport.h) / 2)
    // `+ 0` normalises the negative zero clamping against zero slack produces: it behaves
    // identically everywhere except under Object.is, which is exactly what a test comparing
    // transforms uses, so it would read as a real difference where there is none.
    return {
        x: Math.min(slackX, Math.max(-slackX, t.x)) + 0,
        y: Math.min(slackY, Math.max(-slackY, t.y)) + 0,
    }
}

/** The transform that shows the whole image, centred. The state every image opens in. */
export function fitTransform(natural: ImageSize, viewport: Viewport): ViewTransform {
    return { scale: fitScale(natural, viewport), x: 0, y: 0 }
}

/**
 * Where a viewport point falls on the image, in NATURAL pixels.
 *
 * `point` is relative to the viewport's top-left corner, which is what a pointer event gives you
 * once the element's bounding rect is subtracted. The result is deliberately NOT clamped: a drag
 * that leaves the picture should report where it actually went, and the caller decides whether that
 * is out of bounds.
 */
export function toImagePoint(
    natural: ImageSize,
    viewport: Viewport,
    t: ViewTransform,
    point: { x: number; y: number },
): { x: number; y: number } {
    if (!t.scale) return { x: 0, y: 0 }
    return {
        x: (point.x - viewport.w / 2 - t.x) / t.scale + natural.w / 2,
        y: (point.y - viewport.h / 2 - t.y) / t.scale + natural.h / 2,
    }
}

/**
 * The same point, normalized to [0,1] against the original image.
 *
 * This is the coordinate space `image_annotations` and `detection_boxes` both store (ML-ADR-002),
 * so nothing downstream has to know the image's pixel dimensions and an export needs no rescaling
 * anyone would have to trust. Clamped, because a stored annotation outside the picture is not a
 * thing that can be true.
 */
export function toNormalizedPoint(
    natural: ImageSize,
    viewport: Viewport,
    t: ViewTransform,
    point: { x: number; y: number },
): { x: number; y: number } {
    const image = toImagePoint(natural, viewport, t, point)
    if (!natural.w || !natural.h) return { x: 0, y: 0 }
    return {
        x: Math.min(1, Math.max(0, image.x / natural.w)),
        y: Math.min(1, Math.max(0, image.y / natural.h)),
    }
}

/**
 * The inverse of `toImagePoint`: where a normalized image point lands on screen.
 *
 * In viewport CSS pixels, relative to the viewport's top-left. Exists so an overlay can be drawn in
 * ORDINARY DOM alongside the canvas rather than inside the scaled element - a label positioned this
 * way is styled in plain CSS pixels and cannot be scaled, stretched or distorted by the transform,
 * which is exactly the guarantee SVG text inside the transformed element does not give.
 */
export function toScreenPoint(
    natural: ImageSize,
    viewport: Viewport,
    t: ViewTransform,
    normalizedPoint: { x: number; y: number },
): { x: number; y: number } {
    return {
        x: viewport.w / 2 + t.x + (normalizedPoint.x * natural.w - natural.w / 2) * t.scale,
        y: viewport.h / 2 + t.y + (normalizedPoint.y * natural.h - natural.h / 2) * t.scale,
    }
}

/**
 * Zoom by `factor` about a viewport point, holding whatever is under that point still.
 *
 * This is the whole reason wheel-zoom feels right rather than disorienting: zooming about the
 * CENTRE throws the thing you were looking at off-screen the moment you are panned away from the
 * middle, and you then chase it with the mouse.
 *
 * The algebra, since it is short and the alternative is trusting it: a natural-pixel point `i` sits
 * at screen `v/2 + x + (i - n/2) * s`. Holding that fixed while `s` becomes `s'` gives
 * `x' = x + (i - n/2) * (s - s')`.
 */
export function zoomAt(
    natural: ImageSize,
    viewport: Viewport,
    t: ViewTransform,
    factor: number,
    point: { x: number; y: number },
): ViewTransform {
    const fit = fitScale(natural, viewport)
    const scale = clampScale(t.scale * factor, fit)
    // Clamped away, so nothing moves. Returning early also avoids a pointless recentre.
    if (scale === t.scale) return t

    const image = toImagePoint(natural, viewport, t, point)
    const next = {
        scale,
        x: t.x + (image.x - natural.w / 2) * (t.scale - scale),
        y: t.y + (image.y - natural.h / 2) * (t.scale - scale),
    }
    return { scale, ...clampPan(natural, viewport, next) }
}

/** Pan by a screen-pixel delta, clamped. */
export function panBy(
    natural: ImageSize,
    viewport: Viewport,
    t: ViewTransform,
    delta: { x: number; y: number },
): ViewTransform {
    const next = { scale: t.scale, x: t.x + delta.x, y: t.y + delta.y }
    return { scale: t.scale, ...clampPan(natural, viewport, next) }
}

/**
 * Zoom about the viewport's centre, for the toolbar buttons.
 *
 * Buttons have no cursor position to zoom about, and the centre is the honest default: it is what
 * the person is looking at when they are not pointing at anything.
 */
export function zoomByStep(
    natural: ImageSize,
    viewport: Viewport,
    t: ViewTransform,
    factor: number,
): ViewTransform {
    return zoomAt(natural, viewport, t, factor, { x: viewport.w / 2, y: viewport.h / 2 })
}

/** Percentage for the toolbar readout. 100% means one image pixel per CSS pixel. */
export const zoomPercent = (t: ViewTransform): number => Math.round(t.scale * 100)
