import * as XLSX from 'xlsx'

/**
 * Score export for one assignment (client request 4.1, "export scores as Excel file to Canvas
 * Mango", Slide 22).
 *
 * Pure: rows in, workbook out. No Vue, no DOM, so the shapes below are unit-tested rather than
 * eyeballed in a downloaded file. The component keeps only the click handlers.
 *
 * Two outputs, because they answer different questions:
 *   - buildScoreReport    a readable grading report an instructor keeps or prints
 *   - buildCanvasGradebook  a file shaped for a Canvas gradebook import
 *
 * Canvas's gradebook import takes CSV rather than .xlsx, hence the split. Both are written with
 * SheetJS, already a dependency from the answer-key import.
 */

export interface ScoreRow {
    /** The natural key students are enrolled by (BE-ADR-004). */
    studentId: string
    name: string
    /**
     * Points earned, or null when there is nothing to report: not handed in, or handed in and not
     * yet graded. Null is NOT zero, and the distinction survives into both files - see below.
     */
    score: number | null
    /** The same label the Status column prints, so the file and the screen agree. */
    status: string
    submittedAt: string | null
}

export interface ScoreExportMeta {
    assignmentName: string
    /** Sum of question points, from assignmentTotalPoints - never assignments.points. */
    totalPoints: number
}

/**
 * A missing mark is written as an empty cell, never 0.
 *
 * In a gradebook those mean opposite things: blank is "no mark yet", zero is "sat it and scored
 * nothing". Importing zeros for students who never handed in would mark a whole cohort down.
 */
const cell = (score: number | null): number | string => (score === null ? '' : score)

/** A readable report: one row per student, in the order given. */
export function buildScoreReport(rows: ScoreRow[], meta: ScoreExportMeta): XLSX.WorkBook {
    const sheet = XLSX.utils.aoa_to_sheet([
        ['Student ID', 'Name', 'Score', 'Out of', 'Status', 'Submitted at'],
        ...rows.map((r) => [
            r.studentId,
            r.name,
            cell(r.score),
            meta.totalPoints,
            r.status,
            r.submittedAt ?? '',
        ]),
    ])
    sheet['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 18 }]

    const book = XLSX.utils.book_new()
    // Sheet names cap at 31 chars and reject []:*?/\ - the assignment name is user input, so it
    // cannot be used raw here.
    XLSX.utils.book_append_sheet(book, sheet, 'Scores')
    return book
}

/**
 * Canvas gradebook shape:
 *
 *   Student,SIS User ID,<Assignment Name>
 *       Points Possible,,25
 *   Doe Jane,652000090,18
 *
 * The second row is Canvas's own convention, leading spaces included, and carries the denominator.
 *
 * `student_id` maps to SIS User ID because that is the key students are enrolled by here, and an
 * SIS-backed Canvas matches on it. A Canvas instance keyed on its own internal user IDs would need
 * a different column, and we have no way to know theirs from this side.
 *
 * TODO(4.1): Canvas matches an EXISTING assignment column on the header `Name (id)`, where `id` is
 * Canvas's internal assignment id - which this system has no knowledge of. Without it, an import
 * creates a NEW column rather than filling the existing one. That is usually acceptable, but it is
 * the thing to confirm against their Mango instance before calling 4.1 done. If they can supply the
 * id, it belongs on the assignment row and gets appended to this header.
 */
export function buildCanvasGradebook(rows: ScoreRow[], meta: ScoreExportMeta): XLSX.WorkBook {
    const sheet = XLSX.utils.aoa_to_sheet([
        ['Student', 'SIS User ID', meta.assignmentName],
        ['    Points Possible', '', meta.totalPoints],
        ...rows.map((r) => [r.name, r.studentId, cell(r.score)]),
    ])

    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Gradebook')
    return book
}

export interface ClassGradeRow {
    studentId: string
    name: string
    /**
     * Running totals over GRADED work only, or null when the student has nothing graded yet.
     * Null rather than 0 for the same reason as `score` above.
     */
    earned: number | null
    possible: number | null
}

/**
 * A student's class grade as a percentage, or '' when they have nothing graded yet.
 *
 * Shared by both class exports so the number in the readable report and the number pushed to the
 * gradebook are the same one, computed once.
 */
const classPercent = (r: ClassGradeRow): number | string =>
    r.earned === null || !r.possible ? '' : Math.round((r.earned / r.possible) * 100)

/** A class's running grades: every enrolled student, one row. */
export function buildClassGradeReport(rows: ClassGradeRow[]): XLSX.WorkBook {
    const percent = classPercent

    const sheet = XLSX.utils.aoa_to_sheet([
        ['Student ID', 'Name', 'Earned', 'Possible', 'Percent'],
        ...rows.map((r) => [r.studentId, r.name, cell(r.earned), cell(r.possible), percent(r)]),
    ])
    sheet['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 9 }, { wch: 9 }, { wch: 9 }]

    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Grades')
    return book
}

/**
 * A class's running grades in Canvas gradebook shape.
 *
 * THE MARK IS A PERCENTAGE, out of 100 - not raw points, and not by accident. `possible` is
 * per-student here, since it sums whatever that student has had graded so far, while a Canvas
 * column carries one Points Possible for everyone. Normalizing to a percentage is what makes a
 * class total expressible as a column at all.
 *
 * So this is the right export for pushing an overall lab mark into the gradebook, and the WRONG
 * one for per-assignment marks: use buildCanvasGradebook from the Submissions tab for those, where
 * the denominator really is shared and the raw points survive.
 *
 * The same TODO(4.1) applies as on buildCanvasGradebook: without Canvas's internal assignment id
 * in the header, an import creates a new column rather than filling an existing one.
 */
export function buildClassGradeCanvas(
    rows: ClassGradeRow[],
    meta: { className: string },
): XLSX.WorkBook {
    const sheet = XLSX.utils.aoa_to_sheet([
        ['Student', 'SIS User ID', `${meta.className} (overall %)`],
        ['    Points Possible', '', 100],
        ...rows.map((r) => [r.name, r.studentId, classPercent(r)]),
    ])

    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Gradebook')
    return book
}

/**
 * A filename derived from the assignment, so several exports don't overwrite each other in the
 * downloads folder. Deterministic (no timestamp) so it stays testable and a re-export replaces the
 * previous file rather than piling up.
 */
export function exportFilename(
    name: string,
    extension: 'xlsx' | 'csv',
    kind: 'scores' | 'grades' = 'scores',
): string {
    // Only filesystem-unsafe characters are stripped, not everything non-ASCII. Assignment names
    // here are frequently Thai, and an [^a-z0-9] slug reduced "ปฏิบัติการ 3" to "3" - a filename
    // that tells the instructor nothing. Browsers and every current OS handle Unicode filenames.
    //
    // Spaces are deliberately absent from the class below: they become separators on the next
    // line rather than being deleted. The control-character range is kept even though a text
    // input cannot realistically produce one: this value becomes a filename, so the guard is
    // cheap insurance rather than a hypothetical.
    // eslint-disable-next-line no-control-regex
    const unsafe = /[/\\:*?"<>|\u0000-\u001f]/g

    const slug =
        name
            .toLowerCase()
            .replace(unsafe, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60)
            .replace(/-+$/, '') || 'assignment'

    return `${slug}-${kind}.${extension}`
}
