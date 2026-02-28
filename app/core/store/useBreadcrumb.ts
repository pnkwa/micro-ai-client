import type { BreadcrumbItem } from '../types/store/breadcrumb'

export const useBreadcrumb = defineStore('breadcrumb', () => {
    const items = ref<BreadcrumbItem[]>([])

    const setBreadcrumbs = (newItems: BreadcrumbItem[]) => {
        items.value = newItems
    }

    const clearBreadcrumbs = () => {
        items.value = []
    }

    return {
        items,
        setBreadcrumbs,
        clearBreadcrumbs,
    }
})
