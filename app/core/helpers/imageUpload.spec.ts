import { describe, expect, it } from 'vitest'
import { rejectUnusableImage } from './imageUpload'
import { FILE_SIZE } from '~/core/constant/file'

/** A File of a given size without allocating the bytes, so the size cases stay cheap. */
const fileOf = (name: string, type: string, size: number): File => {
    const file = new File(['x'], name, { type })
    Object.defineProperty(file, 'size', { value: size })
    return file
}

const usable = (name = 'fov.jpg', type = 'image/jpeg', size = 2_000_000) => fileOf(name, type, size)

describe('rejectUnusableImage', () => {
    it('accepts an ordinary phone photo', () => {
        expect(rejectUnusableImage(usable())).toBeNull()
    })

    it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
        expect(rejectUnusableImage(usable('fov', type))).toBeNull()
    })

    // The case that motivated the whole guard: an iPhone default-format photo reaches the worker,
    // which has no pillow-heif, and the detection fails after a submit that looked fine.
    describe('HEIC', () => {
        it.each([
            ['IMG_0001.HEIC', ''],
            ['img.heic', ''],
            ['img.heif', ''],
            ['photo', 'image/heic'],
            ['photo', 'image/heif'],
        ])('rejects %s (%s)', (name, type) => {
            const rejection = rejectUnusableImage(fileOf(name, type, 2_000_000))
            expect(rejection).not.toBeNull()
            // The message has to say what to do, not just what is wrong.
            expect(rejection!.message).toMatch(/Most Compatible|JPEG/)
        })

        it('is caught by extension even when the type is a lie', () => {
            expect(rejectUnusableImage(fileOf('x.heic', 'image/jpeg', 2_000_000))).not.toBeNull()
        })

        // HEIC is reported before size, because that is the one the student can act on.
        it('takes precedence over an oversized file', () => {
            const rejection = rejectUnusableImage(fileOf('big.heic', '', FILE_SIZE.MAX + 1))
            expect(rejection!.message).toMatch(/Most Compatible|JPEG/)
        })
    })

    describe('size', () => {
        it('accepts a file exactly at the limit', () => {
            expect(rejectUnusableImage(usable('fov.jpg', 'image/jpeg', FILE_SIZE.MAX))).toBeNull()
        })

        it('rejects one byte over, quoting both numbers', () => {
            const rejection = rejectUnusableImage(
                usable('fov.jpg', 'image/jpeg', FILE_SIZE.MAX + 1),
            )
            expect(rejection).not.toBeNull()
            expect(rejection!.message).toMatch(/10MB/)
        })

        it('rejects a file too small to be a field of view', () => {
            expect(rejectUnusableImage(usable('fov.jpg', 'image/jpeg', 10))).not.toBeNull()
        })
    })

    it('rejects a non-image, since accept= is only a hint the picker may ignore', () => {
        const rejection = rejectUnusableImage(fileOf('report.pdf', 'application/pdf', 50_000))
        expect(rejection!.message).toMatch(/not an image/i)
    })

    it('allows an empty type, which is what some Android pickers report', () => {
        expect(rejectUnusableImage(fileOf('fov.jpg', '', 2_000_000))).toBeNull()
    })
})
