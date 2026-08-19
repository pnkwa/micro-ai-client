<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'

const props = withDefaults(
    defineProps<{
        initial?: { name: string; description: string }
        submitLabel?: string
    }>(),
    { submitLabel: 'Save' },
)

const emit = defineEmits<{
    submit: [values: { name: string; description?: string }]
    cancel: []
}>()

const schema = z.object({
    name: z.string().trim().min(1, 'Name is required'),
    description: z.string().optional(),
})

const { handleSubmit } = useForm({
    validationSchema: toTypedSchema(schema),
    initialValues: props.initial ?? { name: '', description: '' },
})

const onSubmit = handleSubmit((values) => {
    emit('submit', {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
    })
})
</script>

<template>
    <form class="tw:flex tw:flex-col tw:gap-3" @submit.prevent="onSubmit">
        <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                Name
                <span class="tw:text-red-500">*</span>
            </label>
            <McInput name="name" placeholder="e.g. Vaginal smear - teaching set" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">Description</label>
            <McTextarea name="description" placeholder="What this collection is for (optional)" />
        </div>
        <div class="tw:flex tw:justify-end tw:gap-2">
            <McButton type="button" variant="outline" size="sm" @click="emit('cancel')">
                Cancel
            </McButton>
            <McButton type="submit" size="sm" @click="onSubmit">{{ submitLabel }}</McButton>
        </div>
    </form>
</template>
