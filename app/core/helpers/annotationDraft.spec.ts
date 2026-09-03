import { describe, expect, it } from 'vitest'
import {
    DRAFT_MAX_AGE_MS,
    DRAFT_VERSION,
    buildDraftRecord,
    extraClassesFromPalette,
    isUsableDraft,
    mergeDraftIntoFields,
    type AnnotationDraftRecord,
    type RestorableField,
} from './annotationDraft'
import type { Shape } from './annotationShapes'

const shape = (label: string): Shape => ({
    id: `s-${label}`,
    labelId: null,
    label,
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.2,
    polygon: null,
    expert_curated: false,
})

const record = (over: Partial<AnnotationDraftRecord> = {}): AnnotationDraftRecord => ({
    v: DRAFT_VERSION,
    savedAt: Date.now(),
    currentIndex: 0,
    fields: [],
    extraClasses: [],
    ...over,
})

const field = (imageId: number): RestorableField => ({
    imageId,
    shapes: [],
    responses: {},
    status: 'pending',
})

describe('isUsableDraft', () => {
    const now = 1_000_000_000_000

    it('accepts a current-version, recent record', () => {
        expect(isUsableDraft(record({ savedAt: now }), now)).toBe(true)
    })

    it('rejects null / undefined', () => {
        expect(isUsableDraft(null)).toBe(false)
        expect(isUsableDraft(undefined)).toBe(false)
    })

    it('rejects a record from a different version', () => {
        expect(isUsableDraft(record({ v: DRAFT_VERSION + 1, savedAt: now }), now)).toBe(false)
    })

    it('rejects a record older than the max age', () => {
        const stale = now - DRAFT_MAX_AGE_MS - 1
        expect(isUsableDraft(record({ savedAt: stale }), now)).toBe(false)
    })

    it('accepts a record exactly at the max age boundary', () => {
        expect(isUsableDraft(record({ savedAt: now - DRAFT_MAX_AGE_MS }), now)).toBe(true)
    })

    it('rejects a non-finite savedAt', () => {
        expect(isUsableDraft(record({ savedAt: Number.NaN }), now)).toBe(false)
    })
})

describe('buildDraftRecord', () => {
    it('stamps the version and given timestamp and passes state through', () => {
        const built = buildDraftRecord({
            currentIndex: 2,
            fields: [
                {
                    imageId: 7,
                    shapes: [shape('cell')],
                    responses: { dx: 'BV' },
                    status: 'completed',
                },
            ],
            extraClasses: [{ id: 9, label: 'extra', color_hex: '64748b' }],
            now: 42,
        })
        expect(built).toEqual({
            v: DRAFT_VERSION,
            savedAt: 42,
            currentIndex: 2,
            fields: [
                {
                    imageId: 7,
                    shapes: [shape('cell')],
                    responses: { dx: 'BV' },
                    status: 'completed',
                },
            ],
            extraClasses: [{ id: 9, label: 'extra', color_hex: '64748b' }],
        })
    })
})

describe('mergeDraftIntoFields', () => {
    it('restores work onto matching images and leaves others pending', () => {
        const fields = [field(10), field(20), field(30)]
        const applied = mergeDraftIntoFields(
            fields,
            record({
                fields: [
                    {
                        imageId: 10,
                        shapes: [shape('a')],
                        responses: { dx: 'BV' },
                        status: 'completed',
                    },
                    { imageId: 30, shapes: [], responses: {}, status: 'skipped' },
                ],
            }),
        )
        expect(applied).toBe(true)
        expect(fields[0]).toMatchObject({
            shapes: [shape('a')],
            responses: { dx: 'BV' },
            status: 'completed',
        })
        expect(fields[1]).toMatchObject({ shapes: [], responses: {}, status: 'pending' }) // untouched
        expect(fields[2]!.status).toBe('skipped')
    })

    it('matches by imageId, not position (album order can change)', () => {
        const fields = [field(20), field(10)] // reordered vs the draft below
        mergeDraftIntoFields(
            fields,
            record({
                fields: [{ imageId: 10, shapes: [shape('a')], responses: {}, status: 'completed' }],
            }),
        )
        expect(fields[0]!.status).toBe('pending') // image 20 has no draft
        expect(fields[1]!.status).toBe('completed') // image 10 restored despite the swap
    })

    it('drops draft entries whose image is gone and reports nothing applied', () => {
        const fields = [field(10)]
        const applied = mergeDraftIntoFields(
            fields,
            record({
                fields: [
                    { imageId: 999, shapes: [shape('a')], responses: {}, status: 'completed' },
                ],
            }),
        )
        expect(applied).toBe(false)
        expect(fields[0]!.status).toBe('pending')
    })
})

describe('extraClassesFromPalette', () => {
    const palette = [
        { id: 1, label: 'Clue cell', color_hex: '7c5ce0' },
        { id: 2, label: 'Lactobacilli', color_hex: 'd97706' },
        { id: 3, label: 'Student one', color_hex: '64748b' },
    ]

    it('returns only the rows beyond the fixed vocabulary, projected to id/label/color', () => {
        expect(extraClassesFromPalette(palette, 2)).toEqual([
            { id: 3, label: 'Student one', color_hex: '64748b' },
        ])
    })

    it('returns nothing when the palette is just the fixed set', () => {
        expect(extraClassesFromPalette(palette, 3)).toEqual([])
    })
})
