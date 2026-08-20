export interface LabelColor {
    border: string
    text: string
    dot: string
}

// Deterministic label -> palette entry, shared by McAnnotatedImage's box colors and
// McConfidenceBar's: a fixed label ('BV', 'fungus', ...) always gets the same color across both
// components, not just within one.
//
// Outline only - a border, a dot and a text colour. There is deliberately no fill: both consumers
// sit on a ground of their own (a photo, a white bar), and a per-label background there competes
// with what it is drawn over instead of identifying it.
const PALETTE: LabelColor[] = [
    {
        border: 'tw:border-primary',
        text: 'tw:text-primary',
        dot: 'tw:bg-primary',
    },
    {
        border: 'tw:border-emerald-500',
        text: 'tw:text-emerald-700',
        dot: 'tw:bg-emerald-500',
    },
    {
        border: 'tw:border-amber-500',
        text: 'tw:text-amber-700',
        dot: 'tw:bg-amber-500',
    },
    {
        border: 'tw:border-violet-500',
        text: 'tw:text-violet-700',
        dot: 'tw:bg-violet-500',
    },
    {
        border: 'tw:border-indigo-500',
        text: 'tw:text-indigo-700',
        dot: 'tw:bg-indigo-500',
    },
    {
        border: 'tw:border-sky-500',
        text: 'tw:text-sky-700',
        dot: 'tw:bg-sky-500',
    },
    {
        border: 'tw:border-fuchsia-500',
        text: 'tw:text-fuchsia-700',
        dot: 'tw:bg-fuchsia-500',
    },
]

export function colorForLabel(label: string): LabelColor {
    let hash = 0
    for (let i = 0; i < label.length; i++) {
        hash = (hash * 31 + label.charCodeAt(i)) | 0
    }
    return PALETTE[Math.abs(hash) % PALETTE.length]!
}
