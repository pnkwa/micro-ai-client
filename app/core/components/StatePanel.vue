<script setup lang="ts">
/**
 * A whole-page state: submitted, outside an exam window, nothing to answer.
 *
 * Exists because these panels are the same shape in two forms and kept drifting apart, leaving a
 * short card stranded at the top of a tall page - which reads as a broken load rather than as the
 * answer to what the student is looking for.
 *
 * A COMPONENT rather than a shared class string, and that part is not stylistic. Tailwind extracts
 * class names from templates; a name that only ever appears inside a `<script>` constant is not
 * emitted at all, so `min-h-[calc(100vh-160px)]` written that way produced no CSS and the panel
 * stayed short. Measured against a real build, not assumed. Keeping the classes in a template is
 * what guarantees they exist.
 *
 * The height is 100vh minus the app's sticky header and the page's own vertical padding. The
 * detection wall uses 100vh-80px because it sits directly under the header with no page padding.
 */
withDefaults(defineProps<{ tone?: 'primary' | 'neutral' }>(), { tone: 'neutral' })
</script>

<template>
    <div
        class="tw:flex tw:min-h-[calc(100vh-240px)] tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:border tw:bg-white tw:px-4 tw:py-16 tw:text-center"
        :class="tone === 'primary' ? 'tw:border-primary/20' : 'tw:border-navy-15'"
    >
        <slot />
    </div>
</template>
