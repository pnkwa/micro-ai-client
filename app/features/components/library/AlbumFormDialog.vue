<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { ALBUM_KINDS, type Album, type AlbumInput } from '~/services/albumService'
import { albumFormSchema, type AlbumFormData } from '~/features/types/forms/album'

/**
 * Create or rename an album. CONTENT ONLY - the page owns the dialog, as CreateClass.vue does.
 *
 * The content sits inside a portal that exists only while open, so this mounts fresh on every open
 * and `initialValues` IS the reset. That replaces a watcher that had to guess when to clear the
 * form, and before that a `@vue:mounted` hook which depended on how DialogContent forwards attrs
 * and silently kept the previous album's values when it did not fire.
 */
const props = defineProps<{
    /** Set to edit; omit to create. */
    album?: Album | null
    loading?: boolean
}>()

const emit = defineEmits<{ close: []; save: [input: AlbumInput] }>()

const { handleSubmit } = useForm<AlbumFormData>({
    validationSchema: toTypedSchema(albumFormSchema),
    initialValues: {
        name: props.album?.name ?? '',
        description: props.album?.description ?? '',
        kind: props.album?.kind ?? 'personal',
    },
})

const handleSave = handleSubmit((values) => {
    emit('save', {
        name: values.name.trim(),
        // An emptied field clears the column: PATCH reads an omitted key as "leave it alone" and an
        // explicit null as "delete it", so the two cases have to be told apart here.
        description: values.description?.trim() || null,
        kind: values.kind,
    })
})

const kindOptions = ALBUM_KINDS.map((value) => ({
    value,
    label:
        value === 'curated'
            ? 'Curated (vetted: usable for question authoring)'
            : value === 'personal'
              ? 'Personal (a working set)'
              : 'System',
}))
</script>

<template>
    <McDialogHeader>
        <McDialogTitle>{{ album ? 'Edit album' : 'New album' }}</McDialogTitle>
        <McDialogDescription>
            An album is a named set of images. Deleting one unfiles its images rather than deleting
            them. Dragging a picture onto an album moves it there; use an image's own panel if it
            needs to sit in more than one.
        </McDialogDescription>
    </McDialogHeader>

    <form class="tw:flex tw:flex-col tw:gap-4 tw:py-4" @submit.prevent="handleSave">
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Name</label>
            <McInput name="name" placeholder="e.g., HRP unknowns, vetted fields" />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Description</label>
            <McTextarea
                name="description"
                rows="2"
                placeholder="e.g., Fields of view good enough to ask a question about"
            />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Kind</label>
            <McSelect
                name="kind"
                :options="kindOptions"
                option-value="value"
                option-label="label"
                placeholder="Select a kind"
            />
            <!-- `personal` is the server's default so a new album is never accidentally an
                 authoring pool. Annotation is no longer gated on this (BE-ADR-030, amended
                 2026-08-26); question authoring still is. -->
            <p class="tw:text-xs tw:text-navy-60">
                Only images in a curated album can be used to author a question.
            </p>
        </div>
    </form>

    <McDialogFooter>
        <McButton variant="outline" @click="emit('close')">Cancel</McButton>
        <McButton :loading="loading" @click="handleSave">
            {{ album ? 'Save' : 'Create' }}
        </McButton>
    </McDialogFooter>
</template>
