<script setup lang="ts">
import { HOTKEY_GROUPS } from '~/core/helpers/annotatorHotkeys'

/**
 * The `?` sheet. CONTENT ONLY - the page owns the dialog, as CreateClass.vue does.
 *
 * Its contents come from the same module the resolver lives in, so the documentation and the
 * bindings cannot drift, and a test asserts every bound key appears here.
 */
const emit = defineEmits<{ close: [] }>()
</script>

<template>
    <McDialogHeader>
        <McDialogTitle>Keyboard shortcuts</McDialogTitle>
        <McDialogDescription>
            Every one of these is off while you are typing in a field, except Escape.
        </McDialogDescription>
    </McDialogHeader>

    <div class="tw:grid tw:grid-cols-2 tw:gap-x-8 tw:gap-y-5 tw:py-2">
        <section v-for="group in HOTKEY_GROUPS" :key="group.title">
            <h3
                class="tw:mb-2 tw:text-[10px] tw:font-semibold tw:tracking-wider tw:text-an-faint tw:uppercase"
            >
                {{ group.title }}
            </h3>
            <dl class="tw:flex tw:flex-col tw:gap-1.5">
                <div
                    v-for="row in group.keys"
                    :key="row.label"
                    class="tw:flex tw:items-center tw:gap-2"
                >
                    <dt class="tw:flex tw:shrink-0 tw:items-center tw:gap-1">
                        <template v-for="(key, index) in row.keys" :key="key">
                            <span v-if="index > 0" class="tw:text-[10px] tw:text-an-n-300">to</span>
                            <kbd
                                class="tw:rounded tw:border tw:border-an-n-200 tw:bg-an-n-100 tw:px-1.5 tw:py-0.5 tw:font-mono tw:text-[10px] tw:leading-none tw:text-an-muted"
                            >
                                {{ key }}
                            </kbd>
                        </template>
                    </dt>
                    <dd class="tw:min-w-0 tw:text-[12px] tw:text-an-n-600">
                        {{ row.label }}
                    </dd>
                </div>
            </dl>
        </section>
    </div>

    <McDialogFooter>
        <McButton variant="outline" @click="emit('close')">Close</McButton>
    </McDialogFooter>
</template>
