/**
 * The annotation-label palette (BE-ADR-038).
 *
 * A label used to be free text on the box itself. It is now a row: reusable, coloured, and PER-USER.
 * `UNIQUE(owner_id, label)` means the text is a key within one person's palette, which is what lets
 * the client recover a label's id from the text a box comes back with - the annotation read resolves
 * `label` and `color` but does not carry `label_id`.
 *
 * Per-user, not shared: two staff may each hold "clue cells" in different colours, and neither can
 * see or edit the other's. Every route here is scoped to the caller's token, never to a query param,
 * so there is nothing to pass and nothing to get wrong.
 *
 * Staff-only, like the annotations they name.
 */
export const annotationLabelRoutes = {
    list: '/annotation-labels',
    create: '/annotation-labels',
    byId: (id: number) => `/annotation-labels/${id}`,
}
