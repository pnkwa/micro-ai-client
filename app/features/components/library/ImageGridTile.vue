<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { Check, EyeOff, ImageOff, Pencil, Shapes, Star } from '@lucide/vue'
import type { LibraryImage } from '~/services/imageService'
import type { ImageLoadError } from '~/core/composables/useImageObjectUrls'
import type { QueueRowView } from '~/core/helpers/annotationQueue'
import { formatDayShort } from '~/core/helpers/dateFormat'
import {
    imageDisplayName,
    sanitizeTitle,
    splitExtension,
    titleError,
} from '~/core/helpers/imageName'

/**
 * One card, which asks for its own thumbnail when it scrolls into view.
 *
 * A component per tile rather than one observer over a `v-for` ref array, for the reason
 * `McDetectionHistoryRow` records: Vue MUTATES a `v-for` ref array in place rather than assigning a
 * new one, so a shallow ref holding it never triggers and `useIntersectionObserver` keeps observing
 * `<li>`s that were detached on the last reload. Every row after a refresh stayed blank. A tile that
 * owns its observer has nothing to go stale.
 *
 * The grid keeps the cache and does the fetching; this only says "I am visible".
 *
 * 4:3, NOT SQUARE. Microscopy fields are landscape, and a square tile cropped the two edges of the
 * frame where someone had deliberately included context.
 */
const props = defineProps<{
    image: LibraryImage
    /** From `queueRowView`, so this badge and the annotator's queue badge cannot disagree. */
    view: QueueRowView
    /** The scrolling container, as the observer's root. */
    root?: HTMLElement | null
    /** Object URL of the already-loaded thumbnail, if there is one. */
    thumbnail?: string
    error?: ImageLoadError
    /** In the selection. */
    selected?: boolean
    /** Something is selected somewhere, which is what pins every checkbox open. */
    selecting?: boolean
    /**
     * A rename is in flight, so the new name is already shown, at 60%, because it is optimistic.
     *
     * Null is "nothing pending", which is not the same as an empty string.
     */
    pendingName?: string | null
    /** Being dragged somewhere: 40%, because it is being MOVED and has not gone. */
    dragging?: boolean
    /** From the layout's metrics table: 44 on a desktop, 40 on a phone. */
    footerHeight?: number
    /**
     * Hover-revealed controls are gone below Full.
     *
     * There is no hover on a touchscreen, so nothing may hide behind it: the checkbox becomes
     * selection mode and the Annotate pill becomes the detail view's button. Rendering them anyway
     * would leave two controls that only appear when a finger is already pressing them.
     */
    touch?: boolean
}>()

const emit = defineEmits<{
    visible: []
    select: [modifiers: { shift: boolean; meta: boolean }]
    toggle: []
    annotate: []
    /** Double click on the picture. The name has its own double click, which renames. */
    open: []
    rename: [title: string]
    /**
     * A press that MIGHT become a drag onto an album.
     *
     * The page decides: nothing happens until the pointer travels 5px, or a finger rests for
     * 400ms, so this never costs the card its click.
     */
    'drag-start': [event: PointerEvent]
    /** A finger rested on the card for 400ms: enter selection mode and take this one. */
    'long-press': []
}>()

const el = useTemplateRef<HTMLElement>('tile')
const input = useTemplateRef<HTMLInputElement>('input')

useIntersectionObserver(
    el,
    ([entry]) => {
        if (entry?.isIntersecting) emit('visible')
    },
    // A screen's worth of lead, so a tile is fetched shortly before it is looked at. At ~20 KB a
    // thumbnail the cost of being early is negligible.
    { root: () => props.root, rootMargin: '200px' },
)

/**
 * The name: `metadata.title`, falling back to the id.
 *
 * The uploader now takes the title off the file, so this reads `IMG_0417` rather than `Image 42`
 * for anything uploaded since. Older rows keep the id until someone renames them, which is part of
 * why rename is reachable from the card rather than only from the panel.
 */
const caption = computed(
    () => props.pendingName ?? imageDisplayName(props.image.metadata, props.image.id),
)

