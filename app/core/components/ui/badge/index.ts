import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Badge } from './Badge.vue'

export const badgeVariants = cva(
    'tw:inline-flex tw:items-center tw:justify-center tw:rounded-full tw:border tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium tw:w-fit tw:whitespace-nowrap tw:shrink-0 tw:[&>svg]:size-3 tw:gap-1 tw:[&>svg]:pointer-events-none tw:focus-visible:border-ring tw:focus-visible:ring-ring/50 tw:focus-visible:ring-[3px] tw:aria-invalid:ring-destructive/20 tw:dark:aria-invalid:ring-destructive/40 tw:aria-invalid:border-destructive tw:transition-[color,box-shadow] tw:overflow-hidden',
    {
        variants: {
            variant: {
                default:
                    'tw:border-transparent tw:bg-primary tw:text-primary-foreground tw:[a&]:hover:bg-primary/90',
                secondary:
                    'tw:border-transparent tw:bg-secondary tw:text-secondary-foreground tw:[a&]:hover:bg-secondary/90',
                destructive:
                    'tw:border-transparent tw:bg-destructive tw:text-white tw:[a&]:hover:bg-destructive/90 tw:focus-visible:ring-destructive/20 tw:dark:focus-visible:ring-destructive/40 tw:dark:bg-destructive/60',
                outline:
                    'tw:text-foreground tw:[a&]:hover:bg-accent tw:[a&]:hover:text-accent-foreground',
                warning: 'tw:border-warning tw:text-warning tw:bg-transparent',
                success: 'tw:border-primary tw:text-primary tw:bg-transparent',
                info: 'tw:border-sky-500 tw:text-sky-500 tw:bg-transparent',
                // Outlined red — the same transparent treatment as warning/info/success, for
                // states that are negative but shouldn't shout with a solid destructive fill.
                danger: 'tw:border-destructive tw:text-destructive tw:bg-transparent',
                // Outlined grey — a quiet, neutral state (e.g. nothing done yet), no fill.
                muted: 'tw:border-navy-20 tw:text-navy-60 tw:bg-transparent',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
