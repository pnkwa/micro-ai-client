<script setup lang="ts">
import { Layers, Clock, Gauge, Pencil, ClipboardList } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { examService, type Exam, type UpdateExamInput } from '~/services/examService'
import {
    slideCollectionService,
    type SlideCollectionListItem,
} from '~/services/slideCollectionService'

const props = withDefaults(defineProps<{ exam: Exam; isStudent?: boolean }>(), {
    isStudent: false,
})
const emit = defineEmits<{ reload: [] }>()

const { $dayjs } = useNuxtApp()
const fmt = (d: string | null) => (d ? $dayjs(d).format('MMM D, YYYY HH:mm') : '-')

// The slide collection and AI threshold are staff answer-key concerns; students only get the
// window. The collection list endpoint is staff-only, so students don't call it at all.
const collections = ref<SlideCollectionListItem[]>([])
const collectionName = computed(
    () => collections.value.find((c) => c.id === props.exam.slide_collection_id)?.name ?? '-',
)
onMounted(async () => {
    if (props.isStudent) return
    try {
        collections.value = await slideCollectionService.list()
    } catch {
        /* names just fall back to the placeholder dash */
    }
})

// ---- inline edit ----
const isEditing = ref(false)
const isSaving = ref(false)

// McDatePicker (with-time) holds 'YYYY-MM-DDTHH:mm' local; the API returns ISO instants.
const toLocalDateTime = (iso: string | null) => (iso ? $dayjs(iso).format('YYYY-MM-DDTHH:mm') : '')

const draft = reactive({
    name: '',
    description: '',
    instructions: '',
    slideCollectionId: 0,
    opensAt: '',
    closesAt: '',
    useThreshold: false,
    threshold: 0.6,
})

const startEdit = () => {
    draft.name = props.exam.name
    draft.description = props.exam.description ?? ''
    draft.instructions = props.exam.instructions ?? ''
    draft.slideCollectionId = props.exam.slide_collection_id ?? 0
    draft.opensAt = toLocalDateTime(props.exam.exam_opens_at)
    draft.closesAt = toLocalDateTime(props.exam.exam_closes_at)
    draft.useThreshold = props.exam.exam_confidence_threshold != null
    draft.threshold = props.exam.exam_confidence_threshold ?? 0.6
    isEditing.value = true
}

const collectionOptions = computed(() =>
    collections.value.map((c) => ({ value: c.id, label: c.name })),
)

const save = async () => {
    // The exam is due when it closes, so the close time is required and drives due_date.
    if (!draft.closesAt) return toast.error('Set when the exam closes')
    const opens = draft.opensAt ? $dayjs(draft.opensAt) : null
    const closes = $dayjs(draft.closesAt)
    if (opens && !opens.isBefore(closes)) {
        return toast.error('The exam must open before it closes')
    }
    isSaving.value = true
    try {
        const payload: UpdateExamInput = {
            name: draft.name.trim(),
            dueDate: closes.toISOString(),
            description: draft.description.trim() || undefined,
            instructions: draft.instructions.trim() || undefined,
            slideCollectionId: draft.slideCollectionId,
            examOpensAt: opens?.toISOString(),
            examClosesAt: closes.toISOString(),
            examConfidenceThreshold: draft.useThreshold ? draft.threshold : undefined,
        }
        await examService.update(props.exam.id, payload)
        isEditing.value = false
        emit('reload')
        toast.success('Exam updated')
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to update exam'))
    } finally {
        isSaving.value = false
    }
}
</script>

