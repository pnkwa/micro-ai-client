import type { Ref } from 'vue'
import {
    submissionService,
    type GradingAnswer,
    type SubmissionDetail,
} from '~/services/submissionService'
import { assignmentService, assignmentTotalPoints } from '~/services/assignmentService'
import { detectionService } from '~/services/detectionService'

export interface AnswerGroup {
    exerciseId: number
    exIndex: number
    items: { answer: GradingAnswer; qIndex: number }[]
}

/**
 * Loads one submission and everything both views of it need: the grouped answers, the
 * exercise titles the API does not include, the blob URLs for submitted images, and the
 * assignment total.
 *
 * Shared because the instructor's grading page and the student's feedback page are the
 * same read with different affordances; only the marking state differs, and that stays
 * in the grading page.
 */
export function useSubmissionDetail(submissionId: Ref<number>, assignmentId: Ref<number>) {
    const submission = ref<SubmissionDetail | null>(null)
    const isLoading = ref(false)
    const loadFailed = ref(false)
    const exerciseTitles = ref<Record<number, string>>({})
    const totalPoints = ref(0)
    const imageUrls = reactive<Record<number, string>>({})

    const revokeImageUrls = () => {
        for (const url of Object.values(imageUrls)) URL.revokeObjectURL(url)
        for (const key of Object.keys(imageUrls)) delete imageUrls[Number(key)]
    }

    const load = async (onLoaded?: (detail: SubmissionDetail) => void) => {
        isLoading.value = true
        loadFailed.value = false
        revokeImageUrls()
        try {
            const detail = await submissionService.getById(submissionId.value)
            submission.value = detail

            // Best-effort: titles and the points total are display niceties, not worth
            // failing the whole page over. Headings fall back to "Exercise N".
            assignmentService
                .getById(assignmentId.value)
                .then((assignment) => {
                    exerciseTitles.value = Object.fromEntries(
                        assignment.exercises.map((ex) => [ex.id, ex.title]),
                    )
                    totalPoints.value = assignmentTotalPoints(assignment)
                })
                .catch(() => {})

            for (const answer of detail.answers) {
                if (answer.question.type === 'image_detection' && answer.detection) {
                    imageUrls[answer.question_id] = await detectionService.imageBlobUrl(
                        answer.detection.id,
                    )
                }
            }
            onLoaded?.(detail)
        } catch {
            loadFailed.value = true
        } finally {
            isLoading.value = false
        }
    }

    onBeforeUnmount(revokeImageUrls)

    /**
     * Answers grouped by exercise in first-appearance order, numbered "exercise.question"
     * (1.1, 1.2, …) to match the authoring view (AssignmentExercises.vue).
     */
    const answerGroups = computed<AnswerGroup[]>(() => {
        if (!submission.value) return []
        const order: number[] = []
        const byExercise = new Map<number, GradingAnswer[]>()
        for (const answer of submission.value.answers) {
            const exerciseId = answer.question.exercise_id
            if (!byExercise.has(exerciseId)) {
                byExercise.set(exerciseId, [])
                order.push(exerciseId)
            }
            byExercise.get(exerciseId)!.push(answer)
        }
        return order.map((exerciseId, exIndex) => ({
            exerciseId,
            exIndex,
            items: [...byExercise.get(exerciseId)!]
                .sort((a, b) => a.question.position - b.question.position)
                .map((answer, qIndex) => ({ answer, qIndex })),
        }))
    })

    return {
        submission,
        isLoading,
        loadFailed,
        answerGroups,
        exerciseTitles,
        imageUrls,
        totalPoints,
        load,
    }
}
