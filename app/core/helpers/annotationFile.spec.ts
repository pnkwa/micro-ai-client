import { describe, it, expect } from 'vitest'
import {
    ANNOTATION_FILE_FORMAT,
    serializeAnnotations,
    parseAnnotationsFile,
    shapesFromFile,
} from './annotationFile'
import type { Shape } from './annotationShapes'

const shape = (over: Partial<Shape> = {}): Shape => ({
    id: 'srv-1',
    label: 'yeast',
    labelId: 1,
    x: 0.1,
    y: 0.2,
    w: 0.3,
    h: 0.4,
    polygon: null,
    expert_curated: false,
    ...over,
})

describe('serializeAnnotations', () => {
    it('writes a normalized, versioned file with bbox + optional polygon', () => {
        const file = serializeAnnotations(
            [
                shape(),
                shape({
                    id: 'srv-2',
                    label: 'hypha',
                    labelId: 2,
                    polygon: [
                        { x: 0, y: 0 },
                        { x: 0.5, y: 0 },
                        { x: 0.25, y: 0.5 },
                    ],
                }),
            ],
            42,
            (s) => (s.labelId === 1 ? 'e11d48' : null),
        )
        expect(file.format).toBe(ANNOTATION_FILE_FORMAT)
        expect(file.v).toBe(1)
        expect(file.coords).toBe('normalized')
        expect(file.source_image_id).toBe(42)
        expect(file.annotations[0]).toEqual({
            label: 'yeast',
            color: 'e11d48',
            bbox: [0.1, 0.2, 0.3, 0.4],
            polygon: null,
            expert_curated: false,
        })
        expect(file.annotations[1]!.polygon).toEqual([
            [0, 0],
            [0.5, 0],
            [0.25, 0.5],
        ])
    })

    it('drops degenerate shapes and an unnamed box keeps label null', () => {
        const file = serializeAnnotations([
            shape({ label: '', labelId: null }),
            shape({ id: 'tiny', w: 0.0001, h: 0.0001 }), // below MIN_EDGE
        ])
        expect(file.annotations).toHaveLength(1)
        expect(file.annotations[0]!.label).toBeNull()
    })

    it('omits source_image_id when not given, and color is null without a resolver', () => {
        const file = serializeAnnotations([shape()])
        expect(file.source_image_id).toBeUndefined()
        expect(file.annotations[0]!.color).toBeNull()
    })
})

describe('parseAnnotationsFile', () => {
    const good = () => ({
        format: ANNOTATION_FILE_FORMAT,
        v: 1,
        coords: 'normalized',
        source_image_id: 7,
        annotations: [
            {
                label: 'yeast',
                color: '#e11d48',
                bbox: [0.1, 0.2, 0.3, 0.4],
                polygon: null,
                expert_curated: true,
            },
        ],
    })

    it('round-trips serialize -> parse as an identity on geometry', () => {
        const file = serializeAnnotations([shape()], 5, () => 'abcdef')
        const parsed = parseAnnotationsFile(JSON.parse(JSON.stringify(file)))
        expect(parsed.annotations).toEqual(file.annotations)
        expect(parsed.source_image_id).toBe(5)
    })

    it('strips a leading # from colour and reads expert_curated', () => {
        const parsed = parseAnnotationsFile(good())
        expect(parsed.annotations[0]!.color).toBe('e11d48')
        expect(parsed.annotations[0]!.expert_curated).toBe(true)
    })

    it('clamps geometry to [0,1]', () => {
        const raw = good()
        raw.annotations[0]!.bbox = [-0.5, 2, 0.3, 0.4]
        const parsed = parseAnnotationsFile(raw)
        expect(parsed.annotations[0]!.bbox).toEqual([0, 1, 0.3, 0.4])
    })

    it('drops entries with a malformed bbox or a sub-3-point polygon', () => {
        const raw = good()
        raw.annotations = [
            {
                label: 'a',
                color: null,
                bbox: [0.1, 0.2, 0.3],
                polygon: null,
                expert_curated: false,
            } as never,
            {
                label: 'b',
                color: null,
                bbox: [0, 0, 0.5, 0.5],
                polygon: [
                    [0, 0],
                    [0.5, 0.5],
                ],
                expert_curated: false,
            } as never,
        ]
        expect(parseAnnotationsFile(raw).annotations).toHaveLength(0)
    })

    it('throws on a foreign or wrong-version file', () => {
        expect(() => parseAnnotationsFile(null)).toThrow()
        expect(() => parseAnnotationsFile({ format: 'coco' })).toThrow(/not a MicroAI/)
        expect(() => parseAnnotationsFile({ ...good(), v: 2 })).toThrow(/version/)
        expect(() => parseAnnotationsFile({ ...good(), coords: 'pixels' })).toThrow(/normalized/)
    })
})

describe('shapesFromFile', () => {
    it('mints shapes with resolved label ids and derives a polygon bbox', () => {
        const labelIdFor = (name: string) => (name === 'hypha' ? 9 : null)
        const shapes = shapesFromFile(
            [
                {
                    label: 'hypha',
                    color: null,
                    bbox: [0, 0, 1, 1],
                    expert_curated: true,
                    polygon: [
                        [0, 0],
                        [0.5, 0],
                        [0.25, 0.5],
                    ],
                },
                {
                    label: 'unknown',
                    color: null,
                    bbox: [0.1, 0.1, 0.2, 0.2],
                    polygon: null,
                    expert_curated: false,
                },
            ],
            labelIdFor,
        )
        expect(shapes[0]!.labelId).toBe(9)
        expect(shapes[0]!.expert_curated).toBe(true)
        // bbox re-derived from the polygon, not the file's [0,0,1,1]
        expect(shapes[0]!.w).toBeCloseTo(0.5)
        expect(shapes[0]!.h).toBeCloseTo(0.5)
        // a name the palette does not hold stays unnamed rather than being dropped
        expect(shapes[1]!.labelId).toBeNull()
        expect(shapes[1]!.label).toBe('unknown')
        expect(shapes).toHaveLength(2)
    })
})
