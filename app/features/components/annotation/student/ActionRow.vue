<script setup lang="ts">
/**
 * The sheet's pinned action row (also the footer of the Medium docked panel).
 *
 * Left: the mono shape count with a colour square per distinct class used, then a STATUS LINE that
 * is the sentence for the image — amber "<field> not answered", teal "Ready to mark done", teal
 * "Done · saved". When something is missing that line is a button that opens the tab which fixes it.
 * Right: Skip (ghost, status) then Mark done (primary).
 *
 * Mark done is NEVER disabled. A missing required answer does not grey it out — tapping it raises
 * the sheet to the Answer tab (the page decides), because a disabled primary with no explanation is
 * the dead end this rebuild removes.
 */
const props = defineProps<{
    labelCount: number
    /** Distinct class colours on the current image, as squares (max four). */
    dots: string[]
    status: 'pending' | 'completed' | 'skipped' | null
    allowSkip: boolean
    /** The first unanswered required field's label, or null when every required field is answered. */
    missingLabel: string | null
}>()

const emit = defineEmits<{ 'mark-done': []; skip: []; 'go-answer': [] }>()

const done = computed(() => props.status === 'completed')
</script>

<template>
    <div
        class="tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:gap-2.5 tw:px-3 tw:[touch-action:pan-x_pan-y]"
    >
        <div class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
            <span class="tw:flex tw:items-center tw:gap-1.5">
                <span class="tw:font-mono tw:text-[12.5px] tw:font-medium tw:tabular-nums tw:text-an-n-700">
                    {{ labelCount }} box{{ labelCount === 1 ? '' : 'es' }}
                </span>
                <span
                    v-for="(dot, i) in dots"
                    :key="i"
                    class="tw:size-1.5 tw:shrink-0 tw:rounded-[2px]"
                    :style="{ background: dot }"
                />
            </span>
            <!-- The status sentence. A button only when there is something to fix (the amber case),
                 where it opens the Answer tab; otherwise it is inert text. -->
            <button
                v-if="!done && missingLabel"
                type="button"
                class="tw:flex tw:items-center tw:gap-1 tw:text-left tw:text-[12px] tw:text-an-warn"
                @click="emit('go-answer')"
            >
                {{ missingLabel }} not answered
            </button>
            <span v-else class="tw:text-[12px] tw:text-an-accent-hover">
                {{ done ? 'Done · saved' : 'Ready to mark done' }}
            </span>
        </div>

        <McButton
            v-if="!done"
            variant="outline"
            size="sm"
            :disabled="!allowSkip"
            @click="emit('skip')"
        >
            Skip
        </McButton>
        <!-- Never disabled: with a required answer missing, tapping raises the sheet to Answer rather
             than silently refusing (the page owns that). Reads as outline once already done. -->
        <McButton :variant="done ? 'outline' : 'default'" size="sm" @click="emit('mark-done')">
            {{ done ? 'Done' : 'Mark done' }}
        </McButton>
    </div>
</template>
