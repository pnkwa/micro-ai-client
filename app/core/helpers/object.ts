export function isKeyOfObject<T>(key: string | number | symbol, obj: T): key is keyof T {
    if (!obj || typeof obj !== 'object' || obj === null) {
        return false
    }
    return key in obj
}

export const hasKey = <T extends object, K extends keyof T>(obj: T, key: K): key is K => {
    return key in obj
}
