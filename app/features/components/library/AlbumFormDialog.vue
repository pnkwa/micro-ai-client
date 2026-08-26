<script setup lang="ts">
import { ALBUM_KINDS, type Album, type AlbumInput, type AlbumKind } from '~/services/albumService'

const props = defineProps<{
    open: boolean
    /** Set to edit; omit to create. */
    album?: Album | null
    loading?: boolean
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    save: [input: AlbumInput]
}>()

const name = ref('')
const description = ref('')
const kind = ref<AlbumKind>('personal')

const reset = () => {
    name.value = props.album?.name ?? ''
    description.value = props.album?.description ?? ''
    kind.value = props.album?.kind ?? 'personal'
}

// Reset when the dialog OPENS, from the prop. Watching `props.album` alone would miss reopening
// for the same album after a cancelled edit, and the `@vue:mounted` hook this replaces depended on
// reka-ui's portal mounting and on how DialogContent forwards attrs - neither ours to rely on, and
// when it silently did not fire the form kept the previous album's values.
watch(
    () => props.open,
    (open) => {
        if (open) reset()
    },
    { immediate: true },
)

const kindOptions = ALBUM_KINDS.map((value) => ({
    value,
    label:
        value === 'curated'
            ? 'Curated (vetted: usable for question authoring and annotation)'
            : value === 'personal'
              ? 'Personal (a working set)'
              : 'System',
}))

const canSave = computed(() => name.value.trim().length > 0)

const submit = () => {
    if (!canSave.value) return
    emit('save', {
        name: name.value.trim(),
        description: description.value.trim() || null,
        kind: kind.value,
    })
}
</script>

<template>
    <McDialog :open="open" @update:open="emit('update:open', $event)">
        <McDialogContent class="tw:sm:max-w-md">
            <McDialogHeader>
                <McDialogTitle>{{ album ? 'Edit album' : 'New album' }}</McDialogTitle>
                <McDialogDescription>
                    An album is a named set of images. Deleting one unfiles its images rather than
                    deleting them. Dragging a picture onto an album moves it there; use an image's
                    own panel if it needs to sit in more than one.
                </McDialogDescription>
            </McDialogHeader>

            <div class="tw:flex tw:flex-col tw:gap-3 tw:py-2">
                <div class="tw:flex tw:flex-col tw:gap-1.5">
                    <label class="tw:text-sm tw:font-medium tw:text-navy-80">Name</label>
                    <McInput v-model="name" placeholder="HRP unknowns, vetted fields" />
                </div>

                <div class="tw:flex tw:flex-col tw:gap-1.5">
                    <label class="tw:text-sm tw:font-medium tw:text-navy-80">Description</label>
                    <McTextarea
                        v-model="description"
                        rows="2"
                        placeholder="Fields of view good enough to ask a question about"
                    />
                </div>

                <div class="tw:flex tw:flex-col tw:gap-1.5">
                    <label class="tw:text-sm tw:font-medium tw:text-navy-80">Kind</label>
                    <McSelect v-model="kind" :options="kindOptions" />
                    <!-- The default is `personal` on the server for this reason, so say it here
                         rather than letting someone discover it by being refused an annotation. -->
                    <p class="tw:text-xs tw:text-navy-60">
                        Only images in a curated album can be annotated or used to author a
                        question.
                    </p>
                </div>
            </div>

            <McDialogFooter>
                <McButton variant="outline" @click="emit('update:open', false)">Cancel</McButton>
                <McButton :disabled="!canSave" :loading="loading" @click="submit">
                    {{ album ? 'Save' : 'Create' }}
                </McButton>
            </McDialogFooter>
        </McDialogContent>
    </McDialog>
</template>
