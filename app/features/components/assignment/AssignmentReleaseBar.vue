<script setup lang="ts">
import { Lock, LockOpen, Send } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { assignmentService, type Assignment } from '~/services/assignmentService'

/**
 * The whole release story for an assignment, in one strip above the exercise list.
 *
 * Release is stored per exercise on the server, but an instructor authors "is this assignment
 * out or not", so this is the only place either direction is offered and it always acts on
 * every exercise at once. Nothing else in the UI can produce a half-released assignment.
 */
const props = defineProps<{
    assignment: Assignment
    released: boolean
    /** Gates un-locking: once anyone has answered, pulling the paper back is off the table. */
    submissionCount: number
}>()

const emit = defineEmits<{ reload: [] }>()

const pending = ref<'release' | 'unlock' | null>(null)
const isSaving = ref(false)

const hasExercises = computed(() => props.assignment.exercises.length > 0)

// Un-locking a released assignment hides it from students again. That is recoverable while
// nobody has answered; once a submission exists it would pull the paper out from under work
// that has already been handed in, and the grades reference questions that could then change.
const canUnlock = computed(() => props.released && props.submissionCount === 0)

const handleRelease = async () => {
    isSaving.value = true
    try {
        await assignmentService.releaseAllExercises(props.assignment.id)
        emit('reload')
        pending.value = null
        toast.success('Assignment released')
    } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to release assignment'))
    } finally {
        isSaving.value = false
    }
}

const handleUnlock = async () => {
    isSaving.value = true
    // No bulk un-release endpoint exists, so fan out. allSettled rather than all: a partial
    // result still changed the server, so reload regardless and let the reloaded state (not an
    // optimistic guess) say which exercises actually came back to draft.
    const results = await Promise.allSettled(
        props.assignment.exercises
            .filter((ex) => ex.released)
            .map((ex) => assignmentService.setExerciseReleased(ex.id, false)),
    )
    emit('reload')
    isSaving.value = false
    pending.value = null

    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length === 0) {
        toast.success('Assignment unlocked for editing')
    } else if (failed.length === results.length) {
        toast.error('Failed to unlock the assignment')
    } else {
        toast.error(`Unlocked all but ${failed.length} exercise(s). Try again.`)
    }
}
</script>

<template>
    <div
        class="tw:flex tw:items-center tw:justify-between tw:gap-4 tw:rounded-lg tw:border tw:p-4"
        :class="
            released ? 'tw:border-primary/30 tw:bg-primary/5' : 'tw:border-navy-20 tw:bg-navy-10/20'
        "
    >
        <div class="tw:flex tw:items-start tw:gap-3 tw:min-w-0">
            <component
                :is="released ? Lock : LockOpen"
                class="tw:size-5 tw:shrink-0 tw:mt-0.5"
                :class="released ? 'tw:text-primary' : 'tw:text-navy-50'"
            />
            <div class="tw:min-w-0">
                <p class="tw:text-sm tw:font-semibold tw:text-navy-100">
                    {{ released ? 'Released' : 'Draft' }}
                </p>
                <p class="tw:text-xs tw:text-navy-60 tw:mt-0.5">
                    <template v-if="released">
                        Students can see and answer this assignment. Its exercises and questions are
                        locked.
                    </template>
                    <template v-else-if="!hasExercises">
                        Add at least one exercise before releasing this assignment.
                    </template>
                    <template v-else>
                        Students can't see this assignment yet. Releasing it locks the exercises and
                        questions for good.
                    </template>
                </p>
            </div>
        </div>

        <div class="tw:shrink-0">
            <McButton v-if="!released" :disabled="!hasExercises" @click="pending = 'release'">
                <Send class="tw:size-3.5 tw:mr-1" />
                Release assignment
            </McButton>
            <McButton v-else-if="canUnlock" variant="outline" size="sm" @click="pending = 'unlock'">
                <LockOpen class="tw:size-3.5 tw:mr-1" />
                Unlock for editing
            </McButton>
        </div>

        <McConfirmDialog
            :open="pending === 'release'"
            title="Release this assignment?"
            description="Students will be able to see and answer it. Its exercises and questions can't be edited afterwards."
            confirm-label="Release"
            confirm-variant="default"
            :loading="isSaving"
            @update:open="(v) => !v && (pending = null)"
            @confirm="handleRelease"
        />

        <McConfirmDialog
            :open="pending === 'unlock'"
            title="Unlock this assignment?"
            description="Students will lose access to it until you release it again."
            confirm-label="Unlock"
            :loading="isSaving"
            @update:open="(v) => !v && (pending = null)"
            @confirm="handleUnlock"
        />
    </div>
</template>
