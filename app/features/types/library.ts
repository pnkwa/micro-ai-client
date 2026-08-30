/**
 * How the library grid is ordered.
 *
 * Out here rather than in `LibraryToolbar.vue` because `<script setup>` cannot export values, only
 * types - and the phone's header renders the same sort options in its overflow menu, so the list
 * itself has to be importable. One list, two menus, no chance of them drifting.
 */
export type LibrarySort = 'newest' | 'oldest' | 'name' | 'shapes' | 'unreviewed'

export const LIBRARY_SORTS: { id: LibrarySort; label: string }[] = [
    { id: 'newest', label: 'Newest' },
    { id: 'oldest', label: 'Oldest' },
    { id: 'name', label: 'Name A-Z' },
    { id: 'shapes', label: 'Most shapes' },
    { id: 'unreviewed', label: 'Unreviewed first' },
]
