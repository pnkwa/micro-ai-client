<script setup lang="ts">
withDefaults(
    defineProps<{
        open: boolean
        title?: string
        description?: string
        confirmLabel?: string
        cancelLabel?: string
        loading?: boolean
    }>(),
    {
        title: 'Are you sure?',
        description: '',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        loading: false,
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
                    variant="destructive"
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
