/* eslint-disable @typescript-eslint/no-unused-vars */
import type { ColumnMeta as TanstackColumnMeta, RowData } from '@tanstack/vue-table'

declare module '@tanstack/vue-table' {
    interface ColumnMeta<TData extends RowData = RowData, TValue = unknown> {
        headerClass?: string
        headerStyle?: Record<string, string>
        cellClass?: string
        cellStyle?: Record<string, string>
    }
}
