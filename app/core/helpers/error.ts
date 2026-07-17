export const apiErrorMessage = (err: unknown, fallback: string): string => {
    const message = (err as { data?: { message?: string | string[] } })?.data?.message
    if (Array.isArray(message)) return message.join(', ')
    return message ?? fallback
}
