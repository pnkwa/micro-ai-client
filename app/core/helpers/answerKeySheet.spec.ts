import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
    buildAnswerKeyTemplate,
    parseAnswerKeySheet,
    readWorkbook,
    sheetNamesOf,
} from './answerKeySheet'

/**
 * Fixtures are built as real .xlsx bytes and read back through the same path the browser uses,
 * so these exercise SheetJS itself (cell typing, formula caching, format sniffing) rather than
 * a hand-rolled stand-in that could agree with the parser while both are wrong.
 */
const workbookFrom = (rows: unknown[][], sheetName = 'Sheet1'): XLSX.WorkBook => {
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, sheetName)
    return book
}

/** Round-trip through actual file bytes, the way an upload arrives. */
const throughBytes = (book: XLSX.WorkBook, bookType: XLSX.BookType = 'xlsx'): XLSX.WorkBook => {
    const bytes = XLSX.write(book, { type: 'array', bookType }) as ArrayBuffer
    return readWorkbook(bytes)
}

const HEADER = ['slide', 'answer', 'notes']

describe('parseAnswerKeySheet: happy path', () => {
    it('reads a well-formed sheet', () => {
        const book = throughBytes(
            workbookFrom([HEADER, ['V7', 'VVC', 'from the 2024 bench'], ['V8', 'BV', '']]),
        )
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(errors).toEqual([])
        expect(rows).toEqual([
            { slide_number: 'V7', accepted_answers: ['VVC'], notes: 'from the 2024 bench' },
            { slide_number: 'V8', accepted_answers: ['BV'], notes: undefined },
        ])
    })

    it('splits several accepted phrasings on | or newline', () => {
        const book = throughBytes(
            workbookFrom([
                HEADER,
                ['V7', 'BV | bacterial vaginosis', ''],
                ['V8', 'HL\nhealthy', ''],
            ]),
        )
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(errors).toEqual([])
        expect(rows[0]!.accepted_answers).toEqual(['BV', 'bacterial vaginosis'])
        expect(rows[1]!.accepted_answers).toEqual(['HL', 'healthy'])
    })

    it('accepts header synonyms and any casing/spacing', () => {
        const book = throughBytes(
            workbookFrom([
                ['Slide ID', 'Diagnosis', 'Remarks'],
                ['V7', 'VVC', 'ok'],
            ]),
        )
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(errors).toEqual([])
        expect(rows).toHaveLength(1)
        expect(rows[0]!.slide_number).toBe('V7')
    })

    it('finds the header row below a title block', () => {
        const book = throughBytes(
            workbookFrom([['HRP 68 answer key'], [], HEADER, ['V7', 'VVC', '']]),
        )
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(errors).toEqual([])
        expect(rows).toHaveLength(1)
    })
})

