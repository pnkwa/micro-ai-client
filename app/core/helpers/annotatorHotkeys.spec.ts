import { describe, expect, it } from 'vitest'
import {
    HOTKEY_GROUPS,
    isTypingTarget,
    pointerDraws,
    resolveHotkey,
    type HotkeyEvent,
} from './annotatorHotkeys'

const press = (key: string, over: Partial<HotkeyEvent> = {}) => resolveHotkey({ key, ...over })

describe('isTypingTarget', () => {
    it.each(['INPUT', 'TEXTAREA', 'SELECT', 'input'])('is true for %s', (targetTag) => {
        expect(isTypingTarget({ key: 'a', targetTag })).toBe(true)
    })

    it('is true for a contenteditable', () => {
        expect(isTypingTarget({ key: 'a', targetTag: 'DIV', targetEditable: true })).toBe(true)
    })

    it('is false for an ordinary element', () => {
        expect(isTypingTarget({ key: 'a', targetTag: 'DIV' })).toBe(false)
    })
})

describe('resolveHotkey', () => {
    it.each([
        ['v', 'select'],
        ['r', 'rectangle'],
        ['p', 'polygon'],
        ['e', 'delete'],
    ])('%s picks the %s tool', (key, tool) => {
        expect(press(key)).toEqual({ type: 'tool', tool })
    })

    it('leaves W unbound, since smart outline was removed rather than stubbed', () => {
        expect(press('w')).toBeNull()
        expect(press('W')).toBeNull()
    })

    it('is case-insensitive, so caps lock does not disarm the tools', () => {
        expect(press('P')).toEqual({ type: 'tool', tool: 'polygon' })
        expect(press('E')).toEqual({ type: 'tool', tool: 'delete' })
    })

    it('E arms the erase TOOL, while Del acts on the selection', () => {
        // Two different actions on purpose. The tool removes whatever is pointed at, from any
        // selection or none; the key removes what is selected, from any tool, which is the only
        // route for a shape picked in the labels panel.
        expect(press('e')).toEqual({ type: 'tool', tool: 'delete' })
        expect(press('Delete')).toEqual({ type: 'delete' })
    })

    it.each([1, 5, 9])('%s picks a class', (digit) => {
        expect(press(String(digit))).toEqual({ type: 'class', digit })
    })

    it('0 is fit, not a class', () => {
        expect(press('0')).toEqual({ type: 'fit' })
    })

    it.each([
        ['j', 'next-image'],
        ['k', 'previous-image'],
        ['s', 'save'],
        ['m', 'review'],
        ['h', 'visibility'],
        ['f', 'focus'],
        ['z', 'undo'],
        ['y', 'redo'],
    ])('%s is %s', (key, type) => {
        expect(press(key)).toEqual({ type })
    })

    it.each([
        ['Enter', 'close-shape'],
        ['Escape', 'cancel-shape'],
        ['Delete', 'delete'],
        ['Backspace', 'delete'],
        ['?', 'shortcuts'],
        ['/', 'search'],
    ])('%s is %s', (key, type) => {
        expect(press(key)).toEqual({ type })
    })

    describe('while typing', () => {
        const typing = { targetTag: 'INPUT' }

        it.each(['p', '2', 'j', 's', 'Delete'])('ignores %s', (key) => {
            expect(press(key, typing)).toBeNull()
        })

        /** The one exception: cancelling out of a field is what Escape is for. */
        it('still resolves Escape, so there is always a way out of a field', () => {
            expect(press('Escape', typing)).toEqual({ type: 'cancel-shape' })
        })
    })

    describe('modifiers', () => {
        it.each([{ ctrlKey: true }, { metaKey: true }])('%o + s saves once, not twice', (mod) => {
            expect(press('s', mod)).toEqual({ type: 'save' })
        })

        it('ctrl+z undoes and ctrl+shift+z redoes', () => {
            expect(press('z', { ctrlKey: true })).toEqual({ type: 'undo' })
            expect(press('z', { ctrlKey: true, shiftKey: true })).toEqual({ type: 'redo' })
        })

        it('ctrl+y redoes, which is the Windows habit', () => {
            expect(press('y', { ctrlKey: true })).toEqual({ type: 'redo' })
        })

        /** Otherwise ctrl+P would swallow print and ctrl+F the browser find. */
        it('leaves every other modified combination to the browser', () => {
            expect(press('p', { ctrlKey: true })).toBeNull()
            expect(press('f', { metaKey: true })).toBeNull()
            expect(press('1', { ctrlKey: true })).toBeNull()
        })

        it('ignores alt combinations', () => {
            expect(press('p', { altKey: true })).toBeNull()
        })
    })

    it('is null for a key it does not bind', () => {
        expect(press('q')).toBeNull()
    })
})

describe('HOTKEY_GROUPS', () => {
    /** The sheet is documentation; documentation that contradicts the code is worse than none. */
    it('documents every key the resolver actually binds', () => {
        const documented = new Set(
            HOTKEY_GROUPS.flatMap((group) => group.keys.flatMap((row) => row.keys)),
        )
        for (const key of ['V', 'R', 'P', 'E', 'J', 'K', 'S', 'M', '0', 'H', 'F', '?', '/']) {
            expect(documented.has(key)).toBe(true)
        }
    })
})

describe('pointerDraws', () => {
    /**
     * The rule an iPad depends on: a finger covers what it is placing, and a drag that draws means
     * every attempt to move the picture adds geometry instead.
     */
    it('is false for touch, so a finger pans rather than draws', () => {
        expect(pointerDraws('touch')).toBe(false)
    })

    it.each(['pen', 'mouse', undefined])('is true for %s', (type) => {
        expect(pointerDraws(type)).toBe(true)
    })
})
