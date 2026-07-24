<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { toast } from 'vue-sonner'
import {
    slideCollectionService,
    type SlideCollectionListItem,
} from '~/services/slideCollectionService'
import type { CreateExamInput } from '~/services/examService'

const props = defineProps<{ classId: number }>()

const emit = defineEmits<{ save: [values: CreateExamInput]; cancel: [] }>()

const collections = ref<SlideCollectionListItem[]>([])
const isLoadingCollections = ref(false)

const loadCollections = async () => {
    isLoadingCollections.value = true
    try {
        collections.value = await slideCollectionService.list()
    } catch {
        toast.error('Failed to load slide collections')
    } finally {
        isLoadingCollections.value = false
    }
}
onMounted(loadCollections)

const collectionOptions = computed(() =>
    collections.value.map((c) => ({ value: c.id, label: c.name })),
)

const { $dayjs } = useNuxtApp()

// The threshold stays outside vee-validate (a checkbox + 0..1 slider, not a text field).
const useThreshold = ref(false)
const threshold = ref(0.5)

// The window uses the date+time picker; fields hold 'YYYY-MM-DDTHH:mm' (local), converted to
// ISO instants on submit.
const schema = z.object({
    name: z.string().trim().min(1, 'Exam name is required'),
    description: z.string().optional(),
    instructions: z.string().optional(),
    slideCollectionId: z.coerce.number().int().positive('Pick a slide collection'),
    examOpensAt: z.string().optional(),
    examClosesAt: z.string().min(1, 'Set when the exam closes'),
})
type FormValues = z.infer<typeof schema>

const { handleSubmit, errors } = useForm<FormValues>({
    validationSchema: toTypedSchema(schema),
    initialValues: {
        name: '',
        description: '',
        instructions: '',
        slideCollectionId: undefined as unknown as number,
        examOpensAt: '',
        examClosesAt: '',
    },
})

const handleSave = handleSubmit((values) => {
    // due_date follows the close time (an assignment always needs one).
    const opens = values.examOpensAt ? $dayjs(values.examOpensAt) : null
    const closes = $dayjs(values.examClosesAt)
    if (opens && !opens.isBefore(closes)) {
        return toast.error('The exam must open before it closes')
    }
    emit('save', {
        classId: props.classId,
        name: values.name.trim(),
        dueDate: closes.toISOString(),
        status: 'active',
        description: values.description?.trim() || undefined,
        instructions: values.instructions?.trim() || undefined,
        slideCollectionId: values.slideCollectionId,
        examOpensAt: opens?.toISOString(),
        examClosesAt: closes.toISOString(),
        examConfidenceThreshold: useThreshold.value ? threshold.value : undefined,
    })
})
</script>

<template>
    <McDialogHeader>
        <McDialogTitle>Create Unknown slide identification exam</McDialogTitle>
    </McDialogHeader>
    <form
        class="tw:flex tw:flex-col tw:gap-4 tw:p-2 tw:max-h-[60vh] tw:overflow-y-auto"
        @submit.prevent="handleSave"
    >
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">
                Exam name
                <span class="tw:text-red-500">*</span>
            </label>
            <McInput name="name" placeholder="e.g., Midterm Lab Exam" />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">
                Slide collection
                <span class="tw:text-red-500">*</span>
            </label>
            <McSelect
                name="slideCollectionId"
                placeholder="Pick the answer-key collection"
                :options="collectionOptions"
                option-value="value"
                option-label="label"
                :loading="isLoadingCollections"
            />
            <span v-if="errors.slideCollectionId" class="tw:text-xs tw:text-red-500">
                {{ errors.slideCollectionId }}
            </span>
            <p
                v-if="!isLoadingCollections && collections.length === 0"
                class="tw:text-xs tw:text-warning"
            >
                No collections yet. Create one in the Slide Library first.
            </p>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Instructions</label>
            <McTextarea
                name="instructions"
                auto-list
                class="tw:min-h-24 tw:text-sm tw:leading-relaxed"
                placeholder="What to do at each slide station…"
            />
        </div>

        <div class="tw:grid tw:grid-cols-2 tw:gap-4">
            <div class="tw:flex tw:flex-col tw:gap-1">
                <label class="tw:text-sm tw:font-medium">Opens</label>
                <McDatePicker name="examOpensAt" with-time placeholder="Open time (optional)" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
                <label class="tw:text-sm tw:font-medium">
                    Closes
                    <span class="tw:text-red-500">*</span>
                </label>
                <McDatePicker name="examClosesAt" with-time placeholder="Close time" />
            </div>
        </div>
        <p class="tw:text-xs tw:text-navy-50 tw:-mt-2">
            Students can only submit inside this window. The exam is due when it closes. Leave Opens
            blank for no start restriction.
        </p>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-medium">
                <input v-model="useThreshold" type="checkbox" class="tw:accent-primary" />
                Set an AI confidence threshold
            </label>
            <p class="tw:text-xs tw:text-navy-50">
                A student's diagnosis auto-passes only when the AI agrees above this confidence;
                otherwise it goes to review. Off = every correct diagnosis is reviewed.
            </p>
            <McConfidenceThreshold
                v-if="useThreshold"
                v-model="threshold"
                label="Auto-pass confidence"
                hint="Below this, a correct diagnosis is flagged for instructor review."
            />
        </div>
    </form>
    <McDialogFooter>
        <McButton variant="outline" @click="emit('cancel')">Cancel</McButton>
        <McButton @click="handleSave">Create exam</McButton>
    </McDialogFooter>
</template>
