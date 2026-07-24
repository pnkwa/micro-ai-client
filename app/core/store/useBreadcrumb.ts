import type { BreadcrumbItem } from '../types/store/breadcrumb'

type BreadcrumbSource = BreadcrumbItem[] | (() => BreadcrumbItem[])

export const useBreadcrumb = defineStore('breadcrumb', () => {
    // Held as a getter rather than a snapshot: a page whose breadcrumbs are built from data
    // that loads after mount (an assignment name, a collection name) can register the getter
    // once and `items` re-derives whenever the values it reads change — no page-side watcher.
    // A plain array still works; it's wrapped as a constant getter.
    const source = shallowRef<() => BreadcrumbItem[]>(() => [])
    const items = computed(() => source.value())

    const setBreadcrumbs = (next: BreadcrumbSource) => {
        source.value = typeof next === 'function' ? next : () => next
    }

    const clearBreadcrumbs = () => {
        source.value = () => []
    }

    return {
        items,
        setBreadcrumbs,
        clearBreadcrumbs,
    }
})