/**
 * The extension is shown but never edited.
 *
 * Uploads arrive without one, since the uploader strips it, so this is usually empty. It matters
 * for a title typed by hand or backfilled from somewhere else: an input that contained `.png` is
 * one a stray keystroke can turn into `.pn`.
 */
const parts = computed(() => splitExtension(caption.value))

const editing = ref(false)
const draft = ref('')

const startRename = async () => {
    draft.value = parts.value.base
    editing.value = true
    await nextTick()
    input.value?.focus()
    input.value?.select()
}

const commit = () => {
    if (!editing.value) return
    editing.value = false
    const next = sanitizeTitle(draft.value) + parts.value.ext
    // Unchanged, or not a name at all: leave the row as it was rather than writing something
    // someone then has to undo. The inspector has room to explain why; a card footer does not, so
    // it simply declines.
    if (titleError(draft.value) || next === caption.value) return
    emit('rename', next)
}

const cancel = () => {
    editing.value = false
    draft.value = ''
}

/**
 * The four states, painted from the one selector.
 *
 * `seeded` and `editing` are session-only in the annotator - nothing on the server says an
 * annotation came from a model - so a freshly loaded library can only ever show three of them. The
 * mapping carries all five anyway, so the day `origin` exists the badge is already right.
 */
/**
 * Long press: 400ms, cancelled by 8px of movement.
 *
 * *** THE SLOP IS WHAT MAKES THE GRID SCROLLABLE. *** Without it every flick down the page arms the
 * timer and lands in selection mode, which is the single most common way a long-press gesture goes
 * wrong. Touch only: a mouse has a right button and a click, and a desktop that entered selection
 * mode after a slow click would be a bug.
 */
const LONG_PRESS_MS = 400
const SLOP = 8

let pressTimer: ReturnType<typeof setTimeout> | null = null
let pressOrigin: { x: number; y: number } | null = null

const cancelPress = () => {
    if (pressTimer) clearTimeout(pressTimer)
    pressTimer = null
    pressOrigin = null
}

const onPointerDown = (event: PointerEvent) => {
    emit('drag-start', event)
    if (event.pointerType === 'mouse') return
    pressOrigin = { x: event.clientX, y: event.clientY }
    pressTimer = setTimeout(() => {
        cancelPress()
        emit('long-press')
    }, LONG_PRESS_MS)
}

const onPointerMove = (event: PointerEvent) => {
    if (!pressOrigin) return
    const travelled = Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y)
    if (travelled > SLOP) cancelPress()
}

onScopeDispose(cancelPress)

// Who first uploaded the image, for the footer's meta line. The server-resolved name when present,
// else "you" for the reader's own uploads, else nothing - a bare id is not worth a line. Mirrors the
// inspector's "Uploaded by" row (and the same pending backend note applies).
const auth = useAuth()
const uploadedBy = computed(() => {
    if (props.image.created_by_name) return props.image.created_by_name
    if (props.image.created_by != null && props.image.created_by === auth.user?.id) {
        return [auth.user.firstname, auth.user.lastname].filter(Boolean).join(' ') || 'you'
    }
    return null
})

const badgeClass = computed(() => {
    switch (props.view.status) {
        case 'reviewed':
            return 'tw:bg-an-accent-tint tw:text-an-accent-hover'
        case 'seeded':
        case 'editing':
            return 'tw:bg-an-warn-tint tw:text-an-warn'
        default:
            // `labelled`, and the fallback. `empty` never reaches here: a card with nothing drawn
            // on it renders no badge at all.
            return 'tw:bg-an-n-100 tw:text-an-n-600'
    }
})
</script>

