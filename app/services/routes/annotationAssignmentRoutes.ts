// Routes for the annotation-assignment surface (BE-ADR-039), a facade over /assignments plus the
// student-submit / instructor-review endpoints. Same base path for both controllers on the server.
const base = '/annotation-assignments'

export const annotationAssignmentRoutes = {
    list: base,
    byId: (id: number) => `${base}/${id}`,
    submissions: (id: number) => `${base}/${id}/submissions`,
    mySubmission: (id: number) => `${base}/${id}/my-submission`,
    submissionById: (submissionId: number) => `${base}/submissions/${submissionId}`,
    reviewField: (submissionId: number, imageId: number) =>
        `${base}/submissions/${submissionId}/fields/${imageId}`,
    finalize: (submissionId: number) => `${base}/submissions/${submissionId}/finalize`,
    reject: (submissionId: number) => `${base}/submissions/${submissionId}/reject`,
}
