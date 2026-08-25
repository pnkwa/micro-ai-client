import { describe, expect, it } from 'vitest'
import { DEPLOYMENT_DEFAULT_MODEL, pickDefaultModel } from './detectionModels'
import type { ModelSpec } from '~/services/detectionService'

const spec = (name: string, task: ModelSpec['task']): ModelSpec => ({
    name,
    task,
    step: task,
    displayName: name,
    description: '',
    elements: {},
    displayText: {},
})

/**
 * The rule behind the question editor's "unset means THIS model" placeholder. Worth testing
 * because it names a model to an author who is deciding whether to override it: the fallbacks are
 * what keep that name from being absent or wrong when the manifest is not the expected one.
 */
describe('pickDefaultModel', () => {
    it('prefers the deployment default when the manifest serves it', () => {
        const models = [spec('other_detector', 'detect'), spec(DEPLOYMENT_DEFAULT_MODEL, 'detect')]
        expect(pickDefaultModel(models)?.name).toBe(DEPLOYMENT_DEFAULT_MODEL)
    })

    it('falls back to the first primary model when the default is absent', () => {
        const models = [spec('classifier', 'classify'), spec('detector', 'detect')]
        expect(pickDefaultModel(models)?.name).toBe('classifier')
    })

    it('skips segment models, which cannot be a question’s own model', () => {
        const models = [spec('segmenter', 'segment'), spec('detector', 'detect')]
        expect(pickDefaultModel(models)?.name).toBe('detector')
    })

    it('returns undefined for an empty or segment-only manifest, so callers can say nothing', () => {
        expect(pickDefaultModel([])).toBeUndefined()
        expect(pickDefaultModel([spec('segmenter', 'segment')])).toBeUndefined()
    })
})
