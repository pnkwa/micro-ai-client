/**
 * How a model's name is rendered, and how a finished run is attributed.
 *
 * The manifest (`GET /models`, FE-ADR-007) separates the architecture from what it does with an em
 * dash — "RT-DETR-L — 5-class detector". Rendering is the client's business, so the split happens
 * here rather than being asked of another repo's payload.
 *
 * Pure, and kept out of the page for that reason: this is the one part of the label that is worth
 * testing, and a page component is where testable things go to hide.
 */

/**
 * Split a manifest display name into the model and what it does.
 *
 * Only the separator is touched. A name carrying its own dashes ("RT-DETR-L") keeps them, which is
 * why this cannot be a blanket replace of every dash, and everything after the FIRST separator stays
 * together so a two-part descriptor does not lose its tail.
 */
export function modelParts(displayName: string): [name: string, descriptor?: string] {
    const [name = displayName, ...rest] = displayName.split(/\s+—\s+/)
    return [name, rest.join(' — ') || undefined]
}

/**
 * "RT-DETR-L (5-class detector)".
 *
 * Brackets rather than a middle dot: the two halves are not peers. The name is what you are choosing
 * between; the rest tells you what it does. A dot read as one long label in two equal parts.
 */
export function modelLabel(displayName: string): string {
    const [name, descriptor] = modelParts(displayName)
    return descriptor ? `${name} (${descriptor})` : name
}

/**
 * What produced the result on screen — "RT-DETR-L (5-class detector + segmentation)".
 *
 * `displayName` is undefined when the manifest no longer lists the model, which a record loaded out
 * of history can easily cite; the raw id is then the honest answer, since it still attributes the
 * result correctly where a blank would not.
 *
 * A chained segmentation pass goes INSIDE the brackets with the descriptor: what ran is one
 * description of one run, and hanging it outside read as a third thing after the name and the
 * parenthetical.
 */
export function resultModelLabel(
    displayName: string | undefined,
    rawModelName: string,
    segmented: boolean,
): string {
    if (!rawModelName) return ''
    if (!displayName) return segmented ? `${rawModelName} + segmentation` : rawModelName

    const [name, descriptor] = modelParts(displayName)
    const ran = [descriptor, segmented ? 'segmentation' : null].filter(Boolean).join(' + ')
    return ran ? `${name} (${ran})` : name
}
