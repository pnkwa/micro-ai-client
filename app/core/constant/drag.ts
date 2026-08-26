/**
 * Drag-and-drop payload types.
 *
 * A private MIME type rather than `text/plain`, so dropping one of our draggables on a text field,
 * another tab, or another application does nothing at all instead of pasting a bare row id.
 * `text/plain` is always set ALONGSIDE this one, never instead of it, because Firefox refuses to
 * start a drag that carries no standard type.
 */
export const IMAGE_DRAG_TYPE = 'application/x-microai-image'
