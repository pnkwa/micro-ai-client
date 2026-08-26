<script setup lang="ts">
import { AlertCircle, Check, CircleDot, Loader2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { Album } from '~/services/albumService'
import { albumService } from '~/services/albumService'
import { imageService } from '~/services/imageService'
import { rejectUnusableImage } from '~/core/helpers/imageUpload'

const props = defineProps<{
    open: boolean
    albums: Album[]
    /** Pre-selects the album the grid is currently showing, so upload and filing are one gesture. */
    defaultAlbumId?: number | null
}>()

const emit = defineEmits<{ 'update:open': [value: boolean]; uploaded: [] }>()

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
const albumId = ref<number | null>(null)
const done = ref(false)

const albumOptions = computed(() => [
    { value: null as number | null, label: 'Do not file into an album' },
    ...props.albums.map((album) => ({
        value: album.id as number | null,
        label: album.kind === 'curated' ? `${album.name} (curated)` : album.name,
    })),
])

const reset = () => {
    items.value = []
    isUploading.value = false
    done.value = false
    albumId.value = props.defaultAlbumId ?? null
}

// Reset when the dialog OPENS, from the prop rather than from a vnode hook. `@vue:mounted` on the
// content depended on reka-ui's portal mounting behaviour and on how DialogContent forwards
// attrs, neither of which is ours to rely on - and when it silently did not fire, the form kept
// the previous batch and looked like it had failed to close.
watch(
    () => props.open,
    (open) => {
        if (open) reset()
    },
    { immediate: true },
)

const addFiles = (files: File[]) => {
    // A new pick after a finished batch starts a new batch rather than appending to the report.
    if (done.value) reset()
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

// Determinate, and honest about what it measures: files finished out of files picked. Per-file
// byte progress would need XHR, and ofetch does not expose an upload progress event.
const percent = computed(() =>
    items.value.length ? Math.round((settled.value / items.value.length) * 100) : 0,
)

/**
 * Sequential, not parallel.
 *
 * These are multi-MB microscopy frames and the server hashes and writes each one; a dozen at once
 * is a worse experience than a dozen in a row, and it makes the per-file status meaningless.
 */
const start = async () => {
    if (isUploading.value) return
    isUploading.value = true
    try {
        for (const item of items.value) {
            if (item.status !== 'pending') continue
            item.status = 'uploading'
            try {
                const { image, created } = await imageService.upload(item.file)
                item.status = created ? 'created' : 'existing'
                // Filing is idempotent too, so retrying a partly-filed batch is safe.
                if (albumId.value !== null) await albumService.addImage(albumId.value, image.id)
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

    // Close on a clean run and report in a toast; stay open when something failed, because the
    // per-file reason is the only place that says WHY and a toast cannot hold it.
    if (!failed.value.length) {
        const created = items.value.filter((item) => item.status === 'created').length
        const existing = succeeded.value.length - created
        toast.success(
            [
                created ? `${created} uploaded` : '',
                existing ? `${existing} already in the library` : '',
            ]
                .filter(Boolean)
                .join(', ') || 'Nothing to upload',
        )
        emit('update:open', false)
    }
}

/**
 * Closing is ALWAYS allowed.
 *
 * The previous version refused while an upload was in flight, which meant the X and the overlay
 * silently did nothing and the dialog read as stuck. An upload already in flight completes on the
 * server either way - it is a POST, not a transaction this dialog holds open - so refusing to
 * close buys nothing and costs the only exit.
 */
const setOpen = (value: boolean) => emit('update:open', value)

const statusLabel = (item: UploadItem): string => {
    if (item.status === 'created') return 'Uploaded'
    if (item.status === 'existing') return 'Already in the library'
    if (item.status === 'failed') return item.message ?? 'Failed'
    if (item.status === 'uploading') return 'Uploading...'
    return 'Ready'
}
</script>

<template>
    <McDialog :open="open" @update:open="setOpen">
        <McDialogContent class="tw:sm:max-w-lg">
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
                    <label class="tw:text-sm tw:font-medium tw:text-navy-80">File into</label>
                    <McSelect v-model="albumId" :options="albumOptions" :disabled="isUploading" />
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
                <McButton variant="outline" @click="setOpen(false)">
                    {{ done ? 'Close' : 'Cancel' }}
                </McButton>
                <McButton :disabled="!pending.length" :loading="isUploading" @click="start">
                    Upload{{ pending.length ? ` ${pending.length}` : '' }}
                </McButton>
            </McDialogFooter>
        </McDialogContent>
    </McDialog>
</template>
