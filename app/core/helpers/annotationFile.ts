import { localId } from './localId'
import {
    type Point,
    type Shape,
    type LabelIdLookup,
    clamp01,
    isDegenerate,
    withDerivedBbox,
} from './annotationShapes'

/**
 * The per-image annotation file — save / load / share one image's boxes within the platform, and
 * the "template onto any image" import (BE-ADR-030, FE side).
 *
 * DELIBERATELY IMAGE-AGNOSTIC. Everything is normalized [0,1] (ML-ADR-002), so a set drawn on one
 * picture lands in the same relative places on another. `source_image_id` is PROVENANCE ONLY — it
 * records where the set came from and is ignored on import, which is what makes the file a portable
 * template rather than a binding to one image.
 *
 * This is the interchange the annotator hands a person; the dataset/training export is the server's
 * COCO endpoint, a different scope (many images) for a different purpose.
 */
export const ANNOTATION_FILE_FORMAT = 'microai-annotations'
export const ANNOTATION_FILE_VERSION = 1

export interface AnnotationFileEntry {
    /** The class text; null for an unnamed box (a real state — a box drawn before it is named). */
    label: string | null
    /** Six-hex, no leading '#', or null — carried so a shared set can recreate its palette colours. */
    color: string | null
    bbox: [number, number, number, number]
    /** `[[x, y], ...]` in normalized space; null for a plain box. */
    polygon: number[][] | null
    expert_curated: boolean
}

export interface AnnotationFile {
    format: typeof ANNOTATION_FILE_FORMAT
    v: typeof ANNOTATION_FILE_VERSION
    coords: 'normalized'
    /** Where the set was exported from. Provenance only — import ignores it. */
    source_image_id?: number
    annotations: AnnotationFileEntry[]
}

/** Resolves the display colour (six-hex, no '#') for a shape, or null. Kept as a callback so this
 * module stays free of the palette, exactly as `labelIdFor` keeps it free of label ids. */
export type ColorLookup = (shape: Shape) => string | null

/**
 * `Shape[]` -> the file. Pure, so the round-trip is unit-tested rather than eyeballed in a download.
 *
 * Degenerate shapes are dropped here, the one place "what gets written" is decided, matching
 * `toAnnotationPayload` — a zero-area box or a two-point polygon is not a region worth saving.
 */
export function serializeAnnotations(
    shapes: Shape[],
    sourceImageId?: number,
    colorFor?: ColorLookup,
): AnnotationFile {
    const annotations: AnnotationFileEntry[] = shapes
        .filter((shape) => !isDegenerate(shape))
        .map((shape) => ({
            label: shape.label ? shape.label : null,
            color: colorFor?.(shape) ?? null,
            bbox: [shape.x, shape.y, shape.w, shape.h],
            polygon: shape.polygon ? shape.polygon.map((p) => [p.x, p.y]) : null,
            expert_curated: shape.expert_curated,
        }))
    return {
        format: ANNOTATION_FILE_FORMAT,
        v: ANNOTATION_FILE_VERSION,
        coords: 'normalized',
        ...(sourceImageId !== undefined && { source_image_id: sourceImageId }),
        annotations,
    }
}

const isNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value)

const asPolygon = (raw: unknown): number[][] | null => {
    if (!Array.isArray(raw) || raw.length === 0) return null
    const points: number[][] = []
    for (const pair of raw) {
        if (!Array.isArray(pair) || !isNumber(pair[0]) || !isNumber(pair[1])) return null
        points.push([clamp01(pair[0]), clamp01(pair[1])])
    }
    return points
}

/**
 * Parse and VALIDATE a file's contents, clamping geometry to [0,1] and dropping entries too small
 * to mean anything.
 *
 * Throws a readable error on anything that is not one of our files, rather than letting a bad shape
 * reach the canvas as `NaN` — the caller turns the message into a toast. The version/format guard is
 * what lets the shape change later without a v1 file being read as if it were the new one.
 */
export function parseAnnotationsFile(raw: unknown): AnnotationFile {
    if (!raw || typeof raw !== 'object') throw new Error('Not an annotation file.')
    const file = raw as Record<string, unknown>
    if (file.format !== ANNOTATION_FILE_FORMAT)
        throw new Error('This file is not a MicroAI annotation export.')
    if (file.v !== ANNOTATION_FILE_VERSION)
        throw new Error(`Unsupported annotation file version (${String(file.v)}).`)
    if (file.coords !== 'normalized')
        throw new Error('Annotation file coordinates must be normalized.')
    if (!Array.isArray(file.annotations)) throw new Error('Annotation file has no annotations.')

    const annotations: AnnotationFileEntry[] = []
    for (const entry of file.annotations) {
        if (!entry || typeof entry !== 'object') continue
        const e = entry as Record<string, unknown>
        const bbox = e.bbox
        if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(isNumber)) continue
        const [x, y, w, h] = bbox.map(clamp01) as [number, number, number, number]
        const polygon = asPolygon(e.polygon)
        const points: Point[] | null = polygon
            ? polygon.map(([px, py]) => ({ x: px ?? 0, y: py ?? 0 }))
            : null
        // Reuse the canvas's own degeneracy rule so a file cannot introduce a box the editor would
        // itself refuse to draw or save.
        if (isDegenerate({ x, y, w, h, polygon: points } as Shape)) continue
        annotations.push({
            label: typeof e.label === 'string' && e.label.trim() ? e.label : null,
            color: typeof e.color === 'string' ? e.color.replace(/^#/, '') : null,
            bbox: [x, y, w, h],
            polygon,
            expert_curated: e.expert_curated === true,
        })
    }
    return {
        format: ANNOTATION_FILE_FORMAT,
        v: ANNOTATION_FILE_VERSION,
        coords: 'normalized',
        ...(isNumber(file.source_image_id) && { source_image_id: file.source_image_id }),
        annotations,
    }
}

/**
 * File entries -> editable shapes, mirroring `shapesFromDetection`: the caller mints a palette label
 * per name FIRST, so `labelIdFor` resolves and a fresh shape carries a real `label_id`. A name the
 * palette still does not hold lands as `labelId: null` (unnamed) rather than being dropped.
 */
export function shapesFromFile(entries: AnnotationFileEntry[], labelIdFor: LabelIdLookup): Shape[] {
    return entries.map((entry) => {
        const [x, y, w, h] = entry.bbox
        const polygon: Point[] | null = entry.polygon
            ? entry.polygon.map(([px, py]) => ({ x: px ?? 0, y: py ?? 0 }))
            : null
        const shape: Shape = {
            id: localId('import'),
            label: entry.label ?? '',
            labelId: entry.label ? labelIdFor(entry.label) : null,
            x,
            y,
            w,
            h,
            polygon,
            expert_curated: entry.expert_curated,
        }
        return polygon ? withDerivedBbox(shape) : shape
    })
}
