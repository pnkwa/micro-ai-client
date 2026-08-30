// Imported explicitly rather than left to Nuxt's auto-imports: the unit suite runs plain Vitest
// with no Nuxt context, and a composable that cannot be imported outside the app cannot be tested.
import { computed, ref, type Ref } from 'vue'

/**
 * Multi-select over an ordered list of ids: plain click, Shift range, Cmd/Ctrl toggle, select all.
 *
 * THE ORDER IS THE VISIBLE ORDER, not the load order. A Shift range means "everything between these
 * two AS I SEE THEM", so the caller passes the filtered and sorted ids the grid is rendering. Pass
 * the raw list and a range over a sorted grid selects rows nobody pointed at.
 *
 * The anchor is the last plainly-clicked or toggled row, which is what makes a second Shift-click
 * REPLACE the range rather than extend it further: click 3, Shift-click 9, Shift-click 5 leaves 3
 * to 5 selected, the same as every file manager.
 */
export function useLibrarySelection(orderedIds: Ref<number[]>) {
    const selected = ref<Set<number>>(new Set())
    /** Where a Shift range measures from. Null once the anchor leaves the list. */
    const anchor = ref<number | null>(null)

    const isSelected = (id: number) => selected.value.has(id)
    const count = computed(() => selected.value.size)
    /** In visible order, so a bulk action processes them the way they are read. */
    const ids = computed(() => orderedIds.value.filter((id) => selected.value.has(id)))

    const clear = () => {
        selected.value = new Set()
        anchor.value = null
    }

    const replace = (id: number) => {
        selected.value = new Set([id])
        anchor.value = id
    }

    const toggle = (id: number) => {
        const next = new Set(selected.value)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        selected.value = next
        anchor.value = id
    }

    /**
     * The range ADDS to the selection rather than replacing it.
     *
     * Cmd-click three scattered images, then Shift-click to take a run of them, and losing the
     * first three would be the surprise. The anchor still moves nowhere: a further Shift-click
     * re-measures from the same origin.
     */
    const extendTo = (id: number) => {
        const list = orderedIds.value
        const to = list.indexOf(id)
        if (to === -1) return
        const from = anchor.value === null ? to : list.indexOf(anchor.value)
        // An anchor that has been filtered out of view leaves nothing to measure from, so this
        // behaves as a plain click rather than selecting from wherever it used to be.
        if (from === -1) return replace(id)
        const [start, end] = from <= to ? [from, to] : [to, from]
        const next = new Set(selected.value)
        for (const between of list.slice(start, end + 1)) next.add(between)
        selected.value = next
    }

    /** Everything currently VISIBLE, which is what Cmd-A means on a filtered grid. */
    const selectAll = () => {
        selected.value = new Set(orderedIds.value)
        anchor.value = orderedIds.value.at(-1) ?? null
    }

    /**
     * One entry point for a click, so the card does not have to know the rules.
     *
     * `meta` is Cmd on macOS and Ctrl elsewhere; the caller passes `event.metaKey || event.ctrlKey`.
     * Shift wins when both are held, matching Finder and Explorer.
     */
    const click = (id: number, modifiers: { shift?: boolean; meta?: boolean } = {}) => {
        if (modifiers.shift) return extendTo(id)
        if (modifiers.meta) return toggle(id)
        return replace(id)
    }

    /**
     * Drop ids that have gone: a deleted image, or a filter that no longer includes it.
     *
     * Without this a bulk action could act on something invisible, which is the worst kind of
     * surprise for a destructive one.
     */
    const prune = () => {
        const live = new Set(orderedIds.value)
        selected.value = new Set([...selected.value].filter((id) => live.has(id)))
        if (anchor.value !== null && !live.has(anchor.value)) anchor.value = null
    }

    return { selected, ids, count, isSelected, click, toggle, selectAll, clear, prune, anchor }
}
