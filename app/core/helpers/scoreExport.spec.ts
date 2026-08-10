import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
    buildCanvasGradebook,
    buildClassGradeReport,
    buildScoreReport,
    exportFilename,
    type ClassGradeRow,
    type ScoreRow,
} from './scoreExport'

/**
 * Every assertion goes through real written bytes and back, so these exercise what an instructor
 * actually opens rather than the builder's own object - the same approach answerKeySheet.spec.ts
 * takes. A cell that looks right in the WorkBook but serializes wrong would pass otherwise.
 */
const rowsOf = (book: XLSX.WorkBook, bookType: XLSX.BookType = 'xlsx'): unknown[][] => {
    const bytes = XLSX.write(book, { type: 'array', bookType }) as ArrayBuffer
    const read = XLSX.read(bytes, { type: 'array' })
    const sheet = read.Sheets[read.SheetNames[0]!]!
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
}

const meta = { assignmentName: 'Lab 3 - Vaginal smear', totalPoints: 25 }

const row = (over: Partial<ScoreRow> = {}): ScoreRow => ({
    studentId: '652000090',
    name: 'Jane Doe',
    score: 18,
    status: 'Submitted',
    submittedAt: 'Sep 16, 09:12',
    ...over,
})

describe('buildScoreReport', () => {
    it('writes a header and one row per student, in the order given', () => {
        const rows = rowsOf(
            buildScoreReport(
                [row(), row({ studentId: '652000091', name: 'John Smith', score: 25 })],
                meta,
            ),
        )

        expect(rows[0]).toEqual(['Student ID', 'Name', 'Score', 'Out of', 'Status', 'Submitted at'])
        expect(rows[1]).toEqual(['652000090', 'Jane Doe', '18', '25', 'Submitted', 'Sep 16, 09:12'])
        expect(rows[2]?.[1]).toBe('John Smith')
    })

    // The one that would quietly mark a cohort down if it regressed.
    it('leaves the score BLANK for a student who has not submitted, not 0', () => {
        const rows = rowsOf(
            buildScoreReport(
                [row({ score: null, status: 'Not submitted', submittedAt: null })],
                meta,
            ),
        )
        expect(rows[1]?.[2]).toBe('')
        expect(rows[1]?.[2]).not.toBe('0')
    })

    it('keeps a real zero as a zero', () => {
        const rows = rowsOf(buildScoreReport([row({ score: 0 })], meta))
        expect(rows[1]?.[2]).toBe('0')
    })

    it('exports exactly the rows handed to it, so a filtered view exports what is on screen', () => {
        const rows = rowsOf(buildScoreReport([row()], meta))
        expect(rows).toHaveLength(2) // header + the single row
    })

    it('handles an empty roster without producing a broken sheet', () => {
        const rows = rowsOf(buildScoreReport([], meta))
        expect(rows[0]?.[0]).toBe('Student ID')
        expect(rows).toHaveLength(1)
    })
})

describe('buildCanvasGradebook', () => {
    it('writes the Canvas header and the Points Possible row', () => {
        const rows = rowsOf(buildCanvasGradebook([row()], meta), 'csv')

        expect(rows[0]).toEqual(['Student', 'SIS User ID', 'Lab 3 - Vaginal smear'])
        // Canvas's own convention, leading spaces included.
        expect(rows[1]?.[0]).toBe('    Points Possible')
        expect(rows[1]?.[2]).toBe('25')
    })

    it('puts the student id in SIS User ID and the mark in the assignment column', () => {
        const rows = rowsOf(buildCanvasGradebook([row()], meta), 'csv')
        expect(rows[2]).toEqual(['Jane Doe', '652000090', '18'])
    })

    it('leaves a non-submitter blank rather than importing a zero', () => {
        const rows = rowsOf(
            buildCanvasGradebook([row({ score: null, status: 'Not submitted' })], meta),
            'csv',
        )
        expect(rows[2]?.[2]).toBe('')
    })

    // A CSV written by hand would break here; SheetJS quotes it, and this pins that.
    it('survives a name containing a comma', () => {
        const rows = rowsOf(buildCanvasGradebook([row({ name: 'Doe, Jane' })], meta), 'csv')
        expect(rows[2]?.[0]).toBe('Doe, Jane')
        expect(rows[2]?.[1]).toBe('652000090')
    })

    it('survives an assignment name containing a comma', () => {
        const rows = rowsOf(
            buildCanvasGradebook([row()], { assignmentName: 'Lab 3, part 2', totalPoints: 10 }),
            'csv',
        )
        expect(rows[0]?.[2]).toBe('Lab 3, part 2')
    })
})

describe('buildClassGradeReport', () => {
    const grade = (over: Partial<ClassGradeRow> = {}): ClassGradeRow => ({
        studentId: '652000090',
        name: 'Jane Doe',
        earned: 18,
        possible: 25,
        ...over,
    })

    it('writes earned, possible and a rounded percent', () => {
        const rows = rowsOf(buildClassGradeReport([grade()]))

        expect(rows[0]).toEqual(['Student ID', 'Name', 'Earned', 'Possible', 'Percent'])
        expect(rows[1]).toEqual(['652000090', 'Jane Doe', '18', '25', '72'])
    })

    // Only students with graded work come back from GET /classes/:id/grades; the rest are roster
    // rows with nothing yet, and that is not a zero.
    it('leaves a student with no graded work blank, not 0%', () => {
        const rows = rowsOf(buildClassGradeReport([grade({ earned: null, possible: null })]))
        expect(rows[1]?.[2]).toBe('')
        expect(rows[1]?.[3]).toBe('')
        expect(rows[1]?.[4]).toBe('')
    })

    it('keeps a real zero, which is a mark rather than an absence', () => {
        const rows = rowsOf(buildClassGradeReport([grade({ earned: 0, possible: 25 })]))
        expect(rows[1]?.[2]).toBe('0')
        expect(rows[1]?.[4]).toBe('0')
    })

    // possible is per-student, so a 0 denominator is reachable and must not produce Infinity/NaN.
    it('does not divide by zero', () => {
        const rows = rowsOf(buildClassGradeReport([grade({ earned: 0, possible: 0 })]))
        expect(rows[1]?.[4]).toBe('')
    })

    it('handles an empty class', () => {
        const rows = rowsOf(buildClassGradeReport([]))
        expect(rows).toHaveLength(1)
    })
})

describe('exportFilename', () => {
    it.each([
        ['Lab 3 - Vaginal smear', 'xlsx', 'lab-3-vaginal-smear-scores.xlsx'],
        ['Lab 3 - Vaginal smear', 'csv', 'lab-3-vaginal-smear-scores.csv'],
        ['  Midterm  ', 'xlsx', 'midterm-scores.xlsx'],
        // Thai names survive: stripping everything non-ASCII reduced this to "3-scores.csv".
        ['ปฏิบัติการ 3', 'csv', 'ปฏิบัติการ-3-scores.csv'],
        ['Lab/3: "final"?', 'xlsx', 'lab3-final-scores.xlsx'], // filesystem-unsafe chars go
        ['///', 'csv', 'assignment-scores.csv'], // nothing usable left
    ])('%s -> %s', (name, ext, expected) => {
        expect(exportFilename(name, ext as 'xlsx' | 'csv')).toBe(expected)
    })

    it('caps a very long name', () => {
        expect(exportFilename('a'.repeat(200), 'xlsx').length).toBeLessThan(80)
    })
})
