<script setup lang="ts">
/**
 * The student workspace's right panel: the instructions, the per-image fill-in form, the class
 * picker (as a slot, so the desktop docks a ClassPicker here while a tablet uses the bottom
 * ClassStrip instead), the list of shapes on the current image, and the Mark done / Skip actions.
 *
 * A view component (props in, events out) so it renders identically whether it is the docked right
 * column or the contents of a drawer on a tablet.
 */
import { Check, Pentagon, SkipForward, Square, Trash2 } from '@lucide/vue'
import { colorForShape } from '~/core/helpers/annotationClasses'
import type { Shape } from '~/core/helpers/annotationShapes'
import type { AnnotationLabel } from '~/services/annotationLabelService'
import type { FieldPrompt } from '~/services/annotationAssignmentService'

const props = defineProps<{
    instructions: string | null | undefined
    fieldPrompts: FieldPrompt[]
    responses: Record<string, string> | null
    status: 'pending' | 'completed' | 'skipped' | null
    shapes: Shape[]
    selectedId: string | null
    hiddenIds: Set<string>
    palette: AnnotationLabel[]
    allowSkip: boolean
}>()

const emit = defineEmits<{
    'update-response': [key: string, value: string]
    'select-shape': [id: string]
    'delete-shape': [id: string]
    'mark-done': []
    skip: []
}>()

const shapeColor = (s: Shape) => colorForShape(props.palette, s) ?? 'var(--color-an-n-250)'
const shapeMeta = (s: Shape) => (s.polygon ? `polygon, ${s.polygon.length} pts` : 'rectangle')
</script>

<template>
    <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
        <!-- instructions -->
        <div class="tw:flex tw:min-h-0 tw:flex-col">
            <div class="tw:flex tw:items-center tw:gap-2 tw:pt-3 tw:pr-3 tw:pl-3.5">
                <span
                    class="tw:text-[11.5px] tw:font-semibold tw:tracking-[-0.1px] tw:text-an-text"
                >
                    Instructions
                </span>
            </div>
            <span class="tw:pt-3 tw:pr-3 tw:pb-2 tw:pl-3.5">
                {{ instructions || 'Box every finding and label it.' }}
            </span>
        </div>

        <!-- per-image fill-in form (field_prompts) -->
        <div
            v-if="responses && fieldPrompts.length > 0"
            class="tw:shrink-0 tw:border-t tw:border-an-border tw:bg-an-panel tw:px-4 tw:py-3"
        >
            <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-4">
                <div
                    v-for="prompt in fieldPrompts"
                    :key="prompt.key"
                    class="tw:flex tw:min-w-[240px] tw:flex-1 tw:items-center tw:gap-2"
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
        </div>

        <div class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-y-auto">
            <!-- the class picker docks here on a wide screen; on a tablet the bottom ClassStrip
                 fills this role and the slot is left empty. -->
            <slot name="classes" />

            <div class="tw:mx-3 tw:h-px tw:shrink-0 tw:bg-an-divider" />

            <!-- shapes on this image -->
            <section class="tw:flex tw:flex-col tw:gap-1 tw:p-3">
                <div class="tw:mb-1 tw:flex tw:items-center tw:gap-2">
                    <span class="tw:text-[11.5px] tw:font-semibold tw:text-an-text">
                        Your labels
                    </span>
                    <span class="tw:font-mono tw:text-[10px] tw:text-an-faint">
                        {{ shapes.length }}
                    </span>
                </div>

                <div
                    v-for="s in shapes"
                    :key="s.id"
                    class="tw:flex tw:h-[42px] tw:cursor-pointer tw:items-center tw:gap-[9px] tw:rounded-[8px] tw:px-2"
                    :class="[
                        s.id === selectedId
                            ? 'tw:bg-an-n-50 tw:ring-1 tw:ring-inset tw:ring-an-accent/40'
                            : 'tw:hover:bg-an-n-50',
                        hiddenIds.has(s.id) ? 'tw:opacity-45' : '',
                    ]"
                    @click="emit('select-shape', s.id)"
                >
                    <span
                        class="tw:h-6 tw:w-[3px] tw:shrink-0 tw:rounded-[2px]"
                        :style="{ background: shapeColor(s) }"
                    />
                    <component
                        :is="s.polygon ? Pentagon : Square"
                        class="tw:size-[15px] tw:shrink-0 tw:text-an-n-500"
                    />
                    <span class="tw:min-w-0 tw:flex-1">
                        <span
                            class="tw:block tw:truncate tw:text-[13px]"
                            :class="s.label ? 'tw:text-an-text' : 'tw:text-an-n-300 tw:italic'"
                        >
                            {{ s.label || 'Unlabelled' }}
                        </span>
                        <span class="tw:block tw:font-mono tw:text-[10px] tw:text-an-faint">
                            {{ shapeMeta(s) }}
                        </span>
                    </span>
                    <button
                        class="tw:flex tw:size-6 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-an-n-400 tw:hover:bg-danger/10 tw:hover:text-danger"
                        aria-label="Delete"
                        @click.stop="emit('delete-shape', s.id)"
                    >
                        <Trash2 class="tw:size-[15px]" />
                    </button>
                </div>

                <p v-if="!shapes.length" class="tw:px-1 tw:py-2 tw:text-[11px] tw:text-an-faint">
                    Pick a class, then drag a box on the image.
                </p>
            </section>
        </div>

        <div class="tw:shrink-0 tw:border-t tw:border-an-divider tw:bg-an-chrome tw:p-3">
            <!-- Once a box is drawn, Skip stops making sense, so it goes and Done takes the row.
                 Done reads as outline once the image is already marked complete. -->
            <div class="tw:flex tw:gap-2">
                <McButton
                    class="tw:flex-1"
                    :variant="status === 'completed' ? 'outline' : 'default'"
                    @click="emit('mark-done')"
                >
                    <Check class="tw:mr-1 tw:size-4" />
                    {{ status === 'completed' ? 'Done' : 'Mark done' }}
                </McButton>
                <McButton
                    v-if="!shapes.length"
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
    </div>
</template>
