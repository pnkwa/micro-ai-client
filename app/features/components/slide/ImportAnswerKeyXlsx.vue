<script setup lang="ts">
/**
 * Excel answer-key import (client request 2.1, "รองรับไฟล์ answer key ในรูปแบบ Excel file").
 *
 * The workbook is parsed HERE, in the browser, and only validated rows are posted as JSON
 * (BE-ADR-006: "CSV/Excel parsing is the client's job"; BE-ADR-007: no multipart handlers
 * server-side). Same shape as ImportStudentsCsv.vue, which does the roster the same way.
 *
 * The client agreed we define the format and hand them a template, so the headers below ARE the
 * contract rather than a guess, hence the template download, which is what keeps most sheets
 * well-formed in the first place. Header matching is still forgiving about case, spacing and a
 * few obvious synonyms, because an instructor retyping a header by hand shouldn't lose an import.
 */
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, X, Download } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { compareSlideNumbers } from '~/core/helpers/slideNumber'
import {
    buildAnswerKeyTemplate,
    parseAnswerKeySheet,
    readWorkbook,
    sheetNamesOf,
    type AnswerKeyRowError,
} from '~/core/helpers/answerKeySheet'
import type { Slide, SlideInput, BulkImportMode } from '~/services/slideCollectionService'
import { fetchDiagnosisOptions, vocabularyTerms } from '~/core/helpers/classVocabulary'

const props = defineProps<{ existing: Slide[] }>()

const emit = defineEmits<{
    submit: [payload: { mode: BulkImportMode; slides: SlideInput[] }]
    cancel: []
}>()

type DiffKind = 'added' | 'updated' | 'unchanged' | 'removed'

interface DiffEntry {
    kind: DiffKind
    slide_number: string
    answers: string
}

const fileName = ref('')
const parsed = ref(false)
const parsing = ref(false)
const submitting = ref(false)
const mode = ref<BulkImportMode>('replace')
const validRows = ref<SlideInput[]>([])
const rowErrors = ref<AnswerKeyRowError[]>([])
const sheetNames = ref<string[]>([])
const activeSheet = ref('')
const workbook = shallowRef<XLSX.WorkBook | null>(null)

const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

/**
 * Every answer the grader will recognise. Same source as the student's answer picker (3.1), so an
 * answer an instructor may author and an answer a student may pick are the same set by
 * construction. See core/helpers/classVocabulary.ts.
 */
const vocabulary = ref<Set<string> | null>(null)

onMounted(async () => {
    try {
        const terms = vocabularyTerms(await fetchDiagnosisOptions())
        vocabulary.value = terms.size > 0 ? terms : null
    } catch {
        // Couldn't load it, so skip the check rather than block an import on it.
        vocabulary.value = null
    }
})

/**
 * Answers outside the known vocabulary. A WARNING, not an error, deliberately: accepted_answers
 * is free text by design and the grader falls back to fuzzy matching for it, so an unrecognised
 * phrase is legitimate, and rejecting here would make the import stricter than typing the same
 * answer into the Add-slide form. What it does catch is the thing worth catching: a typo like
 * "BVV" that would never match anything at grade time.
 */
const answerWarnings = computed(() => {
    const known = vocabulary.value
    if (!known) return []
    const out: { slide_number: string; answer: string }[] = []
    for (const row of validRows.value) {
        for (const answer of row.accepted_answers) {
            if (!known.has(answer.trim().toLowerCase())) {
                out.push({ slide_number: row.slide_number, answer })
            }
        }
    }
    return out
})

const reset = () => {
    fileName.value = ''
    parsed.value = false
    validRows.value = []
    rowErrors.value = []
    sheetNames.value = []
    activeSheet.value = ''
    workbook.value = null
    if (fileInputRef.value) fileInputRef.value.value = ''
}

/** Parse one sheet of the loaded workbook into rows + errors (logic lives in answerKeySheet.ts). */
const parseSheet = (name: string) => {
    const book = workbook.value
    if (!book) return
    activeSheet.value = name
    const result = parseAnswerKeySheet(book, name)
    validRows.value = result.rows
    rowErrors.value = result.errors
    parsed.value = true
}

