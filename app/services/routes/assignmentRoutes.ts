export const assignmentRoutes = {
    list: '/assignments',
    byId: (id: number) => `/assignments/${id}`,
    exercises: (assignmentId: number) => `/assignments/${assignmentId}/exercises`,
    reorderExercises: (assignmentId: number) => `/assignments/${assignmentId}/exercises/reorder`,
    exerciseById: (exerciseId: number) => `/exercises/${exerciseId}`,
    questions: (exerciseId: number) => `/exercises/${exerciseId}/questions`,
    reorderQuestions: (exerciseId: number) => `/exercises/${exerciseId}/questions/reorder`,
    questionById: (questionId: number) => `/questions/${questionId}`,
}
