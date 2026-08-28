/**
 * The annotator's key map, as a pure function from a key event to an action.
 *
 * Separated from the listener so it can be tested: this is a table of twenty-odd bindings with
 * modifier rules and a focus rule, and every one of them is a silent failure when wrong - a key
 * that does nothing looks identical to a key nobody bound.
 *
 * Takes a plain object rather than a KeyboardEvent so a test needs no DOM, which is what the repo's
 * `environment: 'node'` vitest allows.
 */

export type HotkeyAction =
    | { type: 'tool'; tool: 'select' | 'rectangle' | 'polygon' }
    /** 1-9. Picks the class, or reclasses the selection - the caller decides which. */
    | { type: 'class'; digit: number }
    | { type: 'next-image' }
    | { type: 'previous-image' }
    | { type: 'save' }
    | { type: 'review' }
    | { type: 'fit' }
    | { type: 'visibility' }
    | { type: 'focus' }
    | { type: 'close-shape' }
    | { type: 'cancel-shape' }
    | { type: 'delete' }
    | { type: 'undo' }
    | { type: 'redo' }
    | { type: 'shortcuts' }
    | { type: 'search' }

export interface HotkeyEvent {
    key: string
    ctrlKey?: boolean
    metaKey?: boolean
    shiftKey?: boolean
    altKey?: boolean
    /** Tag name of the focused element, and whether it is editable. */
    targetTag?: string
    targetEditable?: boolean
}

const TOOLS: Record<string, 'select' | 'rectangle' | 'polygon'> = {
    v: 'select',
    r: 'rectangle',
    p: 'polygon',
}

/**
 * Is the person typing?
 *
 * Every single-letter binding has to yield to a text field, or `p` cannot be typed into a class
 * name. Escape is the ONE exception: cancelling out of a field is exactly what it is for, and a
 * caller that wants it can act on the action while the field is focused.
 */
export function isTypingTarget(event: HotkeyEvent): boolean {
    const tag = (event.targetTag ?? '').toUpperCase()
    return (
        event.targetEditable === true || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    )
}

export function resolveHotkey(event: HotkeyEvent): HotkeyAction | null {
    const key = event.key
    const lower = key.toLowerCase()
    const mod = event.ctrlKey === true || event.metaKey === true

    // Escape reaches through a focused field, so there is always a way out of one.
    if (key === 'Escape') return { type: 'cancel-shape' }
    if (isTypingTarget(event)) return null

    // Modified combinations first: Ctrl+S must not fall through to the bare `s` save and fire twice.
    if (mod) {
        if (lower === 's') return { type: 'save' }
        if (lower === 'z') return event.shiftKey ? { type: 'redo' } : { type: 'undo' }
        if (lower === 'y') return { type: 'redo' }
        // Anything else modified belongs to the browser.
        return null
    }
    if (event.altKey) return null

    if (lower in TOOLS) return { type: 'tool', tool: TOOLS[lower]! }

    if (key >= '1' && key <= '9') return { type: 'class', digit: Number(key) }
    if (key === '0') return { type: 'fit' }

    switch (lower) {
        case 'j':
            return { type: 'next-image' }
        case 'k':
            return { type: 'previous-image' }
        case 's':
            return { type: 'save' }
        case 'm':
            return { type: 'review' }
        case 'h':
            return { type: 'visibility' }
        case 'f':
            return { type: 'focus' }
        case 'z':
            return { type: 'undo' }
        case 'y':
            return { type: 'redo' }
    }

    if (key === 'Enter') return { type: 'close-shape' }
    if (key === 'Delete' || key === 'Backspace') return { type: 'delete' }
    if (key === '?') return { type: 'shortcuts' }
    if (key === '/') return { type: 'search' }

    return null
}

/**
 * What a pointer is allowed to do, by the kind of pointer it is.
 *
 * THE FINGER NEVER DRAWS. It pans, at any zoom, with any tool active, even mid-polygon - and a tap
 * selects or places a point. Drawing is the pencil's job, and the mouse's.
 *
 * This is the rule that makes an iPad usable: a finger is a blunt instrument that covers what it is
 * placing, and a drag that draws means every attempt to move the picture adds geometry instead.
 * Separating navigation from drawing by INPUT rather than by a modifier is what lets someone work
 * one-handed without a mode to remember.
 */
export function pointerDraws(pointerType: string | undefined): boolean {
    return pointerType !== 'touch'
}

/** Touch needs a bigger target than it needs a drawn handle: 12px drawn, 44px to hit. */
export const TOUCH_TARGET = 44
export const HANDLE_DRAWN = 12

/** The shortcut sheet's contents, so the sheet and the map cannot drift apart. */
export const HOTKEY_GROUPS: { title: string; keys: { keys: string[]; label: string }[] }[] = [
    {
        title: 'Tools',
        keys: [
            { keys: ['V'], label: 'Select and pan' },
            { keys: ['R'], label: 'Rectangle' },
            { keys: ['P'], label: 'Polygon' },
            { keys: ['Space'], label: 'Hold to pan' },
        ],
    },
    {
        title: 'Labelling',
        keys: [
            { keys: ['1', '9'], label: 'Pick a class, or reclass the selected shape' },
            { keys: ['Enter'], label: 'Close the polygon being drawn' },
            { keys: ['Esc'], label: 'Cancel the shape being drawn' },
            { keys: ['Del'], label: 'Delete the selected shape' },
            { keys: ['Z'], label: 'Undo' },
            { keys: ['Y'], label: 'Redo' },
        ],
    },
    {
        title: 'The batch',
        keys: [
            { keys: ['J'], label: 'Next image' },
            { keys: ['K'], label: 'Previous image' },
            { keys: ['S'], label: 'Save' },
            { keys: ['M'], label: 'Mark reviewed' },
            { keys: ['/'], label: 'Search the queue' },
        ],
    },
    {
        title: 'View',
        keys: [
            { keys: ['0'], label: 'Fit to viewport' },
            { keys: ['H'], label: 'Hide or show all shapes' },
            { keys: ['F'], label: 'Focus mode' },
            { keys: ['?'], label: 'This sheet' },
        ],
    },
]
