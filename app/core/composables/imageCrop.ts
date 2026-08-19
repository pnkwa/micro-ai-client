/**
 * Pan/zoom state for a fixed 1:1 crop window, and the source rectangle it selects.
 *
 * Pure arithmetic, no DOM: the component owns the pointer events and the canvas, this owns the
 * numbers. That is what makes the mapping back to source pixels testable, and the mapping is the
 * part worth testing - an off-by-one in the CSS is a wobble, an off-by-one here submits a different
 * region of the slide than the one on screen.
 *
 * The model: the image is drawn `scale`d and offset by `x`/`y` (CSS pixels, relative to centring
 * it in the window), and the window is a square of `size` CSS pixels. `cropRect` inverts that.
 */

export type CropTransform = { scale: number; x: number; y: number }

/** Natural pixel dimensions of the source. */
export type Natural = { w: number; h: number }

/**
 * The scale at which the image exactly covers the window - the minimum we ever allow.
 *
 * Cover, not contain: a crop window showing letterbox would let someone select a region that is
 * partly nothing, and the file that came back would have blank bands baked into it.
 */
export function coverScale(natural: Natural, size: number): number {
    if (!natural.w || !natural.h || !size) return 1
    return Math.max(size / natural.w, size / natural.h)
}

/**
 * Keep the window covered: the image may not be dragged far enough to expose an edge.
 *
 * The slack on each axis is how much of the scaled image hangs outside the window, halved because
 * the offsets are measured from the centred position.
 */
export function clampOffset(
    natural: Natural,
    size: number,
    t: CropTransform,
): { x: number; y: number } {
    const drawnW = natural.w * t.scale
    const drawnH = natural.h * t.scale
    const slackX = Math.max(0, (drawnW - size) / 2)
    const slackY = Math.max(0, (drawnH - size) / 2)
    // `+ 0` normalises the negative zero that clamping against zero slack produces. It behaves
    // identically in every calculation and differs only under Object.is - which is exactly what a
    // test comparing transforms uses, so it would read as a real difference where there is none.
    return {
        x: Math.min(slackX, Math.max(-slackX, t.x)) + 0,
        y: Math.min(slackY, Math.max(-slackY, t.y)) + 0,
    }
}

/**
 * The square of SOURCE pixels currently inside the window.
 *
 * Everything is centred, so the window's centre maps to the image's centre shifted by -x/-y in
 * source units, and the window's side maps to `size / scale`. Rounded, then clamped into bounds so
 * a rounding step at maximum pan cannot ask the canvas for a pixel that is not there.
 */
export function cropRect(
    natural: Natural,
    size: number,
    t: CropTransform,
): { sx: number; sy: number; side: number } {
    const side = Math.min(Math.round(size / t.scale), natural.w, natural.h)
    const cx = natural.w / 2 - t.x / t.scale
    const cy = natural.h / 2 - t.y / t.scale
    const sx = Math.round(cx - side / 2)
    const sy = Math.round(cy - side / 2)
    return {
        sx: Math.min(Math.max(0, sx), natural.w - side),
        sy: Math.min(Math.max(0, sy), natural.h - side),
        side,
    }
}

/**
 * Is this transform the untouched one - the image sitting exactly as it arrived?
 *
 * A square source at cover scale with no offset selects the whole file, so the crop is a no-op and
 * the caller can submit the original bytes rather than a re-encoded copy of them. Re-encoding a
 * JPEG that nobody changed costs quality for nothing.
 */
export function isUntouched(natural: Natural, size: number, t: CropTransform): boolean {
    const atCover = Math.abs(t.scale - coverScale(natural, size)) < 0.001
    const centred = Math.abs(t.x) < 0.5 && Math.abs(t.y) < 0.5
    return atCover && centred && natural.w === natural.h
}