const readFile = async (file: File) => {
    parsing.value = true
    reset()
    fileName.value = file.name
    try {
        const buffer = await file.arrayBuffer()
        // Parsed from bytes, so a .csv renamed to .xlsx is read as the CSV it actually is.
        // SheetJS is lenient, though: junk bytes usually parse into a nonsense sheet rather than
        // throwing, so the catch below is a backstop and the real guard is the header check in
        // parseAnswerKeySheet, which reports "no slide column" (see answerKeySheet.spec.ts).
        const book = readWorkbook(buffer)
        if (book.SheetNames.length === 0) {
            rowErrors.value = [
                { row: 0, column: '-', value: file.name, message: 'That file has no sheets.' },
            ]
            parsed.value = true
            return
        }
        workbook.value = book
        sheetNames.value = sheetNamesOf(book)
        parseSheet(book.SheetNames[0]!)
    } catch {
        rowErrors.value = [
            {
                row: 0,
                column: '-',
                value: file.name,
                message: "Couldn't read that file. Is it a real .xlsx or .csv?",
            },
        ]
        parsed.value = true
    } finally {
        parsing.value = false
    }
}

const onFileChange = (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) void readFile(file)
}

const onDrop = (event: DragEvent) => {
    isDragging.value = false
    const file = event.dataTransfer?.files?.[0]
    if (file) void readFile(file)
}

/** The diff the instructor confirms. Nothing is written until they do. */
const diff = computed<DiffEntry[]>(() => {
    const byNumber = new Map(props.existing.map((s) => [s.slide_number, s]))
    const incoming = new Set(validRows.value.map((r) => r.slide_number))
    const entries: DiffEntry[] = []

    for (const row of validRows.value) {
        const current = byNumber.get(row.slide_number)
        const answers = row.accepted_answers.join(', ')
        if (!current) {
            entries.push({ kind: 'added', slide_number: row.slide_number, answers })
        } else if (current.accepted_answers.join(', ') === answers) {
            entries.push({ kind: 'unchanged', slide_number: row.slide_number, answers })
        } else {
            entries.push({ kind: 'updated', slide_number: row.slide_number, answers })
        }
    }

    // Only `replace` deletes; in merge these rows are simply untouched, so they aren't listed.
    if (mode.value === 'replace') {
        for (const slide of props.existing) {
            if (!incoming.has(slide.slide_number)) {
                entries.push({
                    kind: 'removed',
                    slide_number: slide.slide_number,
                    answers: slide.accepted_answers.join(', '),
                })
            }
        }
    }

    return entries.sort((a, b) => compareSlideNumbers(a.slide_number, b.slide_number))
})

const counts = computed(() => ({
    added: diff.value.filter((d) => d.kind === 'added').length,
    updated: diff.value.filter((d) => d.kind === 'updated').length,
    unchanged: diff.value.filter((d) => d.kind === 'unchanged').length,
    removed: diff.value.filter((d) => d.kind === 'removed').length,
}))

const canSubmit = computed(
    () => parsed.value && rowErrors.value.length === 0 && validRows.value.length > 0,
)

const badgeClass = (kind: DiffKind) =>
    ({
        added: 'tw:bg-green-50 tw:text-green-700',
        updated: 'tw:bg-amber-50 tw:text-amber-700',
        unchanged: 'tw:bg-navy-10 tw:text-navy-60',
        removed: 'tw:bg-red-50 tw:text-red-700',
    })[kind]

/**
 * The template. Generated here rather than shipped as a static asset so it can never drift from
 * the parser above, so the headers written are the headers we read.
 */
const downloadTemplate = () => {
    XLSX.writeFile(buildAnswerKeyTemplate(), 'answer-key-template.xlsx')
}

const onSubmit = () => {
    if (!canSubmit.value) return
    submitting.value = true
    emit('submit', { mode: mode.value, slides: validRows.value })
}

/** Let the page stop the spinner if the request fails and the dialog stays open. */
defineExpose({
    stopSubmitting: () => {
        submitting.value = false
    },
})

watch(mode, () => {
    if (parsed.value && validRows.value.length > 0) {
        toast.info(
            mode.value === 'replace'
                ? 'Replace: slides missing from the sheet will be deleted.'
                : 'Merge: slides missing from the sheet are left as they are.',
        )
    }
})
</script>

