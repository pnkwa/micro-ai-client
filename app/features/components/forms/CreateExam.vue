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
import NoSlideCollections from '~/features/components/slide/NoSlideCollections.vue'

const props = defineProps<{ classId: number }>()

const emit = defineEmits<{ save: [values: CreateExamInput]; cancel: [] }>()

const collections = ref<SlideCollectionListItem[]>([])
const isLoadingCollections = ref(false)
// Kept apart from "you have none yet": the empty state says something different for each, and
// telling an instructor to create a collection they already have would be its own bug.
const collectionsFailed = ref(false)

const loadCollections = async () => {
    isLoadingCollections.value = true
    try {
        collections.value = await slideCollectionService.list()
        collectionsFailed.value = false
    } catch {
        collectionsFailed.value = true
    } finally {
        isLoadingCollections.value = false
    }
}
onMounted(loadCollections)

const collectionOptions = computed(() =>
    collections.value.map((c) => ({ value: c.id, label: c.name })),
)

const { $dayjs } = useNuxtApp()

// The window uses the date+time picker; fields hold 'YYYY-MM-DDTHH:mm' (local), converted to
// ISO instants on submit.
const schema = z.object({
    name: z.string().trim().min(1, 'Exam name is required'),
    description: z.string().optional(),
    instructions: z.string().optional(),
    slideCollectionId: z.coerce.number().int().positive('Pick a slide collection'),
    opensAt: z.string().optional(),
    closesAt: z.string().min(1, 'Set when the exam closes'),
})
type FormValues = z.infer<typeof schema>

const { handleSubmit, errors } = useForm<FormValues>({
    validationSchema: toTypedSchema(schema),
    initialValues: {
        name: '',
        description: '',
        instructions: '',
        slideCollectionId: undefined as unknown as number,
        opensAt: '',
        closesAt: '',
    },
})

const handleSave = handleSubmit((values) => {
    // due_date follows the close time (an assignment always needs one).
    const opens = values.opensAt ? $dayjs(values.opensAt) : null
    const closes = $dayjs(values.closesAt)
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
        opensAt: opens?.toISOString(),
        closesAt: closes.toISOString(),
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
            <!--
                Same dead end as the question editor's picker, so the same component: an exam
                cannot be created without a collection, and the instructor is mid-form.
            -->
            <NoSlideCollections
                v-if="!isLoadingCollections && collections.length === 0"
                :failed="collectionsFailed"
                noun="exam"
                @retry="loadCollections"
            />
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

        <!--
            items-start so the two columns stay top-aligned when only one of them is showing a
            validation error (Closes is the required one, so in practice only it grows).
        -->
        <div class="tw:grid tw:grid-cols-2 tw:gap-4 tw:items-start">
            <div class="tw:flex tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">Opens</label>
                <McDatePicker name="opensAt" with-time placeholder="Open time" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-2">
                <label class="tw:text-sm tw:font-medium">
                    Closes
                    <span class="tw:text-red-500">*</span>
                </label>
                <McDatePicker name="closesAt" with-time placeholder="Close time" />
            </div>
        </div>
        <p class="tw:text-xs tw:text-navy-50 tw:-mt-2">
            Students can only submit inside this window. The exam is due when it closes. Leave Opens
            blank for no start restriction.
        </p>

        <!-- The AI confidence threshold used to be set here, for the whole exam. It moved onto
             each question in v0.7 (BE-ADR-034), where the model that produces the confidence
             already lives, so it is set per station in the question editor now. -->
    </form>
    <McDialogFooter>
        <McButton variant="outline" @click="emit('cancel')">Cancel</McButton>
        <McButton @click="handleSave">Create exam</McButton>
    </McDialogFooter>
</template>
