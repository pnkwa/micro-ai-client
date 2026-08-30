<script setup lang="ts">
import type { DragPayload } from '~/core/composables/useAlbumDrag'

/**
 * What follows the pointer while cards are being dragged onto an album.
 *
 * 120px, NOT a full-size card. A card-sized ghost covers the row you are aiming at, so you drop by
 * memory. Rotated slightly and lifted on a shadow so it reads as picked up rather than as another
 * tile that has come loose.
 *
 * `pointer-events: none` is load-bearing rather than decorative: the drag hit-tests with
 * `elementFromPoint`, and a ghost that could be hit would be the only thing ever under the cursor.
 *
 * Teleported to the body so no `overflow: hidden` on a column can clip it.
 */
defineProps<{
    payload: DragPayload
    position: { x: number; y: number }
}>()

/** Down and right of the pointer: the cursor stays visible, and so does the row underneath it. */
const OFFSET = 12
</script>

<template>
    <Teleport to="body">
        <div
            class="tw:pointer-events-none tw:fixed tw:z-[100]"
            :style="{ left: `${position.x + OFFSET}px`, top: `${position.y + OFFSET}px` }"
        >
            <!-- Two peeks behind the top card, so a batch looks like a stack rather than one
                 picture that happens to carry a number. -->
            <template v-if="payload.ids.length > 1">
                <div
                    v-for="peek in [8, 4]"
                    :key="peek"
                    class="tw:absolute tw:h-[104px] tw:w-[120px] tw:rotate-[-3deg] tw:rounded-lg tw:bg-white tw:shadow-[0_4px_12px_rgba(13,17,23,0.14)]"
                    :style="{ left: `${peek}px`, top: `${peek}px` }"
                ></div>
            </template>

            <div
                class="tw:relative tw:w-[120px] tw:rotate-[-3deg] tw:overflow-hidden tw:rounded-lg tw:bg-white tw:shadow-[0_12px_28px_rgba(13,17,23,0.28)]"
            >
                <div class="tw:aspect-[4/3] tw:bg-an-canvas">
                    <img
                        v-if="payload.thumbnails[0]"
                        :src="payload.thumbnails[0]"
                        alt=""
                        class="tw:h-full tw:w-full tw:object-cover"
                    />
                </div>
                <p
                    class="tw:truncate tw:px-2 tw:py-1.5 tw:font-mono tw:text-[10.5px] tw:text-an-n-700"
                >
                    {{ payload.label || `${payload.ids.length} images` }}
                </p>
            </div>

            <span
                v-if="payload.ids.length > 1"
                class="tw:absolute tw:-top-1.5 tw:-left-1.5 tw:flex tw:h-5 tw:w-5 tw:items-center tw:justify-center tw:rounded-full tw:bg-an-accent tw:font-mono tw:text-[11px] tw:text-white tw:tabular-nums tw:shadow-[0_2px_6px_rgba(13,17,23,0.24)]"
            >
                {{ payload.ids.length }}
            </span>
        </div>
    </Teleport>
</template>
