// Imported explicitly rather than left to Nuxt's auto-imports, like every other module the library
// pulls in: auto-import resolves at BUILD time, so a file added while the dev server runs is typed
// and undefined at runtime.
import { computed, ref } from 'vue'
import { albumService } from '~/services/albumService'
import { imageService, type LibraryImage } from '~/services/imageService'
import { rejectUnusableImage } from '~/core/helpers/imageUpload'
import { metadataTitle } from '~/core/helpers/imageMetadata'
import { titleFromFilename } from '~/core/helpers/imageName'
import { apiErrorMessage } from '~/core/helpers/error'

/**
 * The upload queue, shared by the dialog and by dropping files on the grid.
 *
 * ONE LOOP, TWO ENTRY POINTS. The dropzone is not a shortcut past the dialog: it does the same
 * validation, the same sequential upload, the same naming and the same filing, so a picture that
 * arrives by drop is indistinguishable from one that arrived through the form.
 */

/**
 * `existing` is a real outcome, not a variant of `created`.
 *
 * `POST /images` is idempotent on content: identical bytes always resolve to the same row, and the
 * server answers 200 rather than 201 to say so. Reporting that as a plain success would leave
 * someone believing they added a picture that has been in the library since March.
 *
 * `cancelled` is what a file never reached, so it can be told apart from one that failed.
 */
export type UploadStatus = 'pending' | 'uploading' | 'created' | 'existing' | 'failed' | 'cancelled'

export interface UploadItem {
    file: File
    status: UploadStatus
    message?: string
}

export interface UploadOutcome {
    created: number
    existing: number
    failed: number
    cancelled: number
}

export function useImageUpload() {
    const items = ref<UploadItem[]>([])
    const isUploading = ref(false)
    let stopped = false

    const pending = computed(() => items.value.filter((item) => item.status === 'pending'))
    const failed = computed(() => items.value.filter((item) => item.status === 'failed'))
    const succeeded = computed(() =>
        items.value.filter((item) => item.status === 'created' || item.status === 'existing'),
    )
    const settled = computed(
        () =>
            items.value.filter((item) => item.status !== 'pending' && item.status !== 'uploading')
                .length,
    )

    /**
     * Determinate, and honest about what it measures: files finished out of files picked.
     *
     * Per-file byte progress would need XHR, and ofetch exposes no upload progress event. A bar
     * that crawled per file and then jumped would be a worse lie than a coarse one.
     */
    const percent = computed(() =>
        items.value.length ? Math.round((settled.value / items.value.length) * 100) : 0,
    )

    /** Rejected at selection time, where someone can still do something about it. HEIC bites. */
    const addFiles = (files: File[]) => {
        for (const file of files) {
            const rejection = rejectUnusableImage(file)
            items.value.push(
                rejection
                    ? { file, status: 'failed', message: rejection.message }
                    : { file, status: 'pending' },
            )
        }
    }

    /**
     * The uploaded file's own name becomes the image's title.
     *
     * *** ONLY ON A NEW ROW, AND ONLY WHEN NOTHING IS NAMED. *** Upload is idempotent on content,
     * so re-posting a picture someone else uploaded and titled would otherwise rename THEIR row to
     * whatever this machine happened to call the file. First name wins, the rule `created_by`
     * already follows. Requested as a real `original_filename` column on 2026-08-30.
     *
     * A failure here is swallowed: the bytes are in, which is what was asked for, and failing an
     * upload over its label would be the worse trade.
     */
    const nameFromFile = async (image: LibraryImage, filename: string, created: boolean) => {
        if (!created || metadataTitle(image.metadata)) return
        const title = titleFromFilename(filename)
        if (!title) return
        try {
            await imageService.updateMetadata(image.id, { title })
        } catch {
            // Named by its id until someone renames it.
        }
    }

    /**
     * Sequential, not parallel.
     *
     * These are multi-MB microscopy frames and the server hashes and writes each one; a dozen at
     * once is a worse experience than a dozen in a row, and it makes the per-file status
     * meaningless.
     */
    const start = async (albumId: number | null): Promise<UploadOutcome> => {
        if (isUploading.value) return { created: 0, existing: 0, failed: 0, cancelled: 0 }
        isUploading.value = true
        stopped = false
        try {
            for (const item of items.value) {
                if (item.status !== 'pending') continue
                // Cancel takes effect between files. The request in flight is left to finish: a
                // half-written multipart body is the server's problem to reject, and aborting it
                // buys nothing anyone can see.
                if (stopped) {
                    item.status = 'cancelled'
                    continue
                }
                item.status = 'uploading'
                try {
                    const { image, created } = await imageService.upload(item.file)
                    item.status = created ? 'created' : 'existing'
                    await nameFromFile(image, item.file.name, created)
                    // Filing is idempotent too, so retrying a partly-filed batch is safe.
                    if (albumId !== null) await albumService.addImage(albumId, image.id)
                } catch (error) {
                    item.status = 'failed'
                    item.message = apiErrorMessage(error, 'Upload failed')
                }
            }
        } finally {
            isUploading.value = false
        }
        return {
            created: items.value.filter((item) => item.status === 'created').length,
            existing: items.value.filter((item) => item.status === 'existing').length,
            failed: failed.value.length,
            cancelled: items.value.filter((item) => item.status === 'cancelled').length,
        }
    }

    /** Stops the queue after the file in flight. Anything not started is marked cancelled. */
    const cancel = () => {
        stopped = true
        for (const item of items.value) if (item.status === 'pending') item.status = 'cancelled'
    }

    const reset = () => {
        items.value = []
        stopped = false
    }

    return {
        items,
        isUploading,
        pending,
        failed,
        succeeded,
        settled,
        percent,
        addFiles,
        start,
        cancel,
        reset,
    }
}
