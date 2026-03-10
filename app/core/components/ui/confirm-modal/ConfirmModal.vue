<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'

export interface ConfirmModalProps {
    title?: string
    description?: string
    confirmText?: string
    cancelText?: string
    variant?: 'default' | 'destructive'
}

withDefaults(defineProps<ConfirmModalProps>(), {
    title: 'Are you sure?',
    description: 'This action cannot be undone.',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'default',
})

const emit = defineEmits<{
    confirm: []
    cancel: []
}>()

const handleConfirm = () => {
    emit('confirm')
}

const handleCancel = () => {
    emit('cancel')
}
</script>

<template>
    <McDialogHeader>
        <div class="tw:flex tw:items-center tw:gap-3">
            <div
                v-if="variant === 'destructive'"
                class="tw:flex tw:items-center tw:justify-center tw:w-10 tw:h-10 tw:rounded-full tw:bg-red-100"
            >
                <AlertTriangle class="tw:w-5 tw:h-5 tw:text-red-600" />
            </div>
            <McDialogTitle>{{ title }}</McDialogTitle>
        </div>
        <McDialogDescription class="tw:mt-2">
            {{ description }}
        </McDialogDescription>
    </McDialogHeader>
    <McDialogFooter class="tw:mt-4">
        <McButton variant="outline" @click="handleCancel">{{ cancelText }}</McButton>
        <McButton
            :variant="variant === 'destructive' ? 'destructive' : 'default'"
            @click="handleConfirm"
        >
            {{ confirmText }}
        </McButton>
    </McDialogFooter>
</template>
