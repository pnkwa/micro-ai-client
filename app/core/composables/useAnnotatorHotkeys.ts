import { useEventListener } from '@vueuse/core'
import { isTypingTarget, resolveHotkey, type HotkeyAction } from '~/core/helpers/annotatorHotkeys'

/**
 * The annotator's keyboard, in one place.
 *
 * The map itself is a pure function (`annotatorHotkeys`), unit tested; this owns only the listener,
 * the preventDefault policy and the held-Space state. Splitting them is what makes twenty bindings
 * testable at all, since a key that silently does nothing looks exactly like a key nobody bound.
 */

export interface AnnotatorHotkeyOptions {
    /** Called with whatever the key resolved to. One handler, so the page routes in one place. */
    onAction: (action: HotkeyAction) => void
    /** Turned off while a modal owns the keyboard. */
    enabled?: Ref<boolean>
}

export function useAnnotatorHotkeys(options: AnnotatorHotkeyOptions) {
    /**
     * Space, held, pans - so someone can drag the picture without leaving the polygon tool.
     *
     * Tracked here rather than resolved as an action because it is a STATE, not an event: the
     * canvas needs to know it is held for as long as it is held, and a keydown that repeats would
     * fire an action dozens of times.
     */
    const spacePanning = ref(false)

    const isEnabled = () => options.enabled?.value !== false

    useEventListener('keydown', (event: KeyboardEvent) => {
        if (!isEnabled()) return

        const target = event.target as HTMLElement | null
        const described = {
            key: event.key,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            targetTag: target?.tagName,
            targetEditable: target?.isContentEditable,
        }

        if (event.key === ' ' && !isTypingTarget(described)) {
            // The page would scroll otherwise, and `repeat` means holding it does not re-fire.
            event.preventDefault()
            if (!event.repeat) spacePanning.value = true
            return
        }

        const action = resolveHotkey(described)
        if (!action) return

        // Only for keys we actually handle: a blanket preventDefault would eat browser find, print
        // and the caret keys inside every field on the page.
        event.preventDefault()
        options.onAction(action)
    })

    useEventListener('keyup', (event: KeyboardEvent) => {
        if (event.key === ' ') spacePanning.value = false
    })

    // A window that loses focus mid-drag never sees the keyup, and the canvas would stay stuck in
    // pan mode until Space was pressed and released again.
    useEventListener('blur', () => (spacePanning.value = false))

    return { spacePanning }
}
