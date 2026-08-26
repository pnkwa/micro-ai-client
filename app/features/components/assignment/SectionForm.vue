<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'

const props = withDefaults(
    defineProps<{
        initial?: { title: string; instructions: string }
        submitLabel?: string
    }>(),
    {
        submitLabel: 'Save',
    },
)

const emit = defineEmits<{
    submit: [values: { title: string; instructions?: string }]
    cancel: []
}>()

const schema = z.object({
    title: z.string().trim().min(1, 'Title is required'),
    instructions: z.string().optional(),
})

const { handleSubmit } = useForm({
    validationSchema: toTypedSchema(schema),
    initialValues: props.initial ?? { title: '', instructions: '' },
})

const onSubmit = handleSubmit((values) => {
    emit('submit', {
        title: values.title.trim(),
        instructions: values.instructions?.trim() || undefined,
    })
})
</script>

<template>
    <form class="tw:flex tw:flex-col tw:gap-3" @submit.prevent="onSubmit">
        <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                Title
                <span class="tw:text-red-500">*</span>
            </label>
            <McInput name="title" placeholder="Section title" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">Instructions</label>
            <McTextarea name="instructions" placeholder="Instructions (optional)" />
        </div>
        <div class="tw:flex tw:justify-end tw:gap-2">
            <McButton type="button" variant="outline" size="sm" @click="emit('cancel')">
                Cancel
            </McButton>
            <McButton type="submit" size="sm" @click="onSubmit">{{ submitLabel }}</McButton>
        </div>
    </form>
</template>
