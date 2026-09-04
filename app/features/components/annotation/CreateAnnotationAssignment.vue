<script setup lang="ts">
import { Plus, X, Shapes, Info, GripVertical } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import {
    createAnnotationAssignmentFormSchema,
    type CreateAnnotationAssignmentFormData,
    type LabelClassRow,
    type FieldPromptRow,
} from '~/features/types/forms/annotationAssignment'
import { albumService, type Album } from '~/services/albumService'
import type { CreateAnnotationAssignmentInput } from '~/services/annotationAssignmentService'

const props = defineProps<{ defaultClassId: number }>()

const emit = defineEmits<{
    save: [values: CreateAnnotationAssignmentInput]
    cancel: []
}>()

const { $dayjs } = useNuxtApp()

const { handleSubmit } = useForm<CreateAnnotationAssignmentFormData>({
    validationSchema: toTypedSchema(createAnnotationAssignmentFormSchema),
    initialValues: { name: '', description: '', instructions: '', dueDate: '' },
})

// ---- album (the image pool) ----
const albums = ref<Album[]>([])
const albumId = ref<number | null>(null)
const albumsLoading = ref(true)
onMounted(async () => {
    try {
        // Only `assignment`-kind albums are attachable (the server enforces it too).
        albums.value = (await albumService.list()).filter((a) => a.kind === 'assignment')
        albumId.value = albums.value[0]?.id ?? null
    } catch {
        toast.error('Could not load albums')
    } finally {
        albumsLoading.value = false
    }
})

// ---- skipping ----
const allowSkip = ref(true)

// ---- label classes (the fixed vocabulary; empty = free-text labels) ----
// Colour is stored as 6-hex (no #) to match the server; the <input type=color> works in '#rrggbb'.
const SWATCHES = ['7c5ce0', 'd97706', '2e9bd6', '64748b', 'db5a7e']
const labelClasses = ref<LabelClassRow[]>([])
const addClass = () =>
    labelClasses.value.push({
        label: '',
        color: SWATCHES[labelClasses.value.length % SWATCHES.length]!,
    })
const removeClass = (i: number) => labelClasses.value.splice(i, 1)
// The <input type=color> works in '#rrggbb'; the server wants 6 hex, no leading #.
const setColor = (i: number, hex: string) => {
    labelClasses.value[i]!.color = hex.replace('#', '')
}

// ---- per-image fill-in fields ----
const PROMPT_TYPES = [
    { value: 'text', label: 'Short text' },
    { value: 'textarea', label: 'Paragraph' },
    { value: 'number', label: 'Number' },
] as const
// A hard cap keeps the per-image form short enough to fit above the canvas on a tablet, and the
// label length is bounded so a prompt cannot push the collapsible header out of shape.
const MAX_PROMPTS = 5
const MAX_PROMPT_LABEL = 60
const fieldPrompts = ref<FieldPromptRow[]>([])
const addPrompt = () => {
    if (fieldPrompts.value.length >= MAX_PROMPTS) return
    fieldPrompts.value.push({
        key: '',
        label: '',
        type: 'text',
        required: true,
        gradable: false,
        points: 1,
    })
}
const removePrompt = (i: number) => fieldPrompts.value.splice(i, 1)

// A key is derived from the label if the author leaves it blank, so they rarely see it.
const keyFor = (row: FieldPromptRow) =>
    (row.key.trim() || row.label.trim().toLowerCase().replace(/\s+/g, '_')).slice(0, 40)

