<script setup lang="ts">
import { Plus, X } from '@lucide/vue'
import {
    metadataEntries,
    metadataPatch,
    toMetadataDrafts,
    type MetadataDraft,
} from '~/core/helpers/imageMetadata'

/**
 * The metadata bag, edited in place.
 *
 * *** NO SAVE BUTTON, SO NO DISABLED ONE. *** The old panel shipped `Add field` beside a greyed-out
 * `Save`, which is a form asking to be filled in before it will do anything. A row here writes when
 * you leave it, the same way the annotator's chip commits a class, and `+ Add field` is the only
 * control when the bag is empty.
 *
 * `metadataPatch` decides what actually goes: only what moved, never a reserved key, and a removed
 * row as an explicit null. The bag is shared with the export's `title` and BE-ADR-032's `verdict`,
 * so sending the whole object back could clobber a key this form does not own.
 */
const props = defineProps<{ metadata: Record<string, unknown> | null }>()

const emit = defineEmits<{ save: [patch: Record<string, unknown>] }>()

const drafts = ref<MetadataDraft[]>(toMetadataDrafts(props.metadata))

// The panel follows the selection, so the rows have to follow the image. An event rather than
// derived state: a draft someone is halfway through typing must not be recomputed under them.
watch(
    () => props.metadata,
    (metadata) => (drafts.value = toMetadataDrafts(metadata)),
)

/** Reserved keys render as read-only context. `verdict` is written by question authoring alone. */
const reserved = computed(() => metadataEntries(props.metadata).filter((entry) => entry.reserved))

const commit = () => {
    const patch = metadataPatch(props.metadata, drafts.value)
    if (patch) emit('save', patch)
}

const addField = () => drafts.value.push({ key: '', value: '' })

const removeField = (index: number) => {
    drafts.value.splice(index, 1)
    commit()
}
</script>

<template>
    <div class="tw:flex tw:flex-col tw:gap-1.5">
        <div
            v-for="(draft, index) in drafts"
            :key="index"
            class="tw:flex tw:items-center tw:gap-1.5"
        >
            <input
                v-model="draft.key"
                placeholder="key"
                class="tw:h-7 tw:w-[112px] tw:shrink-0 tw:rounded-md tw:border tw:border-an-n-200 tw:bg-an-n-50 tw:px-2 tw:font-mono tw:text-[12px] tw:text-an-text tw:outline-none tw:focus:border-an-accent"
                @blur="commit"
            />
            <input
                v-model="draft.value"
                placeholder="value"
                class="tw:h-7 tw:min-w-0 tw:flex-1 tw:rounded-md tw:border tw:border-an-n-200 tw:bg-an-n-50 tw:px-2 tw:text-[12px] tw:text-an-text tw:outline-none tw:focus:border-an-accent"
                @blur="commit"
            />
            <button
                type="button"
                class="tw:shrink-0 tw:text-an-n-300 tw:transition-colors tw:hover:text-danger"
                :aria-label="`Remove ${draft.key || 'field'}`"
                @click="removeField(index)"
            >
                <X class="tw:h-3.5 tw:w-3.5" />
            </button>
        </div>

        <div v-for="entry in reserved" :key="entry.key" class="tw:flex tw:items-center tw:gap-1.5">
            <span class="tw:w-[112px] tw:shrink-0 tw:font-mono tw:text-[12px] tw:text-an-n-400">
                {{ entry.key }}
            </span>
            <span
                class="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[12px] tw:text-an-n-500"
                :title="entry.value"
            >
                {{ entry.value }}
            </span>
        </div>

        <button
            type="button"
            class="tw:mt-1 tw:flex tw:h-7 tw:w-fit tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:border-an-n-200 tw:px-2.5 tw:text-[12px] tw:text-an-n-600 tw:transition-colors tw:hover:bg-an-n-50"
            @click="addField"
        >
            <Plus class="tw:h-3.5 tw:w-3.5" />
            Add field
        </button>
        <p class="tw:mt-1 tw:text-[11px] tw:text-an-n-400">Rows save when you leave the field.</p>
    </div>
</template>
