import { detectionService } from '~/services/detectionService'

/**
 * The diagnosis vocabulary a human reads, answers and authors answer keys in (BE-ADR-018).
 *
 * Sourced from `displayText` on the model manifest via GET /models, never a hardcoded list: those
 * codes live in the server's model-manifest.ts and are mirrored in the worker's manifest.py, so a
 * third copy here is the one that drifts.
 *
 * NOT `elements`. That is the morphology a detection box surrounds ("Clue cell"), which is
 * deliberately what a student is shown INSTEAD of a diagnosis on the detection surfaces
 * (ML-ADR-001). Mixing the two is how the answer-key importer ended up flagging valid keys.
 *
 * Shared by the student's answer picker (3.1) and the importer's answer validation (2.1) so the
 * options a student can pick and the answers an instructor may author are the same set.
 */

export interface DiagnosisOption {
    /** Canonical class code, e.g. "BV". What grading resolves everything to. */
    code: string
    /** Human diagnosis name, e.g. "Bacterial vaginosis". What the student sees and submits. */
    label: string
}

/**
 * Only `detect` models contribute.
 *
 * A slide identification is a diagnosis, and the diagnosis classes are what the detectors are
 * trained on. The segmenter's displayText is a single element ("Fungal element") and the legacy
 * classifier's is empty, so including them would put a non-diagnosis in a list of diagnoses.
 *
 * This is a heuristic on `task`, not a declared "these are diagnoses" flag. If a future
 * classify-task model carries real diagnoses it will be missed here, and the manifest should grow
 * an explicit marker rather than this filter growing cases.
 */
export async function fetchDiagnosisOptions(): Promise<DiagnosisOption[]> {
    const models = await detectionService.listModels()
    const byCode = new Map<string, string>()

    for (const model of models) {
        if (model.task !== 'detect') continue
        for (const [code, label] of Object.entries(model.displayText ?? {})) {
            // displayText is unique per code and shared across the detectors, so first write wins
            // and a second detector naming the same class cannot introduce a rival label.
            if (!byCode.has(code)) byCode.set(code, label)
        }
    }

    return [...byCode].map(([code, label]) => ({ code, label }))
}

/**
 * Every term grading will recognise, lowercased: each code and each diagnosis name.
 *
 * Mirrors canonicalizeClass() server-side, which indexes the same map, so a caller checking
 * membership here predicts exactly what the grader will accept.
 */
export function vocabularyTerms(options: DiagnosisOption[]): Set<string> {
    const terms = new Set<string>()
    for (const { code, label } of options) {
        terms.add(code.trim().toLowerCase())
        terms.add(label.trim().toLowerCase())
    }
    return terms
}
