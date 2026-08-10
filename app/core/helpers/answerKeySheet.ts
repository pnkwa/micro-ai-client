/**
 * Answer-key spreadsheet parsing (client request 2.1, "รองรับไฟล์ answer key ในรูปแบบ Excel file").
 *
 * Pure: bytes in, rows and errors out. No Vue, no network, no DOM, so it is unit-testable, which
 * the dialog that used to hold this logic was not. ImportAnswerKeyXlsx.vue keeps only UI state.
 *
 * The workbook is parsed in the BROWSER and only validated rows are posted as JSON
 * (BE-ADR-006: "CSV/Excel parsing is the client's job"; BE-ADR-007: no multipart handlers).
 *
 * The client agreed we define the format and give them a template, so the headers below are the
 * contract rather than a guess. Matching is still forgiving about case, spacing and a few obvious
 * synonyms, because an instructor retyping a heading by hand shouldn't lose an import.
 */
import * as XLSX from 'xlsx'
import { isValidSlideNumber, normalizeSlideNumber } from './slideNumber'

export interface AnswerKeyRow {
    slide_number: string
    accepted_answers: string[]
    notes?: string
}

export interface AnswerKeyRowError {
    /** Excel's own 1-based row number, so an error points at what the instructor sees. */
    row: number
    column: string
    value: string
    message: string
}

export interface AnswerKeyParseResult {
    rows: AnswerKeyRow[]
    errors: AnswerKeyRowError[]
}

/** Canonical template columns, plus the synonyms still recognised. `notes` is optional. */
export const COLUMN_ALIASES: Record<'slide' | 'answer' | 'notes', string[]> = {
    slide: ['slide', 'slide_id', 'slide_no', 'slide_number', 'slideid', 'รหัสสไลด์', 'สไลด์'],
    answer: ['answer', 'answers', 'diagnosis', 'result', 'คำตอบ', 'ผล'],
    notes: ['notes', 'note', 'remark', 'remarks', 'comment', 'หมายเหตุ'],
}

/**
 * Several accepted phrasings in one cell: newline (Alt+Enter) or a pipe, matching the
 * one-phrasing-per-line textarea in SlideForm.vue, so both authoring paths agree.
 */
const ANSWER_SEPARATOR = /[\n|]/

/** How far down to look for the header row before giving up. */
const HEADER_SEARCH_LIMIT = 20

/** Header cells reduce to a comparable key: trimmed, lowercased, spaces to underscores. */
export const headerKey = (raw: unknown): string =>
    String(raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')

const columnFor = (key: string): keyof typeof COLUMN_ALIASES | null => {
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (aliases.includes(key)) return field as keyof typeof COLUMN_ALIASES
    }
    return null
}

/**
 * Find the header row rather than assuming row 1, because a real sheet often carries a title, a logo or
 * a blank row above the table. The header is the first row carrying a recognised `slide` column.
 */
const findHeaderRow = (rows: unknown[][]): number => {
    const limit = Math.min(rows.length, HEADER_SEARCH_LIMIT)
    for (let i = 0; i < limit; i++) {
        const keys = (rows[i] ?? []).map(headerKey)
        if (keys.some((k) => COLUMN_ALIASES.slide.includes(k))) return i
    }
    return -1
}

/** Sheet names in a workbook, in file order. */
export function sheetNamesOf(book: XLSX.WorkBook): string[] {
    return [...book.SheetNames]
}

/**
 * Read a file's bytes into a workbook.
 *
 * Parsed from BYTES, so a .csv renamed to .xlsx is read as the CSV it actually is.
 *
 * SheetJS is lenient and does NOT reliably throw on junk input; it will happily parse arbitrary
 * bytes into a nonsense sheet (proven in answerKeySheet.spec.ts). So callers must not treat "did
 * not throw" as "valid file": the real guard is parseAnswerKeySheet's header check, which reports
 * a missing `slide` column and gives the instructor something actionable.
 *
 * `cellFormula: false` keeps formula text out of the result, since we only ever want a cached value.
 */
export function readWorkbook(bytes: ArrayBuffer | Uint8Array): XLSX.WorkBook {
    return XLSX.read(bytes, { type: 'array', cellFormula: false })
}

/**
 * Parse one worksheet into rows and per-row errors.
 *
 * Every failing row is reported rather than throwing on the first, because a 200-row sheet has to be
 * fixable in one pass. A row that errors contributes no data row, so `rows` is always safe to
 * submit once `errors` is empty.
 */
