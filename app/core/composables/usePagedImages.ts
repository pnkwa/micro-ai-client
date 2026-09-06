import { toast } from 'vue-sonner'
import { imageService, type ImageFilters, type LibraryImage } from '~/services/imageService'
import { apiErrorMessage } from '~/core/helpers/error'

/**
 * The SERVER-side filters a listing is a function of, or null to load NOTHING - the annotator uses
 * null for "no source chosen yet", so it never pulls the whole shared library on open.
 */
export type PagedImageFilters = Omit<ImageFilters, 'page' | 'per_page'> | null

export interface UsePagedImagesOptions {
    /** The current filters, recomputed on every read so it always reflects the live refs. */
    filters: () => PagedImageFilters
    perPage: number
    /** Toast text for a failed load. */
    errorMessage?: string
    /** Empty the list when a FRESH load fails. The library does; the annotator keeps what it had. */
    clearOnError?: boolean
    /** Start in the loading state, for a caller that fetches on mount and must not flash empty. */
    initialLoading?: boolean
}

/**
 * One paged image listing: `images`, its `total`, the page cursor, and the load / append / reset
 * dance the library grid and the annotator queue were hand-rolling identically.
 *
 * The filter change is a SIDE EFFECT (a refetch), so it stays a `watch` - but ONE, replacing the two
 * or three the callers each hand-rolled, so they no longer repeat `page = 1; load()` per ref. A fresh
 * filter always restarts at page 1: appending page 4 of the old query onto page 1 of the new one
 * interleaves two result sets. The INITIAL load is left to the caller (on mount, or when its first
 * filter arrives) so this owns no
 * lifecycle of its own.
 */
export function usePagedImages(options: UsePagedImagesOptions) {
    const images = ref<LibraryImage[]>([])
    const total = ref(0)
    const page = ref(1)
    const loading = ref(options.initialLoading ?? false)
    const hasMore = computed(() => images.value.length < total.value)

    const load = async (append = false) => {
        const filters = options.filters()
        if (filters === null) {
            images.value = []
            total.value = 0
            return
        }
        loading.value = true
        try {
            const result = await imageService.list({
                ...filters,
                page: page.value,
                per_page: options.perPage,
            })
            images.value = append ? [...images.value, ...result.data] : result.data
            total.value = result.total
        } catch (error) {
            toast.error(
                apiErrorMessage(error, options.errorMessage ?? 'Could not load the library'),
            )
            if (!append && options.clearOnError) {
                images.value = []
                total.value = 0
            }
        } finally {
            loading.value = false
        }
    }

    const loadMore = () => {
        if (loading.value || !hasMore.value) return
        page.value += 1
        void load(true)
    }

    // `filters()` returns a fresh object each call, and a getter's result is compared by identity, so
    // any change to a filter ref the closure reads makes it a new object and fires this once. The
    // reads inside `filters()` ARE the dependencies; no serialised key or `deep` is needed.
    watch(
        () => options.filters(),
        () => {
            page.value = 1
            void load()
        },
    )

    return { images, total, page, loading, hasMore, load, loadMore }
}
