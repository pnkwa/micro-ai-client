// Imported explicitly rather than left to Nuxt's auto-imports: the unit suite runs plain Vitest
// with no Nuxt context, and a composable that cannot be imported outside the app cannot be tested.
import { computed, ref } from 'vue'

/**
 * Dragging cards onto an album row, on POINTER EVENTS.
 *
 * *** NOT THE HTML5 DRAG-AND-DROP API, AND THE TWO MUST NOT MEET. *** Native DnD gives no reliable
 * control over the drag image, does nothing on touch, and - the reason that actually bites - its
 * `dragover` fires over the same pixels as the Finder-to-page file drop, so a card dragged across
 * the grid raises the upload overlay. The file drop stays native and filters on
 * `dataTransfer.types.includes('Files')` (see `carriesFiles`); everything internal comes through
 * here and never touches `dataTransfer` at all.
 *
 * Hit-testing is `elementFromPoint` against `data-drop-album`, rather than each row reporting its
 * rectangle. The rows live in another component and the list scrolls under the pointer, so a cached
 * rect is wrong the moment it auto-scrolls; the DOM already knows what is under the cursor.
 */

/** How far a pointer travels before this is a drag rather than a click. */
const THRESHOLD = 5
/** A finger has to REST before it drags, or scrolling the grid would file images. */
const LONG_PRESS_MS = 400
/** Movement that cancels a long press: that was a scroll, not a hold. */
const SCROLL_SLOP = 10
/** How close to an edge before the album list scrolls itself, and by how much per frame. */
const EDGE = 40
const EDGE_STEP = 8
/** Hold a dragged selection over the album chip this long and the drawer opens itself. */
const SPRING_MS = 600

export interface DragPayload {
    /** In visible order. What lands in the album. */
    ids: number[]
    /** Up to three thumbnails for the ghost, best first. */
    thumbnails: string[]
    /** The single image's name, or empty for a batch (the ghost shows the count instead). */
    label: string
}

/** What a row publishes about itself, read off the DOM at drop time. */
export interface DropTarget {
    /** An album id, or `new` for the create-on-drop row. */
    album: number | 'new'
    /** The row refuses the drop, e.g. it already holds every dragged image. */
    disabled: boolean
}

/** The native file-drop guard. Anything without files is an internal drag and not ours. */
export const carriesFiles = (event: DragEvent): boolean =>
    event.dataTransfer?.types.includes('Files') ?? false

const readTarget = (x: number, y: number): DropTarget | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-drop-album]')
    if (!(el instanceof HTMLElement)) return null
    const raw = el.dataset.dropAlbum
    if (!raw) return null
    return {
        album: raw === 'new' ? 'new' : Number(raw),
        disabled: el.dataset.dropDisabled === 'true',
    }
}

