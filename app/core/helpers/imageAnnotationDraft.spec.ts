import { describe, expect, it } from 'vitest'
import {
    IMG_DRAFT_MAX_AGE_MS,
    IMG_DRAFT_VERSION,
    buildImageDraft,
    draftShapesToShapes,
    draftSignature,
    isUsableImageDraft,
    toDraftShapes,
    type DraftShape,
    type ImageAnnotationDraft,
} from './imageAnnotationDraft'
import type { Shape } from './annotationShapes'

const draftShape = (over: Partial<DraftShape> = {}): DraftShape => ({
    x: 0.1,
    y: 0.2,
    w: 0.3,
    h: 0.4,
    polygon: null,
    label: 'BV',
    expert_curated: false,
    ...over,
})

const record = (over: Partial<ImageAnnotationDraft> = {}): ImageAnnotationDraft => ({
    v: IMG_DRAFT_VERSION,
    savedAt: Date.now(),
    imageId: 7,
    shapes: [],
    pendingClasses: [],
    ...over,
})

const shape = (over: Partial<Shape> = {}): Shape => ({
    id: 'srv-1',
    labelId: 3,
    label: 'BV',
    x: 0.1,
    y: 0.2,
    w: 0.3,
    h: 0.4,
    polygon: null,
    expert_curated: false,
    ...over,
})

describe('isUsableImageDraft', () => {
    const now = 1_000_000_000_000

    it('accepts a current-version, recent record for the right image', () => {
        expect(isUsableImageDraft(record({ savedAt: now, imageId: 7 }), 7, now)).toBe(true)
    })

    it('rejects null / undefined', () => {
        expect(isUsableImageDraft(null, 7)).toBe(false)
        expect(isUsableImageDraft(undefined, 7)).toBe(false)
    })

    it('rejects a record for a different image', () => {
        expect(isUsableImageDraft(record({ savedAt: now, imageId: 7 }), 8, now)).toBe(false)
    })

    it('rejects a record from a different version', () => {
        expect(isUsableImageDraft(record({ v: IMG_DRAFT_VERSION + 1, savedAt: now }), 7, now)).toBe(
            false,
        )
    })

    it('rejects a record older than the max age', () => {
        const stale = now - IMG_DRAFT_MAX_AGE_MS - 1
        expect(isUsableImageDraft(record({ savedAt: stale }), 7, now)).toBe(false)
    })
})

describe('buildImageDraft', () => {
    it('stamps the version and time onto the state', () => {
        const built = buildImageDraft({
            imageId: 9,
            shapes: [draftShape()],
            pendingClasses: [{ label: 'GU', color: 'aabbcc' }],
            now: 42,
        })
        expect(built).toMatchObject({ v: IMG_DRAFT_VERSION, savedAt: 42, imageId: 9 })
        expect(built.shapes).toHaveLength(1)
        expect(built.pendingClasses).toEqual([{ label: 'GU', color: 'aabbcc' }])
    })
})

describe('toDraftShapes / draftShapesToShapes round-trip', () => {
    it('drops the id and labelId on the way out and re-resolves the id by text on the way back', () => {
        const drafts = toDraftShapes([shape({ id: 'srv-99', labelId: 5, label: 'TV' })])
        expect(drafts[0]).not.toHaveProperty('id')
        expect(drafts[0]).not.toHaveProperty('labelId')
        expect(drafts[0]!.label).toBe('TV')

        const back = draftShapesToShapes(
            drafts,
            (name) => (name === 'TV' ? 12 : null),
            () => 'local-1',
        )
        expect(back[0]).toMatchObject({ id: 'local-1', label: 'TV', labelId: 12 })
    })

    it('resolves an unknown label to a null id while keeping its text', () => {
        const back = draftShapesToShapes(
            [draftShape({ label: 'unknown' })],
            () => null,
            () => 'local-2',
        )
        expect(back[0]).toMatchObject({ label: 'unknown', labelId: null })
    })

    it('leaves an unnamed box unresolved', () => {
        const back = draftShapesToShapes(
            [draftShape({ label: '' })],
            () => 3,
            () => 'local-3',
        )
        expect(back[0]!.labelId).toBeNull()
    })

    it('preserves polygon geometry across the round-trip', () => {
        const drafts = toDraftShapes([
            shape({
                polygon: [
                    { x: 0.1, y: 0.2 },
                    { x: 0.3, y: 0.4 },
                ],
            }),
        ])
        expect(drafts[0]!.polygon).toEqual([
            [0.1, 0.2],
            [0.3, 0.4],
        ])
        const back = draftShapesToShapes(
            drafts,
            () => 1,
            () => 'x',
        )
        expect(back[0]!.polygon).toEqual([
            { x: 0.1, y: 0.2 },
            { x: 0.3, y: 0.4 },
        ])
    })
})

describe('draftSignature', () => {
    it('is stable across a to/from round-trip (id-independent)', () => {
        const shapes = [shape({ id: 'srv-1', labelId: 5 }), shape({ id: 'srv-2', labelId: 6 })]
        const drafts = toDraftShapes(shapes)
        const back = draftShapesToShapes(
            drafts,
            () => 99,
            () => 'new-id',
        )
        expect(draftSignature(toDraftShapes(back))).toBe(draftSignature(drafts))
    })

    it('differs when a box is added', () => {
        const one = draftSignature([draftShape()])
        const two = draftSignature([draftShape(), draftShape({ x: 0.5 })])
        expect(one).not.toBe(two)
    })

    it('differs when a label text changes', () => {
        expect(draftSignature([draftShape({ label: 'BV' })])).not.toBe(
            draftSignature([draftShape({ label: 'GU' })]),
        )
    })

    it('ignores sub-micro float noise', () => {
        expect(draftSignature([draftShape({ x: 0.1 })])).toBe(
            draftSignature([draftShape({ x: 0.1 + 1e-9 })]),
        )
    })
})
