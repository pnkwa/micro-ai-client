import z from 'zod'

/**
 * The upload dialog's own form.
 *
 * Only the album choice: the files themselves are not a form field - they arrive through a dropzone
 * and each carries its own per-file status, which a single validation message could not express.
 * `null` is a real value here and means "do not file it anywhere", so it is nullable rather than
 * optional: absent and "deliberately none" are different answers.
 */
export const uploadImagesFormSchema = z.object({
    albumId: z.number().nullable(),
})

export type UploadImagesFormData = z.infer<typeof uploadImagesFormSchema>