export function useAlbumDrag(
    onDrop: (album: number | 'new', ids: number[]) => void,
    options: {
        /**
         * Hovering `[data-drop-spring]` for 600ms calls this: the tablet's album chip, which opens
         * the drawer under the pointer so a drag can reach rows that are not on screen.
         *
         * Spring-loading rather than a second gesture, because the alternative is dropping the
         * drag, opening the drawer, and starting again - by which time the selection is what you
         * are thinking about instead of where it is going.
         */
        onSpring?: () => void
        /** False below Medium: a phone has no album column to drag to, so there is no drag. */
        enabled?: () => boolean
    } = {},
) {
    /** Armed and moving. A press that has not passed the threshold is not a drag yet. */
    const dragging = ref(false)
    const payload = ref<DragPayload | null>(null)
    const position = ref({ x: 0, y: 0 })
    const target = ref<DropTarget | null>(null)

    let origin = { x: 0, y: 0 }
    let armed = false
    let longPress: ReturnType<typeof setTimeout> | null = null
    let scroller: HTMLElement | null = null
    let frame: number | null = null
    let spring: ReturnType<typeof setTimeout> | null = null
    let springing = false

    const ids = computed(() => payload.value?.ids ?? [])
    /** The row a drop would land on, so the sidebar can paint exactly one. */
    const targetAlbum = computed(() =>
        target.value?.disabled ? null : (target.value?.album ?? null),
    )

    /**
     * Scroll the album list when the pointer nears its edge.
     *
     * A short list today, and not later. Runs on its own frame loop rather than per pointermove,
     * because a pointer held still at the edge produces no events and would stop scrolling.
     */
    const step = () => {
        frame = null
        if (!dragging.value || !scroller) return
        const box = scroller.getBoundingClientRect()
        const y = position.value.y
        if (y - box.top < EDGE) scroller.scrollTop -= EDGE_STEP
        else if (box.bottom - y < EDGE) scroller.scrollTop += EDGE_STEP
        frame = requestAnimationFrame(step)
    }

    const stop = () => {
        dragging.value = false
        payload.value = null
        target.value = null
        armed = false
        scroller = null
        if (longPress) clearTimeout(longPress)
        longPress = null
        if (spring) clearTimeout(spring)
        spring = null
        springing = false
        if (frame) cancelAnimationFrame(frame)
        frame = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', stop)
    }

    const activate = () => {
        if (armed) return
        armed = true
        dragging.value = true
        scroller = document.querySelector<HTMLElement>('[data-album-scroll]')
        frame = requestAnimationFrame(step)
    }

    const onMove = (event: PointerEvent) => {
        position.value = { x: event.clientX, y: event.clientY }
        const travelled = Math.hypot(event.clientX - origin.x, event.clientY - origin.y)

        if (!armed) {
            // A finger that moves before the hold completes was scrolling the grid.
            if (event.pointerType === 'touch') {
                if (travelled > SCROLL_SLOP) stop()
                return
            }
            if (travelled > THRESHOLD) activate()
            else return
        }

        // The drag owns the gesture from here: without this the grid scrolls under the ghost on a
        // touch device, and text selects on a mouse.
        event.preventDefault()
        target.value = readTarget(event.clientX, event.clientY)
        armSpring(event.clientX, event.clientY)
    }

    /**
     * The spring: one timer, started when the pointer enters the chip and cleared when it leaves.
     *
     * Restarting it on every pointermove would mean it never fires, since a hand holding still
     * still emits events; `springing` is what makes "already over it" different from "just
     * arrived".
     */
    const armSpring = (x: number, y: number) => {
        const over = Boolean(document.elementFromPoint(x, y)?.closest('[data-drop-spring]'))
        if (over === springing) return
        springing = over
        if (spring) clearTimeout(spring)
        spring = over ? setTimeout(() => options.onSpring?.(), SPRING_MS) : null
    }

    const onUp = () => {
        const landing = target.value
        const carried = payload.value?.ids ?? []
        const wasDragging = dragging.value
        stop()
        if (wasDragging && landing && !landing.disabled && carried.length) {
            onDrop(landing.album, carried)
        }
    }

    /**
     * Called from a card's `pointerdown`. Does NOT start a drag by itself.
     *
     * The card keeps its click and its double click: nothing happens here until the pointer has
     * travelled, or a finger has rested for 400ms, so a plain click never becomes a drag.
     */
    const begin = (event: PointerEvent, next: DragPayload) => {
        if (options.enabled && !options.enabled()) return
        if (event.button !== 0 && event.pointerType === 'mouse') return
        stop()
        payload.value = next
        origin = { x: event.clientX, y: event.clientY }
        position.value = { x: event.clientX, y: event.clientY }
        window.addEventListener('pointermove', onMove, { passive: false })
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', stop)
        if (event.pointerType === 'touch') longPress = setTimeout(activate, LONG_PRESS_MS)
    }

    return { dragging, ids, payload, position, target, targetAlbum, begin, cancel: stop }
}
