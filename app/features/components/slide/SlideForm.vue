<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import type { SlideInput } from '~/services/slideCollectionService'
import { isValidSlideNumber, normalizeSlideNumber } from '~/core/helpers/slideNumber'

const props = withDefaults(
    defineProps<{
        initial?: { slide_number: string; accepted_answers: string[]; notes: string }
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
    // Free text, because a label may be "V7" as easily as "7". Validated against the canonical
    // pattern rather than a number, and normalized on submit so what is stored is what the
    // student's entry will be compared against.
    slide_number: z
        .string()
        .trim()
        .min(1, 'Slide is required')
        .refine(isValidSlideNumber, 'Use a slide label like V7, 7, VVC12 or G3A'),
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
        : { slide_number: '', accepted_answers: '', notes: '' },
})

const onSubmit = handleSubmit((values) => {
    emit('submit', {
        // Non-null: the schema's refine already rejected anything that doesn't normalize.
        slide_number: normalizeSlideNumber(values.slide_number)!,
        accepted_answers: values.accepted_answers
            .split('\n')
            .map((a) => a.trim())
            .filter(Boolean),
        notes: values.notes?.trim() || undefined,
    })
})
</script>

<template>
    <!--
        Fields are stacked, not side by side. McTextarea has a min-height of 6rem, so pairing the
        one-line slide input with the answers textarea in a grid row left the input floating in
        dead space and made the row jump whenever either field showed an error. Stacking also
        matches SlideCollectionForm, so the two dialogs in this feature read as one product.
    -->
    <form class="tw:flex tw:flex-col tw:gap-4" @submit.prevent="onSubmit">
        <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                Slide
                <span class="tw:text-red-500">*</span>
            </label>
            <!-- Capped: the value is at most 16 characters, so a full-width box for "V7" reads
                 like the field expects far more than it does. -->
            <McInput name="slide_number" placeholder="V7" class="tw:max-w-36" />
            <span class="tw:text-[11px] tw:text-navy-40">
                The label printed on the slide. Letter codes are fine: V7, 12, VVC12, G3A.
            </span>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                Accepted answers
                <span class="tw:text-red-500">*</span>
            </label>
            <McTextarea name="accepted_answers" placeholder="Bacterial vaginosis&#10;BV" />
            <!-- Kept below the field rather than only in the placeholder: the placeholder
                 disappears on the first keystroke, which is exactly when the rule starts to
                 matter. -->
            <span class="tw:text-[11px] tw:text-navy-40">
                One phrasing per line. A code or its full diagnosis both count as correct.
            </span>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">
                Notes
                <span class="tw:font-normal tw:text-navy-40">(optional)</span>
            </label>
            <!-- Shorter than the answers box on purpose: staff prep notes are secondary, and an
                 equal-sized field implies they carry equal weight. -->
            <McTextarea name="notes" placeholder="Prep or provenance notes" class="tw:min-h-16" />
        </div>

        <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-1">
            <McButton type="button" variant="outline" size="sm" @click="emit('cancel')">
                Cancel
            </McButton>
            <McButton type="submit" size="sm" @click="onSubmit">{{ submitLabel }}</McButton>
        </div>
    </form>
</template>
