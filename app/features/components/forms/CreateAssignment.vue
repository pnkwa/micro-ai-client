<script setup lang="ts">
import { Link, X, ChevronDown, ChevronRight } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { useForm, useFieldArray } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import {
    createAssignmentFormSchema,
    type CreateAssignmentFormData,
} from '~/features/types/forms/assignment'

const props = defineProps<{
    // The form is always opened from a class page; every new assignment belongs to this class
    // and starts active, so neither is shown as a field.
    defaultClassId: number
}>()

const emit = defineEmits<{
    save: [values: CreateAssignmentFormData]
    cancel: []
}>()

const { $dayjs } = useNuxtApp()

const { handleSubmit, errors } = useForm<CreateAssignmentFormData>({
    validationSchema: toTypedSchema(createAssignmentFormSchema),
    initialValues: {
        name: '',
        dueDate: '',
        classId: props.defaultClassId,
        status: 'active',
        description: '',
        instructions: '',
        opensAt: '',
        closesAt: '',
        /**
         * The first section, created WITH the assignment and NOT shown on this form.
         *
         * Questions live inside a section, so a new assignment with none is a dead end that every
         * instructor has to clear before doing anything: create, then immediately click "Add
         * section", a step with no decision in it. This makes the section come with the
         * assignment, in the same request, since the server takes the tree inline.
         *
         * It is a form value rather than a literal in the service so the default has one home, and
         * so a future "advanced" path could expose or clear it without moving the behaviour. The
         * name is a placeholder by design: it is renamed in place on the assignment page, which is
         * where an instructor can see what they are naming.
         */
        firstSectionTitle: 'Section 1',
        attachments: [],
    },
})

/**
 * Advanced holds the submission WINDOW; the plain form asks only when the work is due.
 *
 * Those are different questions, and most assignments only have the second. A due date says when
 * work is expected; opens/closes say when the door is open, and the gap between the due date and
 * the close is a grace period in which a submission still lands and is marked late (BE-ADR-033).
 * Put all three on screen by default and every instructor has to think about a gate that most of
 * them do not want.
 *
 * Collapsed by default and NOT sticky: an assignment that needs a window is the exception, so the
 * exception is what costs a click.
 */
const showAdvanced = ref(false)

const {
    fields: attachmentFields,
    push: addAttachment,
    remove: removeAttachment,
} = useFieldArray<{ path: string; filename?: string }>('attachments')

const attachmentError = (index: number, field: 'path' | 'filename' = 'path') =>
    (errors.value as Record<string, string>)[`attachments[${index}].${field}`]

const handleSave = handleSubmit((values) => {
    // Only checked when they are set, because both are optional and the ordinary case has neither.
    // The server rejects opens-after-closes too; catching it here names the field rather than
    // surfacing a 400 after the whole form round-trips.
    const opens = values.opensAt ? $dayjs(values.opensAt) : null
    const closes = values.closesAt ? $dayjs(values.closesAt) : null
    const due = values.dueDate ? $dayjs(values.dueDate) : null

    // The calendar greys out earlier DAYS; a time earlier today is still reachable, and so is a
    // date that went stale while the dialog sat open. Checked against the moment of saving, which
    // is the only instant that matters.
    const now = $dayjs()
    if (due?.isBefore(now)) return toast.error('The due date is in the past')
    if (opens?.isBefore(now)) return toast.error('The opening time is in the past')
    if (closes?.isBefore(now)) return toast.error('The closing time is in the past')

    if (opens && closes && !opens.isBefore(closes)) {
        return toast.error('The assignment must open before it closes')
    }
    if (opens && due?.isBefore(opens)) {
        return toast.error('The due date is before the assignment opens')
    }
    // Deliberately NOT an error the other way round: due before close IS the grace period.
    if (closes && due?.isAfter(closes)) {
        return toast.error('The due date is after the assignment closes')
    }

    emit('save', values)
})

const handleCancel = () => {
    emit('cancel')
}
</script>

