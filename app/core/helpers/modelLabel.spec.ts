import { describe, expect, it } from 'vitest'
import { modelLabel, modelParts, resultModelLabel } from './modelLabel'

describe('modelParts', () => {
    it('splits on the manifest separator', () => {
        expect(modelParts('RT-DETR-L — 5-class detector')).toEqual([
            'RT-DETR-L',
            '5-class detector',
        ])
    })

    /** The one thing a blanket dash-replace would break. */
    it('keeps dashes that belong to the name', () => {
        expect(modelParts('YOLO11s-seg — fungal segmenter')[0]).toBe('YOLO11s-seg')
    })

    it('reports no descriptor when there is no separator', () => {
        expect(modelParts('best__rtdetr_v2')).toEqual(['best__rtdetr_v2', undefined])
    })

    it('keeps everything after the first separator together', () => {
        expect(modelParts('A — b — c')).toEqual(['A', 'b — c'])
    })
})

describe('modelLabel', () => {
    it('brackets the descriptor', () => {
        expect(modelLabel('RT-DETR-L — 5-class detector')).toBe('RT-DETR-L (5-class detector)')
    })

    it('leaves a bare name bare', () => {
        expect(modelLabel('best__rtdetr_v2')).toBe('best__rtdetr_v2')
    })
})

describe('resultModelLabel', () => {
    it('names the model that ran', () => {
        expect(resultModelLabel('RT-DETR-L — 5-class detector', 'best_5class_v2', false)).toBe(
            'RT-DETR-L (5-class detector)',
        )
    })

    /** Inside the brackets: one description of one run, not a third thing after them. */
    it('folds a chained segmentation pass into the descriptor', () => {
        expect(resultModelLabel('RT-DETR-L — 5-class detector', 'best_5class_v2', true)).toBe(
            'RT-DETR-L (5-class detector + segmentation)',
        )
    })

    /** A history record can cite a model the manifest has since dropped. */
    it('falls back to the raw id when the manifest does not list it', () => {
        expect(resultModelLabel(undefined, 'best__rtdetr_v2', false)).toBe('best__rtdetr_v2')
        expect(resultModelLabel(undefined, 'best__rtdetr_v2', true)).toBe(
            'best__rtdetr_v2 + segmentation',
        )
    })

    it('brackets segmentation alone when the name has no descriptor', () => {
        expect(resultModelLabel('YOLO11s-seg', 'seg', true)).toBe('YOLO11s-seg (segmentation)')
    })

    it('is empty when nothing ran', () => {
        expect(resultModelLabel('RT-DETR-L — 5-class detector', '', false)).toBe('')
    })
})
