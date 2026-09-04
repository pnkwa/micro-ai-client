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
    | { type: 'tool'; tool: 'select' | 'rectangle' | 'polygon' | 'pencil' | 'delete' }
    /** 1-9. Picks the class, or reclasses the selection - the caller decides which. */
    | { type: 'class'; digit: number }
    | { type: 'next-image' }
    | { type: 'previous-image' }
    /** One image sideways, which only means anything while the queue is a grid. */
    | { type: 'next-column' }
    | { type: 'previous-column' }
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

const TOOLS: Record<string, 'select' | 'rectangle' | 'polygon' | 'pencil' | 'delete'> = {
    v: 'select',
    r: 'rectangle',
    p: 'polygon',
    // `d` for draw: the pencil traces a freehand outline into a polygon.
    d: 'pencil',
    // Erase is a TOOL, not a button acting on a selection: point at a shape to remove it, or at a
    // polygon's node to remove just that node. `e` rather than `d`, which is a hair from the Del
    // key's neighbourhood on the mental map and would read as a second binding for the same thing.
    e: 'delete',
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

    /*
     * THE ARROWS WALK THE QUEUE, which is the list they are pointing at.
     *
     * They scrolled it before, which is the browser's default for a focused scroll container and
     * exactly the wrong thing here: the queue is a worklist, and the reason to look down it is to
     * open the next thing. `J`/`K` stay for anyone who reaches for them, but nobody guesses those.
     *
     * Down and up move by a ROW, which is one image in the list and three in the grid, and left and
     * right move by one image. In list mode the horizontal pair does nothing, because a list is a
     * grid one column wide and stepping sideways in it would be stepping nowhere. The page holds
     * the arithmetic, since only it knows which mode the queue is in.
     *
     * A field with focus keeps all four: `isTypingTarget` returns above, so the caret in a label
     * input is never fighting the queue for an arrow key.
     */
    if (key === 'ArrowDown') return { type: 'next-image' }
    if (key === 'ArrowUp') return { type: 'previous-image' }
    if (key === 'ArrowRight') return { type: 'next-column' }
    if (key === 'ArrowLeft') return { type: 'previous-column' }

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

/** A finger, rather than a pencil or a mouse. Coarse, and it covers what it is over. */
export function isTouchPointer(pointerType: string | undefined): boolean {
    return pointerType === 'touch'
}

/**
 * What a pointer is allowed to do, by the kind of pointer AND the tool it is holding.
 *
 * A finger used to be barred from drawing outright. That was too broad: it made the RECTANGLE tool
 * unusable on a tablet, since a rectangle has no other gesture - polygon has its tap, delete has
 * its tap, but a box is a drag or it is nothing. So the rule narrowed to the case it was really
 * about.
 *
 * *** A FINGER DRAGS A RECTANGLE. IT PANS UNDER EVERY OTHER TOOL. *** Panning has to stay on the
 * one-finger drag for select, for polygon (where a ring is placed tap by tap and the picture still
 * has to move under it) and for delete (where the drag is how you reach the shape you are aiming
 * at). Under the rectangle tool there is no competing meaning: someone armed it to draw a box.
 *
 * Two fingers always navigate, whatever is armed, which is the escape hatch that makes this safe.
 */
export function pointerDraws(pointerType: string | undefined, tool?: string): boolean {
    if (!isTouchPointer(pointerType)) return true
    return tool === 'rectangle'
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
            { keys: ['D'], label: 'Pencil: trace an outline' },
            { keys: ['E'], label: 'Erase a shape or a polygon point' },
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
            { keys: ['↓', 'J'], label: 'Next image, or next row in grid mode (saves first)' },
            { keys: ['↑', 'K'], label: 'Previous image, or previous row in grid mode' },
            { keys: ['←', '→'], label: 'Across the queue, in grid mode' },
            { keys: ['S'], label: 'Save' },
            { keys: ['M'], label: 'Mark reviewed' },
            { keys: ['/'], label: 'Search the queue' },
        ],
    },
    {
        title: 'View',
        keys: [
            { keys: ['0'], label: 'Fit to viewport' },
            // Not a key binding, but the sheet is where someone looks for it, and the wheel alone
            // now scrolls rather than zooms - a change worth saying out loud somewhere.
            { keys: ['Ctrl', 'scroll'], label: 'Zoom (the wheel alone scrolls)' },
            { keys: ['H'], label: 'Hide or show all shapes' },
            { keys: ['F'], label: 'Focus mode' },
            { keys: ['?'], label: 'This sheet' },
        ],
    },
]
