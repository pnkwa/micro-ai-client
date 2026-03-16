export function isKeyOfObject<T>(key: string | number | symbol, obj: T): key is keyof T {
    if (!obj || typeof obj !== 'object' || obj === null) {
        return false
    }
    return key in obj
}
