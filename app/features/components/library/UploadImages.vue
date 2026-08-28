<script setup lang="ts">
import { AlertCircle, Check, CircleDot, Loader2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { uploadImagesFormSchema, type UploadImagesFormData } from '~/features/types/forms/upload'
import type { Album } from '~/services/albumService'
import { albumService } from '~/services/albumService'
import { imageService } from '~/services/imageService'
import { rejectUnusableImage } from '~/core/helpers/imageUpload'

/**
 * Upload images into the library. CONTENT ONLY - the page owns the dialog.
 *
 * That split is the whole reason this file exists in this shape, and it follows `CreateClass.vue`.
 * An earlier version wrapped its own `McDialog` and took `open` as a model, so the open state had
 * to round-trip a component boundary: the X, the overlay and Escape all set reka-ui's internal
 * state, which emitted up to the child, which emitted up to the page. Every hop was correct in
 * isolation and the dialog still would not close.
 *
 * With the dialog outside, there is one owner of one ref and nothing to keep in step. It also means
 * this component is MOUNTED FRESH on every open, because the content lives inside a portal that
 * only renders while open - so the initial state below IS the reset, and the watcher that used to
 * do it is gone.
 */
const props = defineProps<{
    albums: Album[]
    /** Pre-selects the album the grid is currently showing, so upload and filing are one gesture. */
    defaultAlbumId?: number | null
}>()

const emit = defineEmits<{ close: []; uploaded: [] }>()

/**
 * `existing` is a real outcome, not a variant of `created`.
 *
 * `POST /images` is idempotent on content: identical bytes always resolve to the same row, and the
 * server answers 200 rather than 201 to say so. Reporting that as a plain success would leave
 * someone believing they added a picture that has been in the library since March.
 */
type ItemStatus = 'pending' | 'uploading' | 'created' | 'existing' | 'failed'

interface UploadItem {
    file: File
    status: ItemStatus
    message?: string
}

const items = ref<UploadItem[]>([])
const isUploading = ref(false)
const done = ref(false)

/**
 * The album choice is the only FORM field here, so it goes through vee-validate like every other
 * form in the app rather than a bare ref - `McSelect name="albumId"` binds to it.
 *
 * The files are not a field: they arrive through a dropzone and each carries its own status, which
 * one validation message could not express. `initialValues` doubles as the reset, because this
 * component mounts fresh on every open.
 */
const { handleSubmit } = useForm<UploadImagesFormData>({
    validationSchema: toTypedSchema(uploadImagesFormSchema),
    initialValues: { albumId: props.defaultAlbumId ?? null },
})

const albumOptions = computed(() => [
    { value: null as number | null, label: 'Do not file into an album' },
    ...props.albums.map((album) => ({
        value: album.id as number | null,
        label: album.kind === 'curated' ? `${album.name} (curated)` : album.name,
    })),
])

const addFiles = (files: File[]) => {
    for (const file of files) {
        // Checked at selection time, where someone can still do something about it, rather than
        // after an upload that looked like it worked. HEIC is the one that actually bites.
        const rejection = rejectUnusableImage(file)
        items.value.push(
            rejection
                ? { file, status: 'failed', message: rejection.message }
                : { file, status: 'pending' },
        )
    }
}

const pending = computed(() => items.value.filter((item) => item.status === 'pending'))
const failed = computed(() => items.value.filter((item) => item.status === 'failed'))
const succeeded = computed(() =>
    items.value.filter((item) => item.status === 'created' || item.status === 'existing'),
)
const settled = computed(() => succeeded.value.length + failed.value.length)

// Determinate, and honest about what it measures: files finished out of files picked. Per-file byte
// progress would need XHR, and ofetch exposes no upload progress event.
const percent = computed(() =>
    items.value.length ? Math.round((settled.value / items.value.length) * 100) : 0,
)

/**
 * Sequential, not parallel.
 *
 * These are multi-MB microscopy frames and the server hashes and writes each one; a dozen at once is
 * a worse experience than a dozen in a row, and it makes the per-file status meaningless.
 */
const start = handleSubmit(async (values) => {
    if (isUploading.value) return
    isUploading.value = true
    const albumId = values.albumId
    try {
        for (const item of items.value) {
            if (item.status !== 'pending') continue
            item.status = 'uploading'
            try {
                const { image, created } = await imageService.upload(item.file)
                item.status = created ? 'created' : 'existing'
                // Filing is idempotent too, so retrying a partly-filed batch is safe.
                if (albumId !== null) await albumService.addImage(albumId, image.id)
            } catch (error) {
                item.status = 'failed'
                item.message = apiErrorMessage(error, 'Upload failed')
            }
        }
    } finally {
        isUploading.value = false
        done.value = true
    }

    if (succeeded.value.length) emit('uploaded')

    if (failed.value.length) {
        // Stay open: the per-file reason is the only place that says WHY, and a toast cannot hold
        // it. The button below now reads "Close", so the way out is obvious.
        toast.error(`${failed.value.length} file(s) could not be uploaded.`)
        return
    }

    const created = items.value.filter((item) => item.status === 'created').length
    const existing = succeeded.value.length - created
    toast.success(
        [created ? `${created} uploaded` : '', existing ? `${existing} already in the library` : '']
            .filter(Boolean)
            .join(', ') || 'Nothing to upload',
    )
    emit('close')
})

const statusLabel = (item: UploadItem): string => {
    if (item.status === 'created') return 'Uploaded'
    if (item.status === 'existing') return 'Already in the library'
    if (item.status === 'failed') return item.message ?? 'Failed'
    if (item.status === 'uploading') return 'Uploading...'
    return 'Ready'
}
</script>

<template>
    <McDialogHeader>
        <McDialogTitle>Upload images</McDialogTitle>
        <McDialogDescription>
            Stored as-is. No model runs over them, and nothing is submitted for grading.
        </McDialogDescription>
    </McDialogHeader>

    <div class="tw:flex tw:flex-col tw:gap-3 tw:py-2">
        <McFileDropzone
            accept="image/*"
            multiple
            :disabled="isUploading"
            label="Drag & drop or click to choose images"
            hint="Drop the images here"
            @files="addFiles"
        />

        <div class="tw:flex tw:flex-col tw:gap-1.5">
            <label class="tw:text-sm tw:font-medium tw:text-navy-80">Add to Album</label>
            <McSelect
                name="albumId"
                :options="albumOptions"
                option-value="value"
                option-label="label"
                :disabled="isUploading"
            />
        </div>

        <div v-if="isUploading || done" class="tw:flex tw:flex-col tw:gap-1">
            <McProgress :model-value="percent" class="tw:h-2" />
            <p class="tw:text-xs tw:text-navy-60">
                {{ settled }} of {{ items.length }} finished
                <span v-if="failed.length" class="tw:text-danger">
                    ({{ failed.length }} failed)
                </span>
            </p>
        </div>

        <ul
            v-if="items.length"
            class="tw:max-h-56 tw:overflow-y-auto tw:rounded-lg tw:border tw:border-navy-15"
        >
            <li
                v-for="(item, index) in items"
                :key="`${item.file.name}-${index}`"
                class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-navy-10 tw:px-3 tw:py-2 tw:last:border-b-0"
            >
                <Loader2
                    v-if="item.status === 'uploading'"
                    class="tw:h-4 tw:w-4 tw:shrink-0 tw:animate-spin tw:text-primary"
                />
                <Check
                    v-else-if="item.status === 'created' || item.status === 'existing'"
                    class="tw:h-4 tw:w-4 tw:shrink-0 tw:text-success"
                />
                <AlertCircle
                    v-else-if="item.status === 'failed'"
                    class="tw:h-4 tw:w-4 tw:shrink-0 tw:text-danger"
                />
                <CircleDot v-else class="tw:h-4 tw:w-4 tw:shrink-0 tw:text-navy-40" />

                <div class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
                    <span class="tw:truncate tw:text-sm tw:text-navy-100">
                        {{ item.file.name }}
                    </span>
                    <span
                        class="tw:text-xs"
                        :class="
                            item.status === 'failed'
                                ? 'tw:text-danger'
                                : item.status === 'existing'
                                  ? 'tw:text-warning'
                                  : 'tw:text-navy-60'
                        "
                    >
                        {{ statusLabel(item) }}
                    </span>
                </div>
            </li>
        </ul>
    </div>

    <McDialogFooter>
        <McButton variant="outline" @click="emit('close')">
            {{ done ? 'Close' : 'Cancel' }}
        </McButton>
        <McButton :disabled="!pending.length" :loading="isUploading" @click="start">
            Upload{{ pending.length ? ` ${pending.length}` : '' }}
        </McButton>
    </McDialogFooter>
</template>
