import { FILE_SIZE } from '~/core/constant/file'

/**
 * Guard for a student-supplied microscopy photo (client request 3.2, mobile upload).
 *
 * Shared by both student submit paths so a photo that passes in one cannot fail in the other:
 * the exam's slide stations (StudentExamForm) and an exercise's image_detection questions
 * (StudentExerciseForm).
 */

/**
 * HEIC is what an iPhone shoots by default, and it is the single most likely upload to break.
 *
 * The worker opens images with plain `PIL.Image.open` and the image-processor has no
 * `pillow-heif`, so a HEIC that gets through raises UnidentifiedImageError and the detection
 * fails AFTER a submit that looked successful. iOS often transcodes to JPEG on its way through a
 * file picker, which is exactly why this survives casual testing: the failure depends on the path
 * the student took to the file, not on the phone.
 *
 * Rejected at selection time, where the student can still do something about it, rather than
 * server-side after the fact.
 */
const HEIC_EXTENSIONS = ['.heic', '.heif']

const isHeic = (file: File): boolean => {
    const name = file.name.toLowerCase()
    return (
        HEIC_EXTENSIONS.some((ext) => name.endsWith(ext)) ||
        file.type === 'image/heic' ||
        file.type === 'image/heif'
    )
}

const megabytes = (bytes: number): string => `${Math.round(bytes / 1_000_000)}MB`

export interface ImageRejection {
    /** Shown to the student verbatim, so it has to say what to do next, not just what is wrong. */
    message: string
}

/**
 * Null when the file is usable; a rejection with a student-facing message otherwise.
 *
 * Order matters: HEIC is checked before size because a HEIC that is also too large should say the
 * thing the student can actually act on first.
 */
export function rejectUnusableImage(file: File): ImageRejection | null {
    if (isHeic(file)) {
        return {
            message:
                'iPhone HEIC photos cannot be read. On iOS set Camera > Formats > Most Compatible, then re-take the photo, or export it as JPEG.',
        }
    }

    // `accept="image/*"` is a hint the file picker can ignore, and a shared file can arrive with
    // any type at all.
    if (file.type && !file.type.startsWith('image/')) {
        return { message: 'That is not an image. Attach a photo of the field of view.' }
    }

    if (file.size > FILE_SIZE.MAX) {
        return {
            message: `That photo is ${megabytes(file.size)}. The limit is ${megabytes(FILE_SIZE.MAX)} - re-take it at a lower resolution.`,
        }
    }

    // A file this small is not a microscope field; usually a broken share or a placeholder.
    if (file.size < FILE_SIZE.MIN) {
        return { message: 'That file looks empty. Attach the photo again.' }
    }

    return null
}
