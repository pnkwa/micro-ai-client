<script setup lang="ts">
import type { ButtonVariants } from '~/core/components/ui/button'

withDefaults(
    defineProps<{
        open: boolean
        title?: string
        description?: string
        confirmLabel?: string
        cancelLabel?: string
        loading?: boolean
        /**
         * Deletion is what this dialog was built for, so red stays the default. Set it for a
         * confirmation that is serious but not destructive (releasing an assignment), where
         * red would misread as "this removes something".
         */
        confirmVariant?: ButtonVariants['variant']
    }>(),
    {
        title: 'Are you sure?',
        description: '',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        loading: false,
        confirmVariant: 'destructive',
    },
)

const emit = defineEmits<{
    'update:open': [value: boolean]
    confirm: []
}>()
</script>

<template>
    <McDialog :open="open" @update:open="emit('update:open', $event)">
        <McDialogContent class="tw:sm:max-w-md">
            <McDialogHeader>
                <McDialogTitle>{{ title }}</McDialogTitle>
                <McDialogDescription v-if="description">{{ description }}</McDialogDescription>
            </McDialogHeader>
            <McDialogFooter>
                <McButton variant="outline" type="button" @click="emit('update:open', false)">
                    {{ cancelLabel }}
                </McButton>
                <McButton
                    :variant="confirmVariant"
                    type="button"
                    :loading="loading"
                    @click="emit('confirm')"
                >
                    {{ confirmLabel }}
                </McButton>
            </McDialogFooter>
        </McDialogContent>
    </McDialog>
</template>
