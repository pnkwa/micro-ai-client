export type StatusType =
    | 'graded'
    | 'submitted'
    | 'success'
    | 'error'
    | 'info'
    | 'warning'
    | 'students'
    | 'submissions'
export type VariantType =
    | 'warning'
    | 'success'
    | 'info'
    | 'destructive'
    | 'outline'
    | 'default'
    | 'secondary'

const statusVariantMap: Record<string, VariantType> = {
    graded: 'success',
    submitted: 'info',
    success: 'success',
    error: 'destructive',
    info: 'info',
    warning: 'warning',
    students: 'secondary',
    submissions: 'info',
}

export function getStatusVariant(status: string): VariantType {
    return statusVariantMap[status] ?? 'outline'
}
