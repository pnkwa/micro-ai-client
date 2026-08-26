export const assignmentRoutes = {
    list: '/assignments',
    byId: (id: number) => `/assignments/${id}`,
    attachments: (assignmentId: number) => `/assignments/${assignmentId}/attachments`,
    attachmentById: (assignmentId: number, attachmentId: number) =>
        `/assignments/${assignmentId}/attachments/${attachmentId}`,
    // Sections, not exercises, since the v0.7 consolidation (BE-ADR-033). The name is deliberately
    // NOT uniform across layers: the table is `assignment_sections`, the FK on a question is
    // `assignment_section_id`, and the route and payload key are the unqualified `sections`. A bare
    // table called `sections` would not say what it sections, and nested under an assignment on the
    // wire the qualifier is redundant. Build against that, do not regularise it.
    sections: (assignmentId: number) => `/assignments/${assignmentId}/sections`,
    reorderSections: (assignmentId: number) => `/assignments/${assignmentId}/sections/reorder`,
    releaseAllSections: (assignmentId: number) =>
        `/assignments/${assignmentId}/sections/release-all`,
    sectionById: (sectionId: number) => `/sections/${sectionId}`,
    sectionRelease: (sectionId: number) => `/sections/${sectionId}/release`,
    questions: (sectionId: number) => `/sections/${sectionId}/questions`,
    reorderQuestions: (sectionId: number) => `/sections/${sectionId}/questions/reorder`,
    questionById: (questionId: number) => `/questions/${questionId}`,
}
