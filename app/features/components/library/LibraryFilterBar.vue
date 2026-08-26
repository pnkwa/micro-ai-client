<script setup lang="ts">
import { Search, Upload, X } from '@lucide/vue'

/**
 * The library's filters, all of which run SERVER-SIDE.
 *
 * That is the point of the bar rather than a detail of it. `GET /images` took only page/per_page
 * until 2026-08-26, so a search box here could have filtered no more than the twenty-four rows
 * already on screen - a search that silently misses everything it did not fetch, which is worse
 * than no search at all.
 */
const props = defineProps<{
    q: string
    mine: boolean
    /** `undefined` is "either"; `false` is the labelling worklist. */
    annotated?: boolean
}>()

const emit = defineEmits<{
    'update:q': [value: string]
    'update:mine': [value: boolean]
    'update:annotated': [value: boolean | undefined]
    upload: []
}>()

/**
 * There is deliberately no "uploaded by someone else".
 *
 * Upload is idempotent on content, so one row can have many uploaders and `created_by` records only
 * the FIRST. "Not mine" would therefore hide pictures you did upload, and the server reads
 * `mine=false` as no filter at all rather than as its inverse. A checkbox, never a tri-state.
 */
const toggleMine = () => emit('update:mine', !props.mine)

// Three states over two clicks: either -> not yet annotated -> annotated -> either. The worklist
// is first because it is the one someone opens this page to work through.
const cycleAnnotated = () => {
    const next =
        props.annotated === undefined ? false : props.annotated === false ? true : undefined
    emit('update:annotated', next)
}

const annotatedLabel = computed(() =>
    props.annotated === undefined
        ? 'Any label state'
        : props.annotated
          ? 'Annotated'
          : 'Not yet annotated',
)
</script>

<template>
    <div
        class="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:border-b tw:border-navy-15 tw:px-4 tw:py-2.5"
    >
        <McButton size="sm" @click="emit('upload')">
            <Upload class="tw:h-4 tw:w-4" />
            Upload
        </McButton>

        <div class="tw:relative tw:min-w-0 tw:flex-1">
            <Search
                class="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-2.5 tw:h-4 tw:w-4 tw:-translate-y-1/2 tw:text-navy-40"
            />
            <McInput
                :model-value="q"
                placeholder="Search titles"
                class="tw:pl-8"
                @update:model-value="(value: string | number) => emit('update:q', String(value))"
            />
            <button
                v-if="q"
                type="button"
                class="tw:absolute tw:top-1/2 tw:right-2 tw:-translate-y-1/2 tw:text-navy-40 tw:hover:text-navy-80"
                aria-label="Clear search"
                @click="emit('update:q', '')"
            >
                <X class="tw:h-4 tw:w-4" />
            </button>
        </div>

        <McButton size="sm" :variant="mine ? 'default' : 'outline'" @click="toggleMine">
            My uploads
        </McButton>

        <McButton
            size="sm"
            :variant="annotated === undefined ? 'outline' : 'default'"
            @click="cycleAnnotated"
        >
            {{ annotatedLabel }}
        </McButton>
    </div>
</template>