<template>
    <McDialogHeader>
        <McDialogTitle>Create New Assignment</McDialogTitle>
    </McDialogHeader>
    <form
        class="tw:flex tw:flex-col tw:gap-4 tw:p-2 tw:max-h-[60vh] tw:overflow-y-auto"
        @submit.prevent="handleSave"
    >
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">
                Assignment Name
                <span class="tw:text-red-500">*</span>
            </label>
            <McInput name="name" placeholder="e.g., Mitosis Analysis" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Description</label>
            <McTextarea name="description" placeholder="Describe the assignment..." />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Instructions</label>
            <McTextarea
                name="instructions"
                auto-list
                class="tw:min-h-32 tw:text-sm tw:leading-relaxed"
                placeholder="1. Step one&#10;2. Step two&#10;3. Step three"
            />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Due Date</label>
            <McDatePicker name="dueDate" with-time disable-past placeholder="Select date & time" />
            <p v-if="showAdvanced" class="tw:text-xs tw:text-navy-50">
                When the work is expected. On its own it does not stop anyone submitting; it is what
                "late" is measured against.
            </p>
        </div>

        <!--
            Advanced: the submission WINDOW, which is a different question from the due date and one
            most assignments do not have an answer to. Collapsed by default so the exception costs
            the click, not the ordinary case.
        -->
        <div class="tw:flex tw:flex-col tw:gap-2">
            <button
                type="button"
                class="tw:flex tw:w-fit tw:cursor-pointer tw:items-center tw:gap-1 tw:text-sm tw:font-medium tw:text-navy-60 tw:transition-colors tw:hover:text-primary"
                :aria-expanded="showAdvanced"
                @click="showAdvanced = !showAdvanced"
            >
                <component :is="showAdvanced ? ChevronDown : ChevronRight" class="tw:size-4" />
                Advanced
            </button>

            <template v-if="showAdvanced">
                <p class="tw:text-xs tw:text-navy-60">
                    Limit when students can submit. Leave both blank and they can hand in at any
                    time, late after the due date.
                </p>
                <div class="tw:flex tw:flex-col tw:gap-3 tw:sm:flex-row">
                    <div class="tw:flex tw:flex-1 tw:flex-col tw:gap-2">
                        <label class="tw:text-sm tw:font-medium">Opens</label>
                        <McDatePicker name="opensAt" with-time placeholder="No start restriction" />
                    </div>
                    <div class="tw:flex tw:flex-1 tw:flex-col tw:gap-2">
                        <label class="tw:text-sm tw:font-medium">Closes</label>
                        <McDatePicker
                            name="closesAt"
                            with-time
                            disable-past
                            placeholder="No cut-off"
                        />
                    </div>
                </div>
                <p class="tw:text-xs tw:text-navy-50">
                    A gap between the due date and Closes is a grace period: work handed in there
                    still lands, and is marked late.
                </p>
            </template>
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
            <label class="tw:text-sm tw:font-medium">Attachments</label>
            <!-- The naming rule lives here, once, rather than inside a placeholder on every row.
                 A placeholder that carries the only explanation disappears the moment someone
                 types, which is exactly when they were still reading it. -->
            <p class="tw:text-xs tw:text-navy-60">
                Paste links to reference material (PDF, slides, video…). Name each one to say what
                it is; leave the name blank and it is taken from the link.
            </p>
            <div v-if="attachmentFields.length > 0" class="tw:flex tw:flex-col tw:gap-2">
                <div
                    v-for="(field, index) in attachmentFields"
                    :key="field.key"
                    class="tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row tw:sm:items-start"
                >
                    <div class="tw:flex tw:flex-col tw:gap-1 tw:sm:w-52">
                        <McInput
                            :name="`attachments[${index}].filename`"
                            placeholder="Name (optional)"
                        />
                        <span
                            v-if="attachmentError(index, 'filename')"
                            class="tw:text-xs tw:text-red-500"
                        >
                            {{ attachmentError(index, 'filename') }}
                        </span>
                    </div>

                    <div class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
                        <McInput
                            :name="`attachments[${index}].path`"
                            icon-prepend="Link"
                            placeholder="https://example.com/lab-guide.pdf"
                        />
                        <span v-if="attachmentError(index)" class="tw:text-xs tw:text-red-500">
                            {{ attachmentError(index) }}
                        </span>
                    </div>

                    <button
                        type="button"
                        aria-label="Remove attachment"
                        class="tw:flex tw:size-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:border tw:border-input tw:text-navy-60 tw:transition-colors tw:cursor-pointer tw:hover:border-danger tw:hover:text-danger tw:self-end tw:sm:self-start"
                        @click="removeAttachment(index)"
                    >
                        <X class="tw:size-4" />
                    </button>
                </div>
            </div>
            <McButton
                type="button"
                variant="outline"
                @click="addAttachment({ path: '', filename: '' })"
            >
                <Link class="tw:w-4 tw:h-4 tw:mr-1" />
                Add link
            </McButton>
        </div>
    </form>
    <McDialogFooter>
        <McButton variant="outline" @click="handleCancel">Cancel</McButton>
        <McButton @click="handleSave">Create Assignment</McButton>
    </McDialogFooter>
</template>
