<script setup lang="ts">
// The roster import: parses the file locally and emits typed rows, so the file itself never
// reaches the server (BE-ADR-006, "CSV/Excel parsing is the client's job"). The answer-key
// importer follows the same shape with a real spreadsheet parser: see
// features/components/slide/ImportAnswerKeyXlsx.vue, which handles .xlsx via SheetJS and adds a
// preview diff. Worth reusing from there if this ever grows beyond CSV.
import { Upload, FileText, X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { enrollStudentFormSchema } from '~/features/types/forms/student'
import type { EnrollStudentInput } from '~/services/classService'

const emit = defineEmits<{
    save: [values: EnrollStudentInput[]]
    cancel: []
}>()

const COLUMNS = ['student_id', 'email', 'firstname', 'lastname'] as const
type Column = (typeof COLUMNS)[number]

const fileName = ref('')
const validRows = ref<EnrollStudentInput[]>([])
const rowErrors = ref<string[]>([])
const parsed = ref(false)

const splitCsvLine = (line: string): string[] => {
    const out: string[] = []
    let field = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    field += '"'
                    i++
                } else {
                    inQuotes = false
                }
            } else {
                field += ch
            }
        } else if (ch === '"') {
            inQuotes = true
        } else if (ch === ',') {
            out.push(field)
            field = ''
        } else {
            field += ch
        }
    }
    out.push(field)
    return out.map((f) => f.trim())
}

const reset = () => {
    fileName.value = ''
    validRows.value = []
    rowErrors.value = []
    parsed.value = false
}

const parse = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
    const errors: string[] = []
    const rows: EnrollStudentInput[] = []

    if (lines.length === 0) {
        rowErrors.value = ['The file is empty.']
        validRows.value = []
        parsed.value = true
        return
    }

    const first = splitCsvLine(lines[0]!).map((c) => c.toLowerCase())
    const hasHeader = first.some((c) => (COLUMNS as readonly string[]).includes(c))
    const order: Column[] = hasHeader ? first.map((c) => c as Column) : [...COLUMNS]
    const dataLines = hasHeader ? lines.slice(1) : lines

    dataLines.forEach((line, idx) => {
        const lineNo = idx + (hasHeader ? 2 : 1)
        const cells = splitCsvLine(line)
        const record: Record<string, string> = {}
        order.forEach((col, i) => {
            if ((COLUMNS as readonly string[]).includes(col)) record[col] = cells[i] ?? ''
        })
        const result = enrollStudentFormSchema.safeParse(record)
        if (result.success) {
            rows.push(result.data)
        } else {
            const msg = result.error.issues[0]?.message ?? 'Invalid row'
            errors.push(`Line ${lineNo}: ${msg}`)
        }
    })

    validRows.value = rows
    rowErrors.value = errors
    parsed.value = true
}

const isCsvFile = (file: File): boolean => {
    const validMimeTypes = ['text/csv', 'application/vnd.ms-excel', '']
    return file.name.toLowerCase().endsWith('.csv') && validMimeTypes.includes(file.type)
}

const handleFile = async (file: File | undefined) => {
    if (!file) return
    if (!isCsvFile(file)) {
        toast.error('Please upload a .csv file')
        return
    }
    fileName.value = file.name
    parse(await file.text())
}

const onFile = async (e: Event) => {
    const input = e.target as HTMLInputElement
    await handleFile(input.files?.[0])
    input.value = ''
}

const isDragging = ref(false)

const onDragOver = () => {
    isDragging.value = true
}
const onDragLeave = () => {
    isDragging.value = false
}
const onDrop = async (e: DragEvent) => {
    isDragging.value = false
    await handleFile(e.dataTransfer?.files?.[0])
}

const submit = () => {
    if (validRows.value.length > 0) emit('save', validRows.value)
}
</script>

<template>
    <McDialogHeader>
        <McDialogTitle>Import Students from CSV</McDialogTitle>
        <McDialogDescription>
            Columns:
            <code class="tw:text-primary">student_id, email, firstname, lastname</code>
            . A header row is optional.
        </McDialogDescription>
    </McDialogHeader>

    <div class="tw:flex tw:flex-col tw:gap-4 tw:py-4">
        <label
            v-if="!fileName"
            class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:py-8 tw:border-2 tw:border-dashed tw:rounded-lg tw:cursor-pointer tw:transition-colors"
            :class="
                isDragging
                    ? 'tw:border-primary tw:bg-primary/10'
                    : 'tw:border-navy-20 tw:hover:border-primary tw:hover:bg-primary/5'
            "
            @dragover.prevent="onDragOver"
            @dragenter.prevent="onDragOver"
            @dragleave.prevent="onDragLeave"
            @drop.prevent="onDrop"
        >
            <Upload class="tw:w-6 tw:h-6 tw:text-navy-50" />
            <span class="tw:text-sm tw:text-navy-60">
                {{
                    isDragging
                        ? 'Drop the .csv file here'
                        : 'Drag & drop or click to choose a .csv file'
                }}
            </span>
            <input type="file" accept=".csv,text/csv" class="tw:hidden" @change="onFile" />
        </label>

        <div
            v-else
            class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:px-3 tw:py-2.5 tw:bg-navy-10 tw:rounded-lg"
        >
            <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
                <FileText class="tw:w-4 tw:h-4 tw:text-navy-60 tw:shrink-0" />
                <span class="tw:text-sm tw:text-navy-100 tw:truncate">{{ fileName }}</span>
            </div>
            <button
                class="tw:p-1 tw:text-navy-50 tw:hover:text-danger tw:transition-colors"
                @click="reset"
            >
                <X class="tw:w-4 tw:h-4" />
            </button>
        </div>

        <template v-if="parsed">
            <p v-if="validRows.length > 0" class="tw:text-sm tw:font-medium tw:text-primary">
                {{ validRows.length }} student{{ validRows.length === 1 ? '' : 's' }} ready to
                enrol.
            </p>

            <div
                v-if="rowErrors.length > 0"
                class="tw:flex tw:flex-col tw:gap-1 tw:max-h-40 tw:overflow-y-auto tw:p-3 tw:bg-red-50 tw:rounded-lg tw:border tw:border-red-100"
            >
                <p class="tw:text-xs tw:font-semibold tw:text-red-600">
                    {{ rowErrors.length }} row{{ rowErrors.length === 1 ? '' : 's' }} skipped:
                </p>
                <p v-for="(err, i) in rowErrors" :key="i" class="tw:text-xs tw:text-red-500">
                    {{ err }}
                </p>
            </div>
        </template>
    </div>

    <McDialogFooter>
        <McButton variant="outline" @click="emit('cancel')">Cancel</McButton>
        <McButton :disabled="validRows.length === 0" @click="submit">
            Import {{ validRows.length || '' }}
        </McButton>
    </McDialogFooter>
</template>