export function parseAnswerKeySheet(book: XLSX.WorkBook, sheetName?: string): AnswerKeyParseResult {
    const name = sheetName ?? book.SheetNames[0]
    const sheet = name ? book.Sheets[name] : undefined
    if (!sheet) {
        return {
            rows: [],
            errors: [
                {
                    row: 0,
                    column: '-',
                    value: name ?? '',
                    message: 'That sheet is empty.',
                },
            ],
        }
    }

    // raw:false renders a formula cell as its CACHED VALUE and dates as text; we never evaluate
    // formulas. defval keeps blank cells present as '' so column indexes stay aligned.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
    })

    const headerIndex = findHeaderRow(rows)
    if (headerIndex === -1) {
        const found = (rows[0] ?? []).map((c) => String(c ?? '')).filter(Boolean)
        return {
            rows: [],
            errors: [
                {
                    row: 1,
                    column: '-',
                    value: found.join(', ') || '(empty)',
                    message: `No "slide" column found in the first ${HEADER_SEARCH_LIMIT} rows. Download the template and use its headings.`,
                },
            ],
        }
    }

    const headers = (rows[headerIndex] ?? []).map(headerKey)
    const indexOf: Partial<Record<keyof typeof COLUMN_ALIASES, number>> = {}
    headers.forEach((key, i) => {
        const field = columnFor(key)
        // First match wins, so a duplicated heading can't shadow the real column.
        if (field && indexOf[field] === undefined) indexOf[field] = i
    })

    if (indexOf.answer === undefined) {
        return {
            rows: [],
            errors: [
                {
                    row: headerIndex + 1,
                    column: '-',
                    value: headers.filter(Boolean).join(', '),
                    message:
                        'No "answer" column found. Download the template and use its headings.',
                },
            ],
        }
    }

    const errors: AnswerKeyRowError[] = []
    const accepted: AnswerKeyRow[] = []
    const seenAt = new Map<string, number>()
    let lastMergedSlide = ''

    for (let i = headerIndex + 1; i < rows.length; i++) {
        const row = rows[i] ?? []
        const excelRow = i + 1
        const cell = (at: number | undefined) =>
            at === undefined ? '' : String(row[at] ?? '').trim()

        const rawSlide = cell(indexOf.slide)
        const rawAnswer = cell(indexOf.answer)
        const rawNotes = cell(indexOf.notes)

        // Fully blank rows are padding, so skip silently.
        if (!rawSlide && !rawAnswer && !rawNotes) continue

        // A vertically merged slide cell reads as a value once, then blanks. Carry it forward so
        // continuation rows attach to the right slide rather than erroring as "missing".
        const slideSource = rawSlide || lastMergedSlide
        if (rawSlide) lastMergedSlide = rawSlide

        if (!slideSource) {
            errors.push({
                row: excelRow,
                column: 'slide',
                value: '',
                message: 'Slide is required.',
            })
            continue
        }

        const slideNumber = normalizeSlideNumber(slideSource)
        if (!slideNumber || !isValidSlideNumber(slideSource)) {
            errors.push({
                row: excelRow,
                column: 'slide',
                value: slideSource,
                message: 'Not a slide label. Use e.g. V7, 7, VVC12 or G3A.',
            })
            continue
        }

        const answers = rawAnswer
            .split(ANSWER_SEPARATOR)
            .map((a) => a.trim())
            .filter(Boolean)
        if (answers.length === 0) {
            errors.push({
                row: excelRow,
                column: 'answer',
                value: rawAnswer,
                message: 'At least one answer is required.',
            })
            continue
        }

        const previous = seenAt.get(slideNumber)
        if (previous !== undefined) {
            // Naming BOTH rows is the point, because a unique-constraint error server-side could only
            // name the slide, which is unfindable in a long sheet.
            errors.push({
                row: excelRow,
                column: 'slide',
                value: slideNumber,
                message: `Duplicate: slide ${slideNumber} is already on row ${previous}.`,
            })
            continue
        }
        seenAt.set(slideNumber, excelRow)

        accepted.push({
            slide_number: slideNumber,
            accepted_answers: answers,
            notes: rawNotes || undefined,
        })
    }

    if (accepted.length === 0 && errors.length === 0) {
        errors.push({
            row: headerIndex + 1,
            column: '-',
            value: '',
            message: 'No data rows found below the heading row.',
        })
    }

    return { rows: accepted, errors }
}

/**
 * The downloadable template. Built from the same column names the parser reads, so the two can
 * never drift, which is the whole reason it is generated rather than shipped as a static asset.
 */
export function buildAnswerKeyTemplate(): XLSX.WorkBook {
    const sheet = XLSX.utils.aoa_to_sheet([
        ['slide', 'answer', 'notes'],
        ['V7', 'VVC', 'optional free text'],
        ['V8', 'BV | bacterial vaginosis', 'several phrasings: separate with |'],
        ['1', 'HL', ''],
    ])
    sheet['!cols'] = [{ wch: 10 }, { wch: 34 }, { wch: 38 }]
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Answer key')
    return book
}
