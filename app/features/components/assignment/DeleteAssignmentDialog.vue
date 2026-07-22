<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { assignmentService, type Assignment } from '~/services/assignmentService'

/**
 * Deleting an assignment is the most destructive thing an instructor can do here: it takes
 * the exercises, the questions, and (with force) every student's submitted work and grades
 * with it, and nothing restores any of it.
 *
 * So the dialog spells out the actual counts rather than saying "this cannot be undone" and
 * leaving them to guess, and gates the button behind typing a word. The typing isn't
 * security, it's a speed bump: it stops the muscle-memory Enter that follows a mis-click.
 */
const props = defineProps<{
    open: boolean
    assignment: Assignment
    /** From the page's already-loaded list, so the warning can name a real number. */
    submissionCount: number
}>()

const emit = defineEmits<{ 'update:open': [value: boolean]; deleted: [] }>()

const CONFIRM_WORD = 'confirm'

const typed = ref('')
const isDeleting = ref(false)
// Set when the API rejects the delete because submissions exist that we didn't know about
// (someone submitted while this page sat open). Holds the count the server reported, or 0
// when we couldn't read one, and turns the next press into an informed force-delete.
const conflictCount = ref<number | null>(null)

/**
 * The 409 body is written for whoever is calling the API: it names the assignment by id and
 * tells them to "re-send with ?force=true". None of that means anything to an instructor
 * looking at a dialog, so take the one fact worth keeping (the count) and say the rest in
 * our own words. Returns 0 if the wording ever changes out from under this.
 */
const submissionCountFromError = (message: string): number => {
    const match = message.match(/has (\d+) submission/)
    return match?.[1] ? Number(match[1]) : 0
}

const exerciseCount = computed(() => props.assignment.exercises.length)
const questionCount = computed(() =>
    props.assignment.exercises.reduce((sum, ex) => sum + ex.questions.length, 0),
)

// The count we warn about: whatever the page loaded, unless the server has since told us
// otherwise, in which case its answer wins.
const knownSubmissions = computed(() => conflictCount.value ?? props.submissionCount)
const destroysWork = computed(() => knownSubmissions.value > 0 || conflictCount.value !== null)

const canDelete = computed(() => typed.value.trim() === CONFIRM_WORD && !isDeleting.value)

// Reset every time it opens: a dialog that reopens still holding a valid confirmation word
// would let a second, unintended delete through on one click.
watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            typed.value = ''
            conflictCount.value = null
        }
    },
)

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const onDelete = async () => {
    if (!canDelete.value) return
    isDeleting.value = true
    try {
        // Only force once we've actually told them work will be destroyed, either from the
        // page's own count or from a conflict we've now surfaced.
        await assignmentService.remove(props.assignment.id, destroysWork.value)
        emit('deleted')
    } catch (err) {
        const status = (err as { statusCode?: number; response?: { status?: number } })?.response
            ?.status
        if (status === 409) {
            // Stale count. Surface it and make them press again, now knowing.
            conflictCount.value = submissionCountFromError(apiErrorMessage(err, ''))
            typed.value = ''
        } else {
            toast.error(apiErrorMessage(err, 'Failed to delete assignment'))
        }
    } finally {
        isDeleting.value = false
    }
}
</script>

<template>
    <McDialog :open="open" @update:open="emit('update:open', $event)">
        <McDialogContent class="tw:sm:max-w-lg">
            <McDialogHeader>
                <McDialogTitle>Delete “{{ assignment.name }}”?</McDialogTitle>
                <McDialogDescription>
                    This permanently deletes the assignment and everything in it. It cannot be
                    undone.
                </McDialogDescription>
            </McDialogHeader>

            <div class="tw:flex tw:flex-col tw:gap-4">
                <div
                    class="tw:flex tw:gap-3 tw:rounded-lg tw:border tw:p-3"
                    :class="
                        destroysWork
                            ? 'tw:border-destructive/30 tw:bg-destructive/5'
                            : 'tw:border-navy-20 tw:bg-navy-10/20'
                    "
                >
                    <TriangleAlert
                        class="tw:size-5 tw:shrink-0 tw:mt-0.5"
                        :class="destroysWork ? 'tw:text-destructive' : 'tw:text-navy-50'"
                    />
                    <div class="tw:min-w-0 tw:text-sm tw:text-navy-80">
                        <p>
                            {{ plural(exerciseCount, 'exercise') }} and
                            {{ plural(questionCount, 'question') }} will be deleted.
                        </p>
                        <!-- Explains why the warning just appeared, so a second press feels
                             like a decision rather than the same click not working. -->
                        <p
                            v-if="conflictCount !== null"
                            class="tw:mt-1 tw:font-semibold tw:text-destructive"
                        >
                            Someone submitted while this page was open. Nothing has been deleted.
                        </p>
                        <p
                            v-if="knownSubmissions > 0"
                            class="tw:mt-1 tw:font-semibold tw:text-destructive"
                        >
                            {{ plural(knownSubmissions, 'student submission') }} and every grade and
                            piece of feedback on them will be deleted too. Students lose their work.
                        </p>
                        <p
                            v-else-if="conflictCount !== null"
                            class="tw:mt-1 tw:font-semibold tw:text-destructive"
                        >
                            Submitted work will be deleted too. Students lose their work.
                        </p>
                    </div>
                </div>

                <label class="tw:flex tw:flex-col tw:gap-1.5">
                    <span class="tw:text-sm tw:text-navy-80">
                        Type
                        <span class="tw:font-semibold tw:text-navy-100">{{ CONFIRM_WORD }}</span>
                        to continue.
                    </span>
                    <input
                        v-model="typed"
                        type="text"
                        autocomplete="off"
                        spellcheck="false"
                        :aria-label="`Type ${CONFIRM_WORD} to confirm deletion`"
                        :placeholder="CONFIRM_WORD"
                        class="tw:w-full tw:rounded-md tw:border tw:border-navy-20 tw:bg-white tw:px-3 tw:py-2 tw:text-base tw:outline-none tw:focus:border-primary"
                        @keyup.enter="onDelete"
                    />
                </label>
            </div>

            <McDialogFooter>
                <McButton variant="outline" type="button" @click="emit('update:open', false)">
                    Cancel
                </McButton>
                <McButton
                    variant="destructive"
                    type="button"
                    :disabled="!canDelete"
                    :loading="isDeleting"
                    @click="onDelete"
                >
                    {{ conflictCount === null ? 'Delete assignment' : 'Delete anyway' }}
                </McButton>
            </McDialogFooter>
        </McDialogContent>
    </McDialog>
</template>
