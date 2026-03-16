import { cva } from 'class-variance-authority'

export { default as Input } from './Input.vue'

export const inputVariants = cva(
    'tw:flex tw:items-center tw:w-full tw:min-w-0 tw:rounded-md tw:border tw:border-input tw:bg-transparent tw:px-3 tw:py-2 tw:text-base tw:shadow-xs tw:transition-[color,box-shadow] tw:outline-none tw:h-9 tw:md:text-sm tw:placeholder:text-muted-foreground tw:focus-within:border-ring tw:focus-within:ring-ring/50 tw:focus-within:ring-[3px] tw:group-data-[error=true]/input:border-destructive tw:group-data-[error=true]/input:ring-destructive/20',
)
