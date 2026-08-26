import { afterEach, describe, expect, it, vi } from 'vitest'
import { localId } from './localId'

const withRandomUUID = (value: (() => string) | undefined) => {
    vi.stubGlobal('crypto', value ? { randomUUID: value } : {})
}

afterEach(() => vi.unstubAllGlobals())

describe('localId', () => {
    it('uses randomUUID when the context is secure enough to have it', () => {
        withRandomUUID(() => '11111111-2222-3333-4444-555555555555')
        expect(localId('s')).toBe('s-11111111-2222-3333-4444-555555555555')
    })

    /**
     * The case this file exists for: over plain HTTP on a LAN address - how a tablet reaches
     * `pnpm dev` - `crypto.randomUUID` is undefined, and calling it throws.
     */
    it('still returns an id when randomUUID is missing, rather than throwing', () => {
        withRandomUUID(undefined)
        expect(() => localId('s')).not.toThrow()
        expect(localId('s')).toMatch(/^s-/)
    })

    it('does not collide within a session, even without randomUUID', () => {
        withRandomUUID(undefined)
        const ids = new Set(Array.from({ length: 500 }, () => localId('s')))
        expect(ids.size).toBe(500)
    })

    it('defaults the prefix', () => {
        withRandomUUID(undefined)
        expect(localId()).toMatch(/^id-/)
    })
})
