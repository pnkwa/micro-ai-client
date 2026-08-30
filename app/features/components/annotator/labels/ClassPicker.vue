<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { classColorAt, type AnnotationClass } from '~/core/helpers/annotationClasses'

/**
 * The class list, and the keyboard path from "I see a cell" to "it is labelled".
 *
 * A class is a ROW now, not a string (BE-ADR-038): it has a server id, an authored colour, and it
 * outlives the batch. That is what makes the swatch beside each name interactive - the square IS the
 * label's colour, so changing it here is the whole of "managing" a class, and there is deliberately
 * no separate management screen behind it.
 *
 * `1-9` picks; with a shape selected the same key reclasses it instead. The keycap is shown only
 * for the first nine, because that is exactly how far the shortcut reaches.
 */
const props = defineProps<{
    classes: AnnotationClass[]
    /** The class new shapes take, by label id. Null before anything is picked. */
    active: number | null
}>()

const emit = defineEmits<{
    pick: [labelId: number]
    create: [label: string, colorHex: string]
    recolor: [labelId: number, color: string]
}>()

const adding = ref(false)
const draft = ref('')

/**
 * The colour a new class is offered.
 *
 * The next one along the cycle, so two classes made back to back do not arrive the same shade. Held
 * in a ref rather than computed off the list length, because the person may change it before
 * submitting and the suggestion must not then snap back under them.
 */
const draftColor = ref(classColorAt(props.classes.length))

const startAdding = () => {
    draftColor.value = classColorAt(props.classes.length)
    draft.value = ''
    adding.value = true
}

const submit = () => {
    const label = draft.value.trim()
    if (label) emit('create', label, draftColor.value.replace('#', '').toLowerCase())
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
            <span class="tw:text-[10.5px] tw:text-an-faint">Click a swatch to recolour</span>
        </div>

        <ul class="tw:flex tw:flex-col tw:gap-0.5 tw:px-2 tw:pb-2.5">
            <li v-for="klass in classes" :key="klass.id">
                <div
                    class="tw:flex tw:h-8 tw:w-full tw:items-center tw:gap-[9px] tw:rounded-[7px] tw:pr-[9px] tw:pl-2 tw:transition-colors"
                    :class="klass.id === active ? '' : 'tw:hover:bg-an-n-50'"
                    :style="
                        klass.id === active
                            ? {
                                  background: `${klass.color}12`,
                                  boxShadow: `inset 0 0 0 1px ${klass.color}44`,
                              }
                            : undefined
                    "
                >
                    <!-- The swatch is a real colour input wearing the class's colour. A native
                         picker rather than a popover of our own: it is the one control every OS
                         already provides, it opens where the pointer is, and it costs no layout in
                         a 320px column. `sr-only` would remove it from the layout entirely, so it
                         is sized over the square and made invisible instead. -->
                    <span class="tw:relative tw:h-[11px] tw:w-[11px] tw:shrink-0">
                        <span
                            class="tw:block tw:h-full tw:w-full tw:rounded-[3px]"
                            :style="{ background: klass.color }"
                        ></span>
                        <input
                            :value="klass.color"
                            type="color"
                            class="tw:absolute tw:inset-0 tw:h-full tw:w-full tw:cursor-pointer tw:opacity-0"
                            :aria-label="`Colour for ${klass.label}`"
                            :title="`Colour for ${klass.label}`"
                            @change="
                                emit('recolor', klass.id, ($event.target as HTMLInputElement).value)
                            "
                        />
                    </span>
                    <button
                        type="button"
                        class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-[9px] tw:text-left"
                        @click="emit('pick', klass.id)"
                    >
                        <span
                            class="tw:truncate tw:text-[11.5px] tw:text-an-text"
                            :class="klass.id === active ? 'tw:font-semibold' : 'tw:font-medium'"
                        >
                            {{ klass.label }}
                        </span>
                        <div class="tw:flex-1"></div>
                        <!-- A real zero, not a dash. The tally is the point, and an unused class
                             reading "0" is the same shape of answer as one reading "3". -->
                        <span class="tw:font-mono tw:text-[10px] tw:tabular-nums tw:text-an-faint">
                            {{ klass.count }}
                        </span>
                    </button>
                    <kbd
                        v-if="klass.index < 9"
                        class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-[5px] tw:py-[3px] tw:font-mono tw:text-[9.5px] tw:leading-none tw:text-an-muted"
                    >
                        {{ klass.index + 1 }}
                    </kbd>
                </div>
            </li>

            <li>
                <!-- The name and its colour are one gesture, because both are needed to create the
                     row and asking for the colour afterwards would mean every class is born the
                     suggested shade and recoloured immediately. Blur does not submit here, unlike
                     the old text-only field: reaching for the swatch would have cancelled the name. -->
                <div
                    v-if="adding"
                    class="tw:flex tw:h-[30px] tw:items-center tw:gap-2 tw:rounded-[7px] tw:border tw:border-an-accent tw:px-2"
                >
                    <span class="tw:relative tw:h-[11px] tw:w-[11px] tw:shrink-0">
                        <span
                            class="tw:block tw:h-full tw:w-full tw:rounded-[3px]"
                            :style="{ background: draftColor }"
                        ></span>
                        <input
                            v-model="draftColor"
                            type="color"
                            class="tw:absolute tw:inset-0 tw:h-full tw:w-full tw:cursor-pointer tw:opacity-0"
                            aria-label="Colour for the new class"
                            title="Colour for the new class"
                        />
                    </span>
                    <input
                        v-model="draft"
                        autofocus
                        placeholder="Class name"
                        class="tw:min-w-0 tw:flex-1 tw:bg-transparent tw:text-[11.5px] tw:text-an-text tw:outline-none"
                        @keydown.enter="submit"
                        @keydown.esc="((adding = false), (draft = ''))"
                    />
                    <button
                        type="button"
                        class="tw:shrink-0 tw:text-[11px] tw:font-medium tw:text-an-accent"
                        @click="submit"
                    >
                        Add
                    </button>
                </div>
                <button
                    v-else
                    type="button"
                    class="tw:flex tw:h-[30px] tw:w-full tw:items-center tw:gap-[9px] tw:rounded-[7px] tw:border tw:border-dashed tw:border-an-n-200 tw:px-2 tw:text-[11.5px] tw:text-an-faint tw:hover:border-an-n-250 tw:hover:text-an-muted"
                    @click="startAdding"
                >
                    <Plus class="tw:h-[13px] tw:w-[13px]" />
                    New class
                </button>
            </li>
        </ul>
    </section>
</template>