const handleSave = handleSubmit((values) => {
    if (!albumId.value) return toast.error('Pick an album for this assignment')

    const due = values.dueDate ? $dayjs(values.dueDate) : null
    if (due?.isBefore($dayjs())) return toast.error('The due date is in the past')

    // Label classes: every row needs a name; the set may be empty (free text).
    const classes = labelClasses.value.filter((c) => c.label.trim())
    const dupClass = classes.find(
        (c, i) =>
            classes.findIndex(
                (o) => o.label.trim().toLowerCase() === c.label.trim().toLowerCase(),
            ) !== i,
    )
    if (dupClass) return toast.error(`Duplicate class "${dupClass.label}"`)

    // Prompts: every row needs a label; keys must be unique.
    const prompts = fieldPrompts.value.filter((p) => p.label.trim())
    const keys = prompts.map(keyFor)
    if (new Set(keys).size !== keys.length)
        return toast.error('Two fill-in fields resolve to the same key: rename one')

    emit('save', {
        classId: props.defaultClassId,
        name: values.name,
        description: values.description,
        instructions: values.instructions,
        dueDate: values.dueDate || undefined,
        albumId: albumId.value,
        allowSkip: allowSkip.value,
        // Always all album images (BE-ADR-039): required_count stays null.
        requiredCount: null,
        labelSet: classes.map((c) => ({ label: c.label.trim(), color: c.color })),
        fieldPrompts: prompts.map((p) => ({
            key: keyFor(p),
            label: p.label.trim(),
            type: p.type,
            required: p.required,
            gradable: p.gradable,
            // Only meaningful when gradable; normalize to a non-negative number.
            ...(p.gradable && { points: Math.max(0, Number(p.points) || 0) }),
        })),
    })
})
</script>

