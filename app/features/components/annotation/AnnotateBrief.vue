<script setup lang="ts">
/**
 * Instructions, the per-image fill-in form, and Mark done / Skip, as a band that sits ABOVE the
 * canvas on a tablet or phone.
 *
 * On a wide screen these live in the docked right panel (AnnotatePanel), where there is room for a
 * column. In portrait that panel is a summoned drawer, and a student who never opened it never saw
 * the instructions or the fields they were meant to answer. Lifting them to the top makes them the
 * first thing on the image instead of the last thing behind a button. Collapsible so the student
 * can reclaim the height once read; the parent keys this by image, so every image opens expanded.
 */
import { Check, ChevronDown, SkipForward } from '@lucide/vue'
import type { FieldPrompt } from '~/services/annotationAssignmentService'

const props = defineProps<{
    instructions: string | null | undefined
    fieldPrompts: FieldPrompt[]
    responses: Record<string, string> | null
    status: 'pending' | 'completed' | 'skipped' | null
    shapesCount: number
    allowSkip: boolean
    /** Render the collapse header. Off (the default) renders the body straight, for a docked panel. */
    collapsible?: boolean
    /**
     * Render the Mark done / Skip row. Off when the compact layout carries those on its action bar
     * instead, so this shows only the instructions and the fill-in form (in the instructions sheet).
     */
    showActions?: boolean
}>()

const showActions = computed(() => props.showActions ?? true)

const emit = defineEmits<{
    'update-response': [key: string, value: string]
    'mark-done': []
    skip: []
}>()

const open = ref(true)
const toggle = () => {
    if (props.collapsible) open.value = !open.value
}
</script>

<template>
    <section class="tw:flex tw:shrink-0 tw:flex-col tw:border-b tw:border-an-border tw:bg-an-panel">
        <!-- Header, only when collapsible: a tap toggles the body and the chevron turns. -->
        <button
            v-if="collapsible"
            type="button"
            class="tw:flex tw:h-10 tw:shrink-0 tw:items-center tw:gap-2 tw:px-3.5 tw:text-left"
            :aria-expanded="open"
            @click="toggle"
        >
            <span class="tw:text-[11.5px] tw:font-semibold tw:tracking-[-0.1px] tw:text-an-text">
                Instructions &amp; fields
            </span>
            <span
                v-if="status === 'completed'"
                class="tw:rounded-full tw:bg-success/10 tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-medium tw:text-success"
            >
                Done
            </span>
            <div class="tw:flex-1"></div>
            <ChevronDown
                class="tw:size-4 tw:text-an-faint tw:transition-transform"
                :class="open ? '' : 'tw:-rotate-90'"
            />
        </button>

        <!-- `touch-action` on the scrollable body too, not only the section: this is the element a
             finger lands on, and iOS Safari lets a descendant zoom the page even when an ancestor
             forbids it. `pan-y` keeps the body scrollable while blocking pinch and double-tap. -->
        <div
            v-show="open"
            class="tw:flex tw:max-h-[45dvh] tw:flex-col tw:gap-2.5 tw:overflow-y-auto tw:px-3.5 tw:pt-1 tw:pb-3 tw:[touch-action:pan-y]"
            :class="collapsible ? '' : 'tw:pt-3'"
        >
            <p class="tw:text-[13px] tw:leading-relaxed tw:text-an-text">
                {{ instructions || 'Box every finding and label it.' }}
            </p>

            <!-- per-image fill-in form (field_prompts) -->
            <div
                v-if="responses && fieldPrompts.length > 0"
                class="tw:flex tw:flex-wrap tw:items-center tw:gap-3"
            >
                <div
                    v-for="prompt in fieldPrompts"
                    :key="prompt.key"
                    class="tw:flex tw:min-w-[220px] tw:flex-1 tw:items-center tw:gap-2"
                >
                    <label class="tw:shrink-0 tw:text-[13px] tw:font-medium tw:text-an-text">
                        {{ prompt.label }}
                        <span v-if="prompt.required" class="tw:text-danger">*</span>
                    </label>
                    <textarea
                        v-if="prompt.type === 'textarea'"
                        rows="1"
                        :value="responses[prompt.key]"
                        class="tw:flex-1 tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:py-1.5 tw:text-sm tw:outline-none tw:focus:border-an-accent"
                        @input="
                            emit(
                                'update-response',
                                prompt.key,
                                ($event.target as HTMLTextAreaElement).value,
                            )
                        "
                    />
                    <input
                        v-else
                        :type="prompt.type === 'number' ? 'number' : 'text'"
                        :value="responses[prompt.key]"
                        class="tw:h-9 tw:flex-1 tw:rounded-md tw:border tw:border-an-n-200 tw:px-3 tw:text-sm tw:outline-none tw:focus:border-an-accent"
                        @input="
                            emit(
                                'update-response',
                                prompt.key,
                                ($event.target as HTMLInputElement).value,
                            )
                        "
                    />
                </div>
            </div>

            <!-- Once a box is drawn, Skip stops making sense, so it goes and Done takes the row.
                 Hidden when the compact action bar carries these instead. -->
            <div v-if="showActions" class="tw:flex tw:gap-2">
                <McButton
                    class="tw:flex-1"
                    :variant="status === 'completed' ? 'outline' : 'default'"
                    @click="emit('mark-done')"
                >
                    <Check class="tw:mr-1 tw:size-4" />
                    {{ status === 'completed' ? 'Done' : 'Mark done' }}
                </McButton>
                <McButton
                    v-if="!shapesCount"
                    variant="outline"
                    class="tw:flex-1"
                    :disabled="!allowSkip"
                    @click="emit('skip')"
                >
                    <SkipForward class="tw:mr-1 tw:size-4" />
                    Skip
                </McButton>
            </div>
        </div>
    </section>
</template>