describe('parseAnswerKeySheet: the cases that bite', () => {
    // Excel stores a bare 7 as a NUMBER; read as 7 it must still become the label "7".
    it('handles numeric-typed slide cells', () => {
        const book = throughBytes(
            workbookFrom([HEADER, [7, 'VVC', ''], ['V07', 'HL', ''], [12, 'BV', '']]),
        )
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(errors).toEqual([])
        expect(rows.map((r) => r.slide_number)).toEqual(['7', 'V7', '12'])
    })

    // A numeric 7 and a text '007' are the SAME slide once normalized, so the sheet is
    // self-contradictory, and saying so beats writing one of them over the other server-side.
    it('treats a numeric 7 and a text 007 as the same slide', () => {
        const book = throughBytes(workbookFrom([HEADER, [7, 'VVC', ''], ['007', 'BV', '']]))
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(rows).toHaveLength(1)
        expect(errors).toHaveLength(1)
        expect(errors[0]!.message).toMatch(/slide 7 is already on row 2/)
    })

    it('reads a formula cell as its cached value, not the formula text', () => {
        const sheet = XLSX.utils.aoa_to_sheet([HEADER, ['V7', '', '']])
        // B2 is a formula whose last computed result was "VVC".
        sheet.B2 = { t: 's', f: 'CONCATENATE("VV","C")', v: 'VVC' }
        const book = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(book, sheet, 'Sheet1')

        const { rows, errors } = parseAnswerKeySheet(throughBytes(book))

        expect(errors).toEqual([])
        expect(rows[0]!.accepted_answers).toEqual(['VVC'])
    })

    // A .csv renamed to .xlsx: detected by CONTENT, because we parse bytes not the extension.
    it('reads a CSV even when it claims to be .xlsx', () => {
        const csv = 'slide,answer,notes\nV7,VVC,\nV8,BV,\n'
        const book = readWorkbook(new TextEncoder().encode(csv))
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(errors).toEqual([])
        expect(rows.map((r) => r.slide_number)).toEqual(['V7', 'V8'])
    })

    // SheetJS is LENIENT: arbitrary bytes don't throw, they get parsed as loose text. So a junk
    // file is caught by the header check, not by readWorkbook, which still lands the instructor
    // on an actionable message rather than a stack trace.
    it('surfaces junk bytes as a missing-column error, not a crash', () => {
        const book = readWorkbook(new TextEncoder().encode('\x00\x01not a sheet at all'))
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(rows).toEqual([])
        expect(errors).toHaveLength(1)
        expect(errors[0]!.message).toMatch(/No "slide" column/)
    })

    it('skips fully blank rows without reporting them', () => {
        const book = throughBytes(
            workbookFrom([HEADER, ['V7', 'VVC', ''], ['', '', ''], [], ['V8', 'BV', '']]),
        )
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(errors).toEqual([])
        expect(rows).toHaveLength(2)
    })

    // A vertically merged slide cell reads as a value once, then blanks on continuation rows.
    it('carries a merged slide label down its continuation rows', () => {
        const sheet = XLSX.utils.aoa_to_sheet([HEADER, ['V7', 'VVC', ''], ['', 'candidiasis', '']])
        sheet['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }]
        const book = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(book, sheet, 'Sheet1')

        const { errors } = parseAnswerKeySheet(throughBytes(book))

        // The continuation row resolves to V7, which makes it a duplicate, reported as such
        // rather than as a bogus "Slide is required".
        expect(errors).toHaveLength(1)
        expect(errors[0]!.message).toMatch(/Duplicate/)
        expect(errors[0]!.column).toBe('slide')
    })
})

describe('parseAnswerKeySheet: errors', () => {
    it('reports a missing slide column, naming what it found', () => {
        const book = throughBytes(
            workbookFrom([
                ['name', 'answer'],
                ['V7', 'VVC'],
            ]),
        )
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(rows).toEqual([])
        expect(errors).toHaveLength(1)
        expect(errors[0]!.message).toMatch(/No "slide" column/)
        expect(errors[0]!.value).toContain('name')
    })

    it('reports a missing answer column', () => {
        const book = throughBytes(
            workbookFrom([
                ['slide', 'notes'],
                ['V7', 'x'],
            ]),
        )
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(rows).toEqual([])
        expect(errors[0]!.message).toMatch(/No "answer" column/)
    })

    // The whole point of naming both rows: a server-side unique violation could only name the
    // slide, which is unfindable in a 200-row sheet.
    it('reports a duplicate slide naming BOTH row numbers', () => {
        const book = throughBytes(
            workbookFrom([HEADER, ['V7', 'VVC', ''], ['V8', 'BV', ''], ['v7', 'HL', '']]),
        )
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(rows).toHaveLength(2)
        expect(errors).toHaveLength(1)
        // Row 4 collides with row 2, and it matched despite the different casing.
        expect(errors[0]!.row).toBe(4)
        expect(errors[0]!.message).toMatch(/already on row 2/)
    })

    it('reports an unusable slide label with its row and value', () => {
        const book = throughBytes(workbookFrom([HEADER, ['not-a-slide!', 'VVC', '']]))
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(rows).toEqual([])
        expect(errors[0]).toMatchObject({ row: 2, column: 'slide', value: 'not-a-slide!' })
    })

    it('reports a missing answer', () => {
        const book = throughBytes(workbookFrom([HEADER, ['V7', '', 'just a note']]))
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(rows).toEqual([])
        expect(errors[0]).toMatchObject({ row: 2, column: 'answer' })
    })

    // Every bad row in one pass, because failing on the first would make a long sheet unfixable.
    it('collects every failing row rather than stopping at the first', () => {
        const book = throughBytes(
            workbookFrom([
                HEADER,
                ['!!!', 'VVC', ''],
                ['V8', '', ''],
                ['???', 'BV', ''],
                ['V9', 'HL', ''],
            ]),
        )
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(rows).toHaveLength(1)
        expect(errors.map((e) => e.row)).toEqual([2, 3, 4])
    })

    it('reports a sheet with headers but no data rows', () => {
        const book = throughBytes(workbookFrom([HEADER]))
        const { rows, errors } = parseAnswerKeySheet(book)

        expect(rows).toEqual([])
        expect(errors[0]!.message).toMatch(/No data rows/)
    })

    it('reports an unknown sheet name', () => {
        const book = throughBytes(workbookFrom([HEADER, ['V7', 'VVC', '']]))
        const { errors } = parseAnswerKeySheet(book, 'Nope')

        expect(errors[0]!.message).toMatch(/empty/)
    })
})

describe('multi-sheet workbooks', () => {
    it('defaults to the first sheet and can be pointed at another', () => {
        const book = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(
            book,
            XLSX.utils.aoa_to_sheet([HEADER, ['V7', 'VVC', '']]),
            'Term 1',
        )
        XLSX.utils.book_append_sheet(
            book,
            XLSX.utils.aoa_to_sheet([HEADER, ['G3', 'BV', '']]),
            'Term 2',
        )
        const loaded = throughBytes(book)

        expect(sheetNamesOf(loaded)).toEqual(['Term 1', 'Term 2'])
        expect(parseAnswerKeySheet(loaded).rows[0]!.slide_number).toBe('V7')
        expect(parseAnswerKeySheet(loaded, 'Term 2').rows[0]!.slide_number).toBe('G3')
    })
})

describe('buildAnswerKeyTemplate', () => {
    // The template and the parser must never drift, and the surest check is that the template
    // parses cleanly through the very parser it is meant to feed.
    it('produces a file this parser reads without errors', () => {
        const { rows, errors } = parseAnswerKeySheet(throughBytes(buildAnswerKeyTemplate()))

        expect(errors).toEqual([])
        expect(rows.map((r) => r.slide_number)).toEqual(['V7', 'V8', '1'])
        expect(rows[1]!.accepted_answers).toEqual(['BV', 'bacterial vaginosis'])
    })
})