<template>
    <form
        class="tw:flex tw:flex-col tw:gap-4 tw:p-2 tw:max-h-[62vh] tw:overflow-y-auto"
        @submit.prevent="handleSave"
    >
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">
                Assignment Name
                <span class="tw:text-red-500">*</span>
            </label>
            <McInput name="name" placeholder="e.g., Label the clue cells" />
        </div>

        <!-- Album -->
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">
                Album
                <span class="tw:text-red-500">*</span>
            </label>
            <select
                v-model.number="albumId"
                class="tw:h-9 tw:rounded-md tw:border tw:border-input tw:bg-background tw:px-3 tw:text-sm"
            >
                <option v-if="albumsLoading" :value="null">Loading…</option>
                <option v-else-if="albums.length === 0" :value="null">
                    No assignment albums: create one in the Image Library first
                </option>
                <option v-for="a in albums" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <div
                class="tw:mt-1 tw:flex tw:items-start tw:gap-2 tw:rounded-md tw:border tw:border-primary/20 tw:bg-primary/5 tw:px-3 tw:py-2 tw:text-xs tw:text-navy-80"
            >
                <Info class="tw:mt-0.5 tw:size-3.5 tw:shrink-0 tw:text-primary" />
                <span>
                    Students annotate the album's images. There is
                    <b>no auto-grading</b>
                    here, so you review each student. Your own boxes on these images are the
                    reference key.
                </span>
            </div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Instructions to students</label>
            <McTextarea
                name="instructions"
                auto-list
                class="tw:min-h-24 tw:text-sm tw:leading-relaxed"
                placeholder="Draw a box around every clue cell and label it. Skip a field only if none are present."
            />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Due Date</label>
            <McDatePicker name="dueDate" with-time disable-past placeholder="Select date & time" />
        </div>

        <label
            class="tw:flex tw:items-center tw:gap-2.5 tw:rounded-md tw:border tw:border-navy-15 tw:px-3 tw:py-2.5"
        >
            <input v-model="allowSkip" type="checkbox" class="tw:size-4 tw:accent-primary" />
            <span class="tw:text-sm tw:text-navy-80">Allow skipping images</span>
            <span class="tw:ml-auto tw:text-xs tw:text-navy-50">
                student can mark "no findings"
            </span>
        </label>

        <!-- Label classes -->
        <div class="tw:flex tw:flex-col tw:gap-2">
            <div class="tw:flex tw:items-center tw:justify-between">
                <label class="tw:text-sm tw:font-medium">Label classes</label>
                <span class="tw:text-xs tw:text-navy-50">leave empty for free-text labels</span>
            </div>
            <div
                v-for="(row, i) in labelClasses"
                :key="`class-${i}`"
                class="tw:flex tw:items-center tw:gap-2"
            >
                <input
                    type="color"
                    :value="`#${row.color}`"
                    class="tw:size-8 tw:shrink-0 tw:cursor-pointer tw:rounded tw:border tw:border-navy-20"
                    @input="setColor(i, ($event.target as HTMLInputElement).value)"
                />
                <McInput v-model="row.label" placeholder="Class name" class="tw:flex-1" />
                <button
                    type="button"
                    aria-label="Remove class"
                    class="tw:flex tw:size-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:border tw:border-input tw:text-navy-60 tw:hover:border-danger tw:hover:text-danger"
                    @click="removeClass(i)"
                >
                    <X class="tw:size-4" />
                </button>
            </div>
            <McButton type="button" variant="outline" size="sm" class="tw:w-full" @click="addClass">
                <Plus class="tw:mr-1 tw:size-3.5" />
                Add class
            </McButton>
        </div>

        <!-- Per-image fill-in fields -->
        <div class="tw:flex tw:flex-col tw:gap-2">
            <div class="tw:flex tw:items-center tw:justify-between">
                <label class="tw:text-sm tw:font-medium">Per-image fill-in fields</label>
                <span class="tw:text-xs tw:text-navy-50">answered on every image</span>
            </div>
            <div
                v-for="(row, i) in fieldPrompts"
                :key="`prompt-${i}`"
                class="tw:flex tw:items-center tw:gap-2"
            >
                <GripVertical class="tw:size-4 tw:shrink-0 tw:text-navy-30" />
                <McInput
                    v-model="row.label"
                    :maxlength="MAX_PROMPT_LABEL"
                    placeholder="Field label (e.g. Diagnosis)"
                    class="tw:flex-1"
                />
                <select
                    v-model="row.type"
                    class="tw:h-9 tw:w-32 tw:shrink-0 tw:rounded-md tw:border tw:border-input tw:bg-background tw:px-2 tw:text-sm"
                >
                    <option v-for="t in PROMPT_TYPES" :key="t.value" :value="t.value">
                        {{ t.label }}
                    </option>
                </select>
                <label
                    class="tw:flex tw:shrink-0 tw:items-center tw:gap-1.5 tw:text-xs tw:text-navy-70"
                >
                    <input v-model="row.required" type="checkbox" class="tw:accent-primary" />
                    Required
                </label>
                <label
                    class="tw:flex tw:shrink-0 tw:items-center tw:gap-1.5 tw:text-xs tw:text-navy-70"
                    title="Grade this field correct/incorrect during review"
                >
                    <input v-model="row.gradable" type="checkbox" class="tw:accent-primary" />
                    Graded
                </label>
                <input
                    v-if="row.gradable"
                    v-model.number="row.points"
                    type="number"
                    min="0"
                    step="0.5"
                    aria-label="Points if correct"
                    title="Points a correct answer is worth"
                    class="tw:h-9 tw:w-16 tw:shrink-0 tw:rounded-md tw:border tw:border-input tw:bg-background tw:px-2 tw:text-sm"
                />
                <span v-if="row.gradable" class="tw:shrink-0 tw:text-xs tw:text-navy-50">pts</span>
                <button
                    type="button"
                    aria-label="Remove field"
                    class="tw:flex tw:size-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-navy-50 tw:hover:text-danger"
                    @click="removePrompt(i)"
                >
                    <X class="tw:size-4" />
                </button>
            </div>
            <McButton
                type="button"
                variant="outline"
                size="sm"
                class="tw:w-fit"
                :disabled="fieldPrompts.length >= MAX_PROMPTS"
                @click="addPrompt"
            >
                <Plus class="tw:mr-1 tw:size-3.5" />
                {{
                    fieldPrompts.length >= MAX_PROMPTS
                        ? `Up to ${MAX_PROMPTS} fields`
                        : 'Add fill-in field'
                }}
            </McButton>
        </div>
    </form>

    <McDialogFooter>
        <McButton variant="outline" @click="emit('cancel')">Cancel</McButton>
        <McButton :disabled="albumsLoading" @click="handleSave">
            <Shapes class="tw:mr-1 tw:size-4" />
            Create annotation assignment
        </McButton>
    </McDialogFooter>
</template>
