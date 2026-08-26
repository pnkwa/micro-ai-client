<script setup lang="ts">
import { Trash2, X } from '@lucide/vue'
import { colorForLabel } from '~/core/helpers/colors'
import type { Shape } from '~/core/helpers/annotationShapes'
import ScaffoldRegion from './ScaffoldRegion.vue'

/**
 * Labelling, as a panel over the canvas.
 *
 * FLOATING and dismissible rather than a fixed column, because the canvas wants every pixel it can
 * get: a microscopy field is the thing being judged, and a permanent sidebar takes its width for a
 * form that is only touched between shapes.
 */
const props = defineProps<{ open: boolean; shapes: Shape[]; selectedId: string | null }>()

const emit = defineEmits<{
    close: []
    select: [id: string]
    remove: [id: string]
    /** Fires per keystroke and does NOT enter the undo history. See `commit-label`. */
    'update-label': [payload: { id: string; label: string }]
    /** Fires on blur. This is the one that becomes an undo step. */
    'commit-label': []
    'update-curated': [payload: { id: string; expert_curated: boolean }]
}>()

const selected = computed(() => props.shapes.find((shape) => shape.id === props.selectedId) ?? null)

/**
 * Labels already used on this image, offered as suggestions.
 *
 * LABELS ARE FREE TEXT and this must never become a closed list. The tool exists to describe what
 * the models do NOT detect - clue cells, WBCs and GNDs are none of them model outputs - so a
 * vocabulary frozen to today's checkpoints would make the dataset useless for the next one. These
 * are a typing shortcut, nothing more.
 *
 * The manifest's classes will join these from `GET /models` when this page talks to the server, as
 * suggestions alongside rather than instead of.
 */
const suggestions = computed(() => [
    ...new Set(props.shapes.map((shape) => shape.label).filter(Boolean)),
])

const describe = (shape: Shape): string =>
    shape.polygon ? `Polygon, ${shape.polygon.length} points` : 'Rectangle'
</script>

<template>
    <aside
        v-if="open"
        class="tw:absolute tw:top-3 tw:right-3 tw:bottom-3 tw:z-10 tw:flex tw:w-80 tw:flex-col tw:gap-3 tw:rounded-lg tw:border tw:border-navy-15 tw:bg-white tw:p-3 tw:shadow-lg"
    >
        <div class="tw:flex tw:shrink-0 tw:items-center tw:justify-between">
            <h2 class="tw:text-sm tw:font-semibold tw:text-navy-100">
                Labels
                <span class="tw:font-normal tw:text-navy-50">({{ shapes.length }})</span>
            </h2>
            <McButton variant="ghost" size="icon-sm" aria-label="Hide panel" @click="emit('close')">
                <X class="tw:h-4 tw:w-4" />
            </McButton>
        </div>

        <div v-if="selected" class="tw:shrink-0 tw:rounded-md tw:bg-navy-5 tw:p-2.5">
            <label class="tw:text-xs tw:font-medium tw:text-navy-80">Label</label>
            <McInput
                :model-value="selected.label"
                placeholder="Enter a label"
                list="annotator-label-suggestions"
                class="tw:mt-1"
                @update:model-value="
                    (value: string | number) =>
                        emit('update-label', { id: selected!.id, label: String(value) })
                "
                @blur="emit('commit-label')"
            />
            <datalist id="annotator-label-suggestions">
                <option v-for="suggestion in suggestions" :key="suggestion" :value="suggestion" />
            </datalist>

            <label class="tw:mt-2 tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-navy-80">
                <input
                    type="checkbox"
                    :checked="selected.expert_curated"
                    @change="
                        emit('update-curated', {
                            id: selected!.id,
                            expert_curated: ($event.target as HTMLInputElement).checked,
                        })
                    "
                />
                Curated
            </label>
            <p class="tw:mt-1 tw:text-[10px] tw:text-navy-50">
                Marks this one as trusted so an export can ship a curated subset. On by default for
                instructors.
            </p>
        </div>

        <ul v-if="shapes.length" class="tw:min-h-0 tw:flex-1 tw:space-y-1 tw:overflow-y-auto">
            <li v-for="shape in shapes" :key="shape.id">
                <div
                    class="tw:flex tw:items-center tw:gap-2 tw:rounded-md tw:border tw:px-2 tw:py-1.5 tw:transition-colors"
                    :class="
                        shape.id === selectedId
                            ? 'tw:border-primary tw:bg-primary/5'
                            : 'tw:border-navy-15 tw:hover:bg-navy-5'
                    "
                >
                    <button
                        type="button"
                        class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:text-left"
                        @click="emit('select', shape.id)"
                    >
                        <span
                            class="tw:truncate tw:text-xs tw:font-medium"
                            :class="
                                shape.label ? colorForLabel(shape.label).text : 'tw:text-amber-600'
                            "
                        >
                            {{ shape.label || 'Unlabelled' }}
                        </span>
                        <span class="tw:text-[10px] tw:text-navy-50">
                            {{ describe(shape) }}
                        </span>
                    </button>
                    <McButton
                        variant="ghost"
                        size="icon-sm"
                        :aria-label="`Delete ${shape.label || 'shape'}`"
                        @click="emit('remove', shape.id)"
                    >
                        <Trash2 class="tw:h-3.5 tw:w-3.5" />
                    </McButton>
                </div>
            </li>
        </ul>

        <div v-else class="tw:min-h-0 tw:flex-1">
            <ScaffoldRegion
                title="No shapes yet"
                note="Pick the rectangle or polygon tool and draw on the image."
            />
        </div>

        <div class="tw:h-24 tw:shrink-0">
            <ScaffoldRegion
                title="Image metadata"
                note="The library's key/value bag, read-only. Arrives when this page talks to the server."
            />
        </div>
    </aside>
</template>