<template>
    <!-- No `draggable`: this card is dragged with POINTER events, and leaving the native flag on
         would start a second drag with its own ghost the moment the pointer moved. -->
    <li ref="tile" :data-card-id="image.id">
        <div
            class="tw:group tw:overflow-hidden tw:rounded-lg tw:border tw:bg-an-panel tw:transition-[border-color,box-shadow] tw:duration-150 tw:ease-out"
            :class="[
                selected
                    ? 'tw:border-an-accent tw:ring-1 tw:ring-an-accent'
                    : 'tw:border-an-border tw:hover:border-an-n-250 tw:hover:shadow-[0_2px_10px_rgba(20,24,29,0.08)]',
                dragging ? 'tw:opacity-40 tw:transition-opacity' : '',
            ]"
        >
            <!--
                `-webkit-touch-callout: none` matters as much as the rest of this class list: without
                it a long press on iOS pops the system callout over the card instead of entering
                selection mode, and the gesture is unrecoverable from there.
            -->
            <div
                class="tw:relative tw:aspect-[4/3] tw:cursor-grab tw:touch-pan-y tw:bg-an-canvas tw:select-none tw:[-webkit-touch-callout:none] tw:focus-visible:ring-2 tw:focus-visible:ring-an-accent tw:focus-visible:outline-none tw:active:cursor-grabbing"
                role="button"
                tabindex="0"
                :aria-label="`Select ${caption}`"
                @click="
                    emit('select', {
                        shift: $event.shiftKey,
                        meta: $event.metaKey || $event.ctrlKey,
                    })
                "
                @keydown.enter.prevent="emit('select', { shift: false, meta: false })"
                @dblclick="emit('open')"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="cancelPress"
                @pointercancel="cancelPress"
                @dragstart.prevent
            >
                <!--
                    *** `draggable="false"` IS WHAT MAKES THE DRAG WORK AT ALL. ***

                    An `<img>` is natively draggable in every browser, so a press and a move started
                    the BROWSER's image drag instead of ours: it swallowed the pointer stream, fired
                    `pointercancel`, and `useAlbumDrag` tore itself down before it had armed. The
                    card looked completely inert. `dragstart.prevent` on the container catches the
                    same event for anything else inside it, and `select-none` stops a drag across
                    two cards painting the page blue.

                    `touch-pan-y` leaves a finger free to scroll the grid vertically while keeping
                    horizontal movement for us, which is the direction the album column is in.
                -->
                <img
                    v-if="thumbnail"
                    :src="thumbnail"
                    :alt="caption"
                    draggable="false"
                    loading="lazy"
                    decoding="async"
                    class="tw:h-full tw:w-full tw:object-cover"
                />
                <!--
                    A 403 is a realistic answer on image bytes now that the id is an integer and
                    BE-ADR-031's permission union is still deferred, so it gets its own icon and
                    wording. Previously the only realistic failure was a 404, and rendering both as
                    a broken-image icon would leave someone retrying something they are not allowed
                    to see.
                -->
                <div
                    v-else-if="error"
                    class="tw:flex tw:h-full tw:w-full tw:flex-col tw:items-center tw:justify-center tw:gap-1 tw:px-2 tw:text-center tw:text-an-d-disabled"
                >
                    <EyeOff v-if="error === 'forbidden'" class="tw:h-5 tw:w-5" />
                    <ImageOff v-else class="tw:h-5 tw:w-5" />
                    <span class="tw:text-[10px]">
                        {{ error === 'forbidden' ? 'Not available to you' : 'Image unavailable' }}
                    </span>
                </div>
                <McSkeleton v-else class="tw:h-full tw:w-full tw:rounded-none" />

                <!-- On hover, and pinned open the moment anything is selected: once you are
                     picking a batch, every card has to say whether it is in it. -->
                <button
                    v-if="!touch || selecting || selected"
                    type="button"
                    class="tw:absolute tw:top-[7px] tw:left-[7px] tw:flex tw:h-[18px] tw:w-[18px] tw:items-center tw:justify-center tw:rounded-[5px] tw:border tw:transition-[opacity,background-color,border-color] tw:duration-150"
                    :class="[
                        selected
                            ? 'tw:border-an-accent tw:bg-an-accent tw:text-white'
                            : 'tw:border-black/15 tw:bg-white/90 tw:text-transparent tw:hover:text-an-n-400',
                        // Opacity rather than `hidden`, because `display` cannot transition and a
                        // control that pops in reads as a glitch on a grid of two hundred.
                        selected || selecting
                            ? 'tw:opacity-100'
                            : 'tw:pointer-events-none tw:opacity-0 tw:group-hover:pointer-events-auto tw:group-hover:opacity-100',
                    ]"
                    :aria-pressed="selected"
                    :aria-label="selected ? `Deselect ${caption}` : `Add ${caption} to selection`"
                    @click.stop="emit('toggle')"
                >
                    <Check class="tw:h-3 tw:w-3" />
                </button>

                <span
                    v-if="image.in_curated_album"
                    class="tw:absolute tw:top-[7px] tw:left-8 tw:flex tw:h-5 tw:items-center tw:rounded-[5px] tw:bg-black/55 tw:px-1.5 tw:text-white"
                    title="In a curated album, so it can be used to author a question"
                >
                    <Star class="tw:h-3 tw:w-3" />
                </span>

                <!--
                    NO BADGE AT ALL WHEN NOTHING IS DRAWN.

                    It used to render a small rule for the empty state, on the reasoning that "no
                    shapes" is a different fact from "zero shapes". True, and not worth a chip: a
                    grid is mostly unlabelled images, so the badge became a mark on almost every
                    card, saying the same nothing each time. Absence reads as absence, and the
                    cards that DO carry a count now stand out at a glance, which is what the badge
                    was for.
                -->
                <span
                    v-if="view.badge !== null"
                    class="tw:absolute tw:top-[7px] tw:right-[7px] tw:flex tw:h-5 tw:min-w-5 tw:items-center tw:justify-center tw:gap-1 tw:rounded-[5px] tw:px-1.5 tw:font-mono tw:text-[11px] tw:font-medium tw:tabular-nums tw:shadow-sm"
                    :class="badgeClass"
                    :title="`${view.meta}${image.in_curated_album ? ' · curated' : ''}`"
                >
                    <Shapes class="tw:h-3 tw:w-3" />
                    {{ view.badge }}
                </span>

                <!-- The one action people came here for, reachable without opening anything. On
                     touch it is the detail view's own button instead. -->
                <button
                    v-if="!touch"
                    type="button"
                    class="tw:pointer-events-none tw:absolute tw:right-[7px] tw:bottom-[7px] tw:flex tw:h-6 tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:border-white/15 tw:bg-black/75 tw:px-2.5 tw:text-[11.5px] tw:font-medium tw:text-white tw:opacity-0 tw:backdrop-blur tw:transition-opacity tw:duration-150 tw:group-hover:pointer-events-auto tw:group-hover:opacity-100 tw:hover:bg-black/90"
                    @click.stop="emit('annotate')"
                >
                    <Pencil class="tw:h-3 tw:w-3" />
                    Annotate
                </button>
            </div>

            <div
                class="tw:flex tw:flex-col tw:justify-center tw:gap-[3px] tw:px-2.5"
                :style="{ height: `${footerHeight ?? 44}px` }"
            >
                <!-- Rename in place, in the same type and the same spot: no dialog, no jump. The
                     extension sits OUTSIDE the input so it cannot be edited away. -->
                <span v-if="editing" class="tw:flex tw:items-center tw:gap-0.5">
                    <input
                        ref="input"
                        v-model="draft"
                        class="tw:h-[22px] tw:min-w-0 tw:flex-1 tw:rounded-[5px] tw:border tw:border-an-accent tw:bg-an-panel tw:px-1.5 tw:font-mono tw:text-[11.5px] tw:text-an-text tw:shadow-[0_0_0_2.5px_rgba(14,147,132,0.14)] tw:outline-none"
                        @click.stop
                        @keydown.enter.prevent="commit"
                        @keydown.esc.prevent="cancel"
                        @blur="commit"
                    />
                    <span v-if="parts.ext" class="tw:font-mono tw:text-[11px] tw:text-an-n-300">
                        {{ parts.ext }}
                    </span>
                </span>
                <p
                    v-else
                    class="tw:truncate tw:font-mono tw:text-[11.5px] tw:text-an-n-700"
                    :class="pendingName ? 'tw:opacity-60' : ''"
                    :title="`${caption} (double click to rename)`"
                    @dblclick.stop="startRename"
                >
                    {{ caption }}
                </p>
                <p class="tw:truncate tw:text-[10.5px] tw:text-an-faint">
                    {{ view.meta }} · {{ formatDayShort(image.created_at) }}
                    <template v-if="uploadedBy">· {{ uploadedBy }}</template>
                </p>
            </div>
        </div>
    </li>
</template>
