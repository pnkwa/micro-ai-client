<script setup lang="ts">
import { Plus } from '@lucide/vue'
import type { AnnotationClass } from '~/core/helpers/annotationClasses'

/**
 * The class list, and the keyboard path from "I see a cell" to "it is labelled".
 *
 * A class here is a LABEL STRING, not an entity: labels are free text by decision (BE-ADR-030), so
 * this list is derived from what the images already use plus whatever gets typed. That is also why
 * "New class" is an inline input rather than a dialog - there is nothing to create, only a name to
 * start using.
 *
 * `1-9` picks; with a shape selected the same key reclasses it instead. The keycap is shown only
 * for the first nine, because that is exactly how far the shortcut reaches.
 */
defineProps<{
    classes: AnnotationClass[]
    /** The class new shapes take. Null before anything is picked. */
    active: string | null
}>()

const emit = defineEmits<{ pick: [label: string]; create: [label: string] }>()

const adding = ref(false)
const draft = ref('')

const submit = () => {
    const label = draft.value.trim()
    if (label) emit('create', label)
    draft.value = ''
    adding.value = false
}
</script>

<template>
    <section class="tw:flex tw:shrink-0 tw:flex-col">
        <div class="tw:flex tw:items-center tw:gap-2 tw:pt-3 tw:pr-3 tw:pb-2 tw:pl-3.5">
            <span class="tw:text-[11.5px] tw:font-semibold tw:tracking-[-0.1px] tw:text-an-text">
                Classes
            </span>
            <div class="tw:flex-1"></div>
            <!-- Accent-coloured per the design, and still disabled: there is no class entity to
                 manage yet, so the tooltip carries what the colour would otherwise promise. -->
            <button
                type="button"
                class="tw:cursor-not-allowed tw:text-[11px] tw:font-medium tw:text-an-accent tw:opacity-60"
                title="Class management is not built yet"
                disabled
            >
                Manage
            </button>
        </div>

        <ul class="tw:flex tw:flex-col tw:gap-0.5 tw:px-2 tw:pb-2.5">
            <li v-for="klass in classes" :key="klass.label">
                <button
                    type="button"
                    class="tw:flex tw:h-8 tw:w-full tw:items-center tw:gap-[9px] tw:rounded-[7px] tw:pr-[9px] tw:pl-2 tw:text-left tw:transition-colors"
                    :class="klass.label === active ? '' : 'tw:hover:bg-an-n-50'"
                    :style="
                        klass.label === active
                            ? {
                                  background: `${klass.color}12`,
                                  boxShadow: `inset 0 0 0 1px ${klass.color}44`,
                              }
                            : undefined
                    "
                    @click="emit('pick', klass.label)"
                >
                    <span
                        class="tw:h-[11px] tw:w-[11px] tw:shrink-0 tw:rounded-[3px]"
                        :style="{ background: klass.color }"
                    ></span>
                    <span
                        class="tw:truncate tw:text-[11.5px] tw:text-an-text"
                        :class="klass.label === active ? 'tw:font-semibold' : 'tw:font-medium'"
                    >
                        {{ klass.label }}
                    </span>
                    <div class="tw:flex-1"></div>
                    <!-- A real zero, not a dash. The tally is the point, and an unused class
                         reading "0" is the same shape of answer as one reading "3". -->
                    <span class="tw:font-mono tw:text-[10px] tw:tabular-nums tw:text-an-faint">
                        {{ klass.count }}
                    </span>
                    <kbd
                        v-if="klass.index < 9"
                        class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-[5px] tw:py-[3px] tw:font-mono tw:text-[9.5px] tw:leading-none tw:text-an-muted"
                    >
                        {{ klass.index + 1 }}
                    </kbd>
                </button>
            </li>

            <li>
                <input
                    v-if="adding"
                    v-model="draft"
                    autofocus
                    placeholder="Class name"
                    class="tw:h-[30px] tw:w-full tw:rounded-[7px] tw:border tw:border-an-accent tw:px-2 tw:text-[11.5px] tw:text-an-text tw:outline-none"
                    @keydown.enter="submit"
                    @keydown.esc="((adding = false), (draft = ''))"
                    @blur="submit"
                />
                <button
                    v-else
                    type="button"
                    class="tw:flex tw:h-[30px] tw:w-full tw:items-center tw:gap-[9px] tw:rounded-[7px] tw:border tw:border-dashed tw:border-an-n-200 tw:px-2 tw:text-[11.5px] tw:text-an-faint tw:hover:border-an-n-250 tw:hover:text-an-muted"
                    @click="adding = true"
                >
                    <Plus class="tw:h-[13px] tw:w-[13px]" />
                    New class
                </button>
            </li>
        </ul>
    </section>
</template>
