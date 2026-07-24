<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import type { SlideInput } from '~/services/slideCollectionService'

const props = withDefaults(
    defineProps<{
        initial?: { slide_number: number; accepted_answers: string[]; notes: string }
        submitLabel?: string
    }>(),
    { submitLabel: 'Save' },
)

const emit = defineEmits<{
    submit: [values: SlideInput]
    cancel: []
}>()

// accepted_answers is a string[] but entered as one phrasing per line, the same shape the
// question authoring form uses for free-text answers.
const schema = z.object({
    slide_number: z.coerce.number().int().min(0, 'Slide number must be 0 or more'),
    accepted_answers: z.string().trim().min(1, 'At least one accepted answer is required'),
    notes: z.string().optional(),
})

const { handleSubmit } = useForm({
    validationSchema: toTypedSchema(schema),
    initialValues: props.initial
        ? {
              slide_number: props.initial.slide_number,
              accepted_answers: props.initial.accepted_answers.join('\n'),
              notes: props.initial.notes,
          }
        : { slide_number: undefined, accepted_answers: '', notes: '' },
})

const onSubmit = handleSubmit((values) => {
    emit('submit', {
        slide_number: values.slide_number,
        accepted_answers: values.accepted_answers
            .split('\n')
            .map((a) => a.trim())
            .filter(Boolean),
        notes: values.notes?.trim() || undefined,
    })
})
</script>

<template>
    <form class="tw:flex tw:flex-col tw:gap-3" @submit.prevent="onSubmit">
        <div class="tw:grid tw:grid-cols-3 tw:gap-3">
            <div class="tw:flex tw:flex-col tw:gap-1">
                <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                    Slide #
                    <span class="tw:text-red-500">*</span>
                </label>
                <McInput name="slide_number" type="number" placeholder="e.g. 1" />
            </div>
            <div class="tw:col-span-2 tw:flex tw:flex-col tw:gap-1">
                <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                    Accepted answers
                    <span class="tw:text-red-500">*</span>
                </label>
                <McTextarea
                    name="accepted_answers"
                    placeholder="One accepted phrasing per line, e.g.&#10;Bacterial vaginosis&#10;BV"
                />
                <span class="tw:text-[11px] tw:text-navy-40">One accepted phrasing per line.</span>
            </div>
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">Notes</label>
            <McTextarea name="notes" placeholder="Prep or provenance notes (optional)" />
        </div>
        <div class="tw:flex tw:justify-end tw:gap-2">
            <McButton type="button" variant="outline" size="sm" @click="emit('cancel')">
                Cancel
            </McButton>
            <McButton type="submit" size="sm" @click="onSubmit">{{ submitLabel }}</McButton>
        </div>
    </form>
</template>
