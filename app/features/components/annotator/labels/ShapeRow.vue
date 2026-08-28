<script setup lang="ts">
import { Check, Eye, EyeOff, Pentagon, Square, X } from '@lucide/vue'
import type { Shape } from '~/core/helpers/annotationShapes'

/**
 * One shape, in four states: normal, selected, seeded, hidden.
 *
 * SEEDED IS A REVIEW QUEUE, NOT A RESULT. A shape copied from a model run carries its real
 * confidence and an accept/reject pair instead of the eye, and the image stays amber until every
 * one has been passed over. That is BE-ADR-030's argument made visible: a correction says WHERE the
 * model was wrong, which is the signal the research team wants, and it only exists if someone
 * actually looks at each box.
 *
 * The confidence is real because these shapes are seeded CLIENT-SIDE from the detection's own boxes
 * rather than through the server's seed endpoint - `image_annotations` stores no confidence, and
 * the serializer synthesizes 1 precisely so a fabricated number never reaches the export. It is
 * therefore session-only: saving drops it, and a reload will not bring it back.
 */
const props = defineProps<{
    shape: Shape
    color: string | null
    selected: boolean
    hidden: boolean
    /** Present only while the shape is seeded and unreviewed. */
    confidence: number | null
}>()

const emit = defineEmits<{
    select: []
    'toggle-hidden': []
    accept: []
    reject: []
}>()

/**
 * Geometry, then provenance: `polygon · 6 pts · seeded 0.91` or `· drawn by you`.
 *
 * Provenance is the half that decides what to do with the row. A seeded shape is a claim to check;
 * one you drew is already checked, and saying so is what stops the two blurring together in a list
 * of twenty.
 */
const meta = computed(() => {
    const geometry = props.shape.polygon
        ? `polygon · ${props.shape.polygon.length} pts`
        : 'rectangle'
    const origin =
        props.confidence !== null ? `seeded ${props.confidence.toFixed(2)}` : 'drawn by you'
    return `${geometry} · ${origin}`
})
</script>

<template>
    <li>
        <div
            class="tw:flex tw:h-[42px] tw:items-center tw:gap-2 tw:rounded-[7px] tw:pr-1.5 tw:pl-0 tw:transition-colors"
            :class="[
                selected
                    ? 'tw:bg-an-accent-tint tw:ring-1 tw:ring-an-accent'
                    : 'tw:hover:bg-an-n-50',
                confidence !== null && !selected ? 'tw:bg-an-warn-tint' : '',
                hidden ? 'tw:opacity-45' : '',
            ]"
        >
            <!-- The 3px bar is the only place an unlabelled shape shows its amber, so it is also
                 the fastest read of "this one still needs a class". -->
            <span
                class="tw:h-[26px] tw:w-[3px] tw:shrink-0 tw:rounded-full"
                :style="{ background: color ?? '#D97706' }"
            ></span>

            <button
                type="button"
                class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-2 tw:text-left"
                @click="emit('select')"
            >
                <Pentagon
                    v-if="shape.polygon"
                    class="tw:h-3.5 tw:w-3.5 tw:shrink-0 tw:text-an-n-500"
                />
                <Square v-else class="tw:h-3.5 tw:w-3.5 tw:shrink-0 tw:text-an-n-500" />
                <span class="tw:flex tw:min-w-0 tw:flex-col">
                    <span
                        class="tw:truncate tw:text-[12.5px]"
                        :class="shape.label ? 'tw:text-an-text' : 'tw:text-an-n-300 tw:italic'"
                    >
                        {{ shape.label || 'Unlabelled' }}
                    </span>
                    <span
                        class="tw:truncate tw:font-mono tw:text-[10.5px] tw:tabular-nums tw:text-an-n-500"
                    >
                        {{ meta }}
                    </span>
                </span>
            </button>

            <!-- Accept/reject REPLACES the eye while seeded: hiding a box you have not judged is
                 not a thing anyone wants to do, and the row has room for one control. -->
            <!--
                Always-filled chips, not hover-only, and the reject is NEUTRAL rather than red: a
                seeded shape is a review, and rejecting the model's guess is an ordinary answer, not
                a destructive one. 24px, the mockup's accept #E6F4F2/#0B7C70 and reject
                #F7F8F9/#8A9099.
            -->
            <span v-if="confidence !== null" class="tw:flex tw:shrink-0 tw:gap-1">
                <button
                    type="button"
                    class="tw:flex tw:h-6 tw:w-6 tw:items-center tw:justify-center tw:rounded-md tw:bg-an-accent-tint tw:text-an-accent-hover"
                    aria-label="Accept this shape"
                    title="Accept"
                    @click="emit('accept')"
                >
                    <Check class="tw:h-3.5 tw:w-3.5" />
                </button>
                <button
                    type="button"
                    class="tw:flex tw:h-6 tw:w-6 tw:items-center tw:justify-center tw:rounded-md tw:bg-an-n-50 tw:text-an-n-500"
                    aria-label="Reject this shape"
                    title="Reject"
                    @click="emit('reject')"
                >
                    <X class="tw:h-3.5 tw:w-3.5" />
                </button>
            </span>

            <button
                v-else
                type="button"
                class="tw:flex tw:h-6 tw:w-6 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-400 tw:hover:bg-an-n-100 tw:hover:text-an-muted"
                :aria-label="hidden ? 'Show this shape' : 'Hide this shape'"
                @click="emit('toggle-hidden')"
            >
                <EyeOff v-if="hidden" class="tw:h-3.5 tw:w-3.5" />
                <Eye v-else class="tw:h-3.5 tw:w-3.5" />
            </button>
        </div>
    </li>
</template>