<template>
    <McDialogHeader>
        <McDialogTitle>Import answer key</McDialogTitle>
        <McDialogDescription>
            Upload an Excel or CSV file. Nothing is saved until you confirm the preview.
        </McDialogDescription>
    </McDialogHeader>

    <div class="tw:flex tw:flex-col tw:gap-4 tw:py-2 tw:max-h-[60vh] tw:overflow-y-auto">
        <!-- Drop zone -->
        <div>
            <input
                ref="fileInputRef"
                type="file"
                accept=".xlsx,.xls,.csv"
                class="tw:hidden"
                @change="onFileChange"
            />
            <button
                type="button"
                class="tw:flex tw:w-full tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:border tw:border-dashed tw:px-4 tw:py-8 tw:text-sm tw:transition-colors"
                :class="
                    isDragging
                        ? 'tw:border-primary tw:bg-primary/5 tw:text-primary'
                        : 'tw:border-navy-20 tw:text-navy-60 tw:hover:border-primary tw:hover:text-primary'
                "
                @click="fileInputRef?.click()"
                @dragover.prevent="isDragging = true"
                @dragleave.prevent="isDragging = false"
                @drop.prevent="onDrop"
            >
                <Upload class="tw:size-5" />
                <span v-if="parsing">Reading…</span>
                <span v-else>Drop a file here, or click to choose</span>
                <span class="tw:text-xs tw:opacity-60">.xlsx, .xls or .csv</span>
            </button>

            <div class="tw:mt-2 tw:flex tw:items-center tw:justify-between tw:gap-2">
                <div
                    v-if="fileName"
                    class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-navy-80"
                >
                    <FileSpreadsheet class="tw:size-4 tw:text-primary" />
                    <span class="tw:truncate">{{ fileName }}</span>
                    <button
                        type="button"
                        aria-label="Remove file"
                        class="tw:text-navy-50 tw:hover:text-danger"
                        @click="reset"
                    >
                        <X class="tw:size-4" />
                    </button>
                </div>
                <span v-else />

                <button
                    type="button"
                    class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-primary tw:hover:underline"
                    @click="downloadTemplate"
                >
                    <Download class="tw:size-3.5" />
                    Download template
                </button>
            </div>
        </div>

        <!-- Sheet picker: only when the workbook actually has more than one -->
        <div v-if="sheetNames.length > 1" class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-xs tw:font-medium tw:text-navy-60">Sheet</label>
            <div class="tw:flex tw:flex-wrap tw:gap-1.5">
                <button
                    v-for="name in sheetNames"
                    :key="name"
                    type="button"
                    class="tw:rounded-md tw:border tw:px-2.5 tw:py-1 tw:text-xs"
                    :class="
                        name === activeSheet
                            ? 'tw:border-primary tw:bg-primary/10 tw:text-primary'
                            : 'tw:border-navy-20 tw:text-navy-60 tw:hover:border-primary'
                    "
                    @click="parseSheet(name)"
                >
                    {{ name }}
                </button>
            </div>
        </div>

        <!-- Errors: every failing row, not just the first -->
        <div
            v-if="rowErrors.length > 0"
            class="tw:rounded-lg tw:border tw:border-red-200 tw:bg-red-50/50"
        >
            <p class="tw:px-3 tw:py-2 tw:text-sm tw:font-medium tw:text-red-700">
                {{ rowErrors.length }} problem{{ rowErrors.length === 1 ? '' : 's' }}. Fix the file
                and upload it again.
            </p>
            <div class="tw:max-h-48 tw:overflow-y-auto tw:border-t tw:border-red-200">
                <table class="tw:w-full tw:text-xs">
                    <thead class="tw:text-left tw:text-red-700/70">
                        <tr>
                            <th class="tw:px-3 tw:py-1.5 tw:font-medium tw:w-16">Row</th>
                            <th class="tw:px-3 tw:py-1.5 tw:font-medium tw:w-20">Column</th>
                            <th class="tw:px-3 tw:py-1.5 tw:font-medium">Problem</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(err, i) in rowErrors"
                            :key="`${err.row}-${err.column}-${i}`"
                            class="tw:border-t tw:border-red-100"
                        >
                            <td class="tw:px-3 tw:py-1.5 tw:tabular-nums">
                                {{ err.row || '-' }}
                            </td>
                            <td class="tw:px-3 tw:py-1.5">{{ err.column }}</td>
                            <td class="tw:px-3 tw:py-1.5">
                                <span v-if="err.value" class="tw:font-medium">
                                    "{{ err.value }}":
                                </span>
                                {{ err.message }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Unknown answers: worth seeing, not worth blocking on -->
        <div
            v-if="canSubmit && answerWarnings.length > 0"
            class="tw:rounded-lg tw:border tw:border-amber-200 tw:bg-amber-50/50 tw:px-3 tw:py-2"
        >
            <p class="tw:text-sm tw:font-medium tw:text-amber-800">
                {{ answerWarnings.length }} answer{{ answerWarnings.length === 1 ? '' : 's' }} not
                in the known class list
            </p>
            <p class="tw:mt-0.5 tw:text-xs tw:text-amber-700/80">
                Free text is allowed and will still be graded, so this is only a heads-up. Check for
                typos.
            </p>
            <ul class="tw:mt-1.5 tw:flex tw:flex-wrap tw:gap-x-3 tw:gap-y-1 tw:text-xs">
                <li v-for="(w, i) in answerWarnings" :key="`${w.slide_number}-${i}`">
                    <span class="tw:font-semibold tw:text-amber-900">{{ w.slide_number }}</span>
                    <span class="tw:text-amber-700">: "{{ w.answer }}"</span>
                </li>
            </ul>
        </div>

        <!-- Mode + preview diff -->
        <template v-if="canSubmit">
            <div class="tw:flex tw:flex-col tw:gap-1.5">
                <label class="tw:text-xs tw:font-medium tw:text-navy-60">On import</label>
                <div class="tw:flex tw:flex-col tw:gap-1.5">
                    <label class="tw:flex tw:items-start tw:gap-2 tw:text-sm">
                        <input v-model="mode" type="radio" value="replace" class="tw:mt-1" />
                        <span>
                            <span class="tw:font-medium">Replace</span>
                            : the file becomes the whole answer key.
                            <span class="tw:text-danger">Slides missing from it are deleted.</span>
                        </span>
                    </label>
                    <label class="tw:flex tw:items-start tw:gap-2 tw:text-sm">
                        <input v-model="mode" type="radio" value="merge" class="tw:mt-1" />
                        <span>
                            <span class="tw:font-medium">Merge</span>
                            : add and update only; slides missing from the file are left alone.
                        </span>
                    </label>
                </div>
            </div>

            <div class="tw:rounded-lg tw:border tw:border-navy-10">
                <div
                    class="tw:flex tw:flex-wrap tw:gap-3 tw:border-b tw:border-navy-10 tw:px-3 tw:py-2 tw:text-xs"
                >
                    <span class="tw:text-green-700">{{ counts.added }} added</span>
                    <span class="tw:text-amber-700">{{ counts.updated }} updated</span>
                    <span class="tw:text-navy-50">{{ counts.unchanged }} unchanged</span>
                    <span class="tw:text-red-700">{{ counts.removed }} removed</span>
                </div>
                <div class="tw:max-h-56 tw:overflow-y-auto">
                    <table class="tw:w-full tw:text-xs">
                        <tbody>
                            <tr
                                v-for="entry in diff"
                                :key="`${entry.kind}-${entry.slide_number}`"
                                class="tw:border-b tw:border-navy-10 last:tw:border-0"
                            >
                                <td class="tw:px-3 tw:py-1.5 tw:w-24">
                                    <span
                                        class="tw:inline-flex tw:rounded tw:px-1.5 tw:py-0.5 tw:font-medium"
                                        :class="badgeClass(entry.kind)"
                                    >
                                        {{ entry.kind }}
                                    </span>
                                </td>
                                <td
                                    class="tw:px-3 tw:py-1.5 tw:w-20 tw:font-semibold tw:text-navy-90"
                                >
                                    {{ entry.slide_number }}
                                </td>
                                <td class="tw:px-3 tw:py-1.5 tw:text-navy-70">
                                    {{ entry.answers }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </template>
    </div>

    <McDialogFooter>
        <McButton variant="outline" :disabled="submitting" @click="emit('cancel')">Cancel</McButton>
        <McButton :disabled="!canSubmit || submitting" :loading="submitting" @click="onSubmit">
            Import {{ validRows.length }} slide{{ validRows.length === 1 ? '' : 's' }}
        </McButton>
    </McDialogFooter>
</template>