<template>
    <form
        v-if="isEditing"
        class="tw:flex tw:flex-col tw:gap-4 tw:rounded-md tw:border tw:border-navy-20 tw:bg-navy-10/20 tw:p-6"
        @submit.prevent="save"
    >
        <div
            class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-navy-20 tw:pb-3 tw:text-sm tw:font-semibold tw:text-navy-60"
        >
            <Pencil class="tw:size-4 tw:text-navy-30" />
            Edit exam
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Exam name</label>
            <McInput v-model="draft.name" class="tw:bg-white/50" />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Slide collection</label>
            <McSelect
                :model-value="draft.slideCollectionId"
                :options="collectionOptions"
                option-value="value"
                option-label="label"
                class="tw:bg-white/50"
                @update:model-value="draft.slideCollectionId = Number($event)"
            />
        </div>

        <div class="tw:grid tw:grid-cols-2 tw:gap-4">
            <div class="tw:flex tw:flex-col tw:gap-1">
                <label class="tw:text-sm tw:font-medium">Opens</label>
                <McDatePicker
                    name=""
                    with-time
                    :model-value="draft.opensAt"
                    placeholder="Open time (optional)"
                    class="tw:bg-white/50"
                    @update:model-value="draft.opensAt = $event"
                />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
                <label class="tw:text-sm tw:font-medium">
                    Closes
                    <span class="tw:text-red-500">*</span>
                </label>
                <McDatePicker
                    name=""
                    with-time
                    :model-value="draft.closesAt"
                    placeholder="Close time"
                    class="tw:bg-white/50"
                    @update:model-value="draft.closesAt = $event"
                />
            </div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-medium">
                <input v-model="draft.useThreshold" type="checkbox" class="tw:accent-primary" />
                AI confidence threshold
            </label>
            <McConfidenceThreshold
                v-if="draft.useThreshold"
                v-model="draft.threshold"
                label="Auto-pass confidence"
            />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Instructions</label>
            <McTextarea v-model="draft.instructions" class="tw:min-h-24 tw:bg-white/50" />
        </div>

        <div class="tw:flex tw:justify-end tw:gap-2">
            <McButton variant="outline" type="button" @click="isEditing = false">Cancel</McButton>
            <McButton type="submit" :loading="isSaving" @click="save">Save changes</McButton>
        </div>
    </form>

    <template v-else>
        <div v-if="!isStudent" class="tw:flex tw:justify-end tw:mb-3">
            <McButton variant="outline" size="sm" @click="startEdit">
                <Pencil class="tw:w-3.5 tw:h-3.5 tw:mr-1" />
                Edit
            </McButton>
        </div>

        <div
            class="tw:grid tw:grid-cols-2 tw:gap-4 tw:mb-4"
            :class="isStudent ? 'tw:sm:grid-cols-2' : 'tw:sm:grid-cols-4'"
        >
            <div
                v-if="!isStudent"
                class="tw:flex tw:items-center tw:gap-3 tw:p-4 tw:bg-white/50 tw:rounded-md tw:border tw:border-navy-20"
            >
                <Layers class="tw:w-5 tw:h-5 tw:text-navy-60 tw:shrink-0" />
                <div class="tw:min-w-0">
                    <p class="tw:text-xs tw:text-navy-60">Slide collection</p>
                    <p class="tw:text-sm tw:font-medium tw:truncate">{{ collectionName }}</p>
                </div>
            </div>
            <div
                class="tw:flex tw:items-center tw:gap-3 tw:p-4 tw:bg-white/50 tw:rounded-md tw:border tw:border-navy-20"
            >
                <Clock class="tw:w-5 tw:h-5 tw:text-navy-60 tw:shrink-0" />
                <div class="tw:min-w-0">
                    <p class="tw:text-xs tw:text-navy-60">Opens</p>
                    <p class="tw:text-sm tw:font-medium">{{ fmt(exam.exam_opens_at) }}</p>
                </div>
            </div>
            <div
                class="tw:flex tw:items-center tw:gap-3 tw:p-4 tw:bg-white/50 tw:rounded-md tw:border tw:border-navy-20"
            >
                <Clock class="tw:w-5 tw:h-5 tw:text-navy-60 tw:shrink-0" />
                <div class="tw:min-w-0">
                    <p class="tw:text-xs tw:text-navy-60">Closes</p>
                    <p class="tw:text-sm tw:font-medium">{{ fmt(exam.exam_closes_at) }}</p>
                </div>
            </div>
            <div
                v-if="!isStudent"
                class="tw:flex tw:items-center tw:gap-3 tw:p-4 tw:bg-white/50 tw:rounded-md tw:border tw:border-navy-20"
            >
                <Gauge class="tw:w-5 tw:h-5 tw:text-navy-60 tw:shrink-0" />
                <div class="tw:min-w-0">
                    <p class="tw:text-xs tw:text-navy-60">AI threshold</p>
                    <p class="tw:text-sm tw:font-medium">
                        {{
                            exam.exam_confidence_threshold != null
                                ? Math.round(exam.exam_confidence_threshold * 100) + '%'
                                : 'Off'
                        }}
                    </p>
                </div>
            </div>
        </div>

        <div
            v-if="exam.instructions"
            class="tw:bg-white/50 tw:rounded-md tw:border tw:border-gray-200 tw:p-6"
        >
            <h2
                class="tw:flex tw:items-center tw:gap-2 tw:text-base tw:font-semibold tw:text-navy-100 tw:mb-3"
            >
                <ClipboardList class="tw:w-5 tw:h-5" />
                Instructions
            </h2>
            <div class="tw:text-sm tw:leading-loose tw:text-navy-80">
                <p
                    v-for="(line, i) in exam.instructions.split('\n')"
                    :key="i"
                    class="tw:mb-1 last:tw:mb-0"
                >
                    {{ line }}
                </p>
            </div>
        </div>
    </template>
</template>
