import type { Ref } from 'vue'
import {
    submissionService,
    type GradingAnswer,
    type SubmissionDetail,
} from '~/services/submissionService'
import { assignmentService, assignmentTotalPoints } from '~/services/assignmentService'
import { imageService } from '~/services/imageService'
import { isForbidden } from '~/core/helpers/error'

export interface AnswerGroup {
    sectionId: number
    sectionIndex: number
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
    const sectionTitles = ref<Record<number, string>>({})
    const totalPoints = ref(0)
    const imageUrls = reactive<Record<number, string>>({})
    /** Why a photo is missing, keyed by question, so the card can say so instead of showing a gap. */
    const imageErrors = reactive<Record<number, string>>({})

    const revokeImageUrls = () => {
        for (const url of Object.values(imageUrls)) URL.revokeObjectURL(url)
        for (const key of Object.keys(imageUrls)) delete imageUrls[Number(key)]
        for (const key of Object.keys(imageErrors)) delete imageErrors[Number(key)]
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
                    sectionTitles.value = Object.fromEntries(
                        assignment.sections.map((section) => [section.id, section.title]),
                    )
                    totalPoints.value = assignmentTotalPoints(assignment)
                })
                .catch(() => {})

            for (const answer of detail.answers) {
                // Both image_detection and exam slide_identification attach a photo. Keyed off
                // `image_id`, NOT off the detection: the server nulls `detection` for any read
                // that is not `graded`, and lifts the photo's name clear of that strip precisely
                // so an ungraded or returned answer still shows the slide the student
                // photographed (BE-ADR-027). Keying off `detection` here is what made a returned
                // exam show no photo at all.
                const hasPhoto =
                    answer.question.type === 'image_detection' ||
                    answer.question.type === 'slide_identification'
                if (hasPhoto && answer.image_id) {
                    // Each photo fails on its OWN. This loop used to sit bare inside the outer
                    // try, so a single image that would not load set loadFailed and blanked the
                    // whole page - one answer's picture taking the grade, the comments and every
                    // other answer with it. That was survivable while a missing file was the only
                    // realistic failure; since v0.7 an image is addressed by an integer id and the
                    // route checks authentication only, so a 403 is live (BE-ADR-031) and this
                    // stopped being a rare case.
                    try {
                        imageUrls[answer.question_id] = await imageService.blobUrl(answer.image_id)
                    } catch (err) {
                        imageErrors[answer.question_id] = isForbidden(err)
                            ? 'You do not have access to this image'
                            : 'This image could not be loaded'
                    }
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
     * (1.1, 1.2, …) to match the authoring view (AssignmentSections.vue).
     */
    const answerGroups = computed<AnswerGroup[]>(() => {
        if (!submission.value) return []
        const order: number[] = []
        const bySection = new Map<number, GradingAnswer[]>()
        for (const answer of submission.value.answers) {
            const sectionId = answer.question.assignment_section_id
            if (!bySection.has(sectionId)) {
                bySection.set(sectionId, [])
                order.push(sectionId)
            }
            bySection.get(sectionId)!.push(answer)
        }
        return order.map((sectionId, sectionIndex) => ({
            sectionId,
            sectionIndex,
            items: [...bySection.get(sectionId)!]
                .sort((a, b) => a.question.position - b.question.position)
                .map((answer, qIndex) => ({ answer, qIndex })),
        }))
    })

    return {
        submission,
        isLoading,
        loadFailed,
        answerGroups,
        sectionTitles,
        imageUrls,
        imageErrors,
        totalPoints,
        load,
    }
}
