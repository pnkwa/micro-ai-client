import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useLibrarySelection } from './useLibrarySelection'

const list = () => ref([1, 2, 3, 4, 5, 6, 7, 8, 9])

describe('useLibrarySelection', () => {
    it('a plain click replaces whatever was selected', () => {
        const selection = useLibrarySelection(list())
        selection.click(3)
        selection.click(7)
        expect(selection.ids.value).toEqual([7])
    })

    it('Cmd-click adds and removes one at a time', () => {
        const selection = useLibrarySelection(list())
        selection.click(3)
        selection.click(7, { meta: true })
        selection.click(9, { meta: true })
        expect(selection.ids.value).toEqual([3, 7, 9])
        selection.click(7, { meta: true })
        expect(selection.ids.value).toEqual([3, 9])
    })

    it('Shift-click takes everything between, in visible order', () => {
        const selection = useLibrarySelection(list())
        selection.click(3)
        selection.click(6, { shift: true })
        expect(selection.ids.value).toEqual([3, 4, 5, 6])
    })

    it('extends backwards from the anchor just the same', () => {
        const selection = useLibrarySelection(list())
        selection.click(6)
        selection.click(3, { shift: true })
        expect(selection.ids.value).toEqual([3, 4, 5, 6])
    })

    /** The file-manager rule: the second Shift-click re-measures rather than piling on. */
    it('re-measures from the same anchor on a second Shift-click', () => {
        const selection = useLibrarySelection(list())
        selection.click(3)
        selection.click(9, { shift: true })
        selection.click(5, { shift: true })
        expect(selection.ids.value).toEqual([3, 4, 5, 6, 7, 8, 9])
    })

    it('keeps a scattered Cmd selection when a range is added to it', () => {
        const selection = useLibrarySelection(list())
        selection.click(1)
        selection.click(9, { meta: true })
        selection.click(7, { shift: true })
        expect(selection.ids.value).toEqual([1, 7, 8, 9])
    })

    /**
     * The order is the VISIBLE order, which is the reason this takes the grid's ids rather than
     * the page's. Sorted descending, a range from 8 to 6 is those three and nothing else.
     */
    it('ranges over the order it was given, not over the numbers', () => {
        const selection = useLibrarySelection(ref([9, 8, 7, 6, 5]))
        selection.click(8)
        selection.click(6, { shift: true })
        expect(selection.ids.value).toEqual([8, 7, 6])
    })

    it('Shift wins when Cmd is held too', () => {
        const selection = useLibrarySelection(list())
        selection.click(2)
        selection.click(4, { shift: true, meta: true })
        expect(selection.ids.value).toEqual([2, 3, 4])
    })

    it('selects everything visible, which is what Cmd-A means on a filtered grid', () => {
        const visible = ref([2, 4, 6])
        const selection = useLibrarySelection(visible)
        selection.selectAll()
        expect(selection.ids.value).toEqual([2, 4, 6])
        expect(selection.count.value).toBe(3)
    })

    it('clears', () => {
        const selection = useLibrarySelection(list())
        selection.selectAll()
        selection.clear()
        expect(selection.count.value).toBe(0)
        expect(selection.anchor.value).toBeNull()
    })

    it('prunes ids that have left the list, so a bulk action cannot touch them', () => {
        const visible = ref([1, 2, 3])
        const selection = useLibrarySelection(visible)
        selection.selectAll()
        visible.value = [1, 3]
        selection.prune()
        expect(selection.ids.value).toEqual([1, 3])
    })

    it('treats a Shift-click as a plain one when the anchor has been filtered away', () => {
        const visible = ref([1, 2, 3])
        const selection = useLibrarySelection(visible)
        selection.click(1)
        visible.value = [2, 3]
        selection.prune()
        selection.click(3, { shift: true })
        expect(selection.ids.value).toEqual([3])
    })
})
