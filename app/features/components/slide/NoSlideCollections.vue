<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'

/**
 * Shown in place of a slide-collection picker that has nothing to offer.
 *
 * Two situations wear the same empty select and need different words: an instructor who has not
 * made a collection yet has a task to do, while a failed fetch is a fault to retry. Collapsing
 * them would send someone off to create a collection they already have.
 *
 * Shared by every picker (the question editor and exam creation) so the two cannot drift into
 * saying different things about the same dead end.
 */
withDefaults(defineProps<{ failed?: boolean; noun?: string }>(), {
    failed: false,
    // What the picker is attached to, so the sentence can say why it is blocked.
    noun: 'question',
})

defineEmits<{ retry: [] }>()
</script>

<template>
    <div
        class="tw:flex tw:flex-col tw:items-start tw:gap-2 tw:rounded-md tw:border tw:border-warning/40 tw:bg-warning/5 tw:px-3 tw:py-2.5"
    >
        <p class="tw:text-xs tw:leading-relaxed tw:text-navy-80">
            <template v-if="failed">
                Could not load your slide collections. This {{ noun }} needs one to grade against,
                so try again before saving it.
            </template>
            <template v-else>
                You have no slide collections yet. A slide {{ noun }} is graded against the answer
                key on the slide, so there is nothing to grade against until you create one.
            </template>
        </p>
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <McButton
                v-if="failed"
                type="button"
                variant="outline"
                size="sm"
                @click="$emit('retry')"
            >
                Try again
            </McButton>
            <!--
                A NEW tab on purpose. Both pickers sit in a half-filled form, and navigating to the
                Slide Library in place would throw that work away to run an errand.
            -->
            <McButton v-else as-child variant="outline" size="sm">
                <a href="/slide-collections" target="_blank" rel="noopener">
                    Create a slide collection
                    <ExternalLink class="tw:size-3.5 tw:ml-1.5" />
                </a>
            </McButton>
            <span v-if="!failed" class="tw:text-[11px] tw:text-navy-50">
                Opens in a new tab, so your work here is kept.
            </span>
        </div>
    </div>
</template>
