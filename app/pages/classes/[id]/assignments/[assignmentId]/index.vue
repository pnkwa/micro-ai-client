<script setup lang="ts">
import {
    ArrowLeft,
    FileText,
    Calendar,
    ClipboardList,
    Paperclip,
    Trophy,
    Search,
    User,
    Send,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { ColumnDef, PaginationState } from '@tanstack/vue-table'
import { assignmentService, type Assignment } from '~/services/assignmentService'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import { classService, type ClassItem } from '~/services/classService'
import { getStatusVariant } from '~/core/helpers/variants'

const route = useRoute()
const router = useRouter()
const { $dayjs } = useNuxtApp()
const authStore = useAuth()

const classId = computed(() => Number(route.params.id))
const assignmentId = computed(() => Number(route.params.assignmentId))

const assignment = ref<Assignment | null>(null)
const classItem = ref<ClassItem | null>(null)
const submissions = ref<SubmissionView[]>([])
const isLoadingAssignment = ref(false)
const isLoadingSubmissions = ref(false)

const loadAssignment = async () => {
    isLoadingAssignment.value = true
    try {
        assignment.value = await assignmentService.getById(assignmentId.value)
    } catch {
        toast.error('Failed to load assignment')
    } finally {
        isLoadingAssignment.value = false
    }
}

const loadClass = async () => {
    try {
        classItem.value = await classService.getById(classId.value)
    } catch {
        // breadcrumb fallback only — non-critical
    }
}

const loadSubmissions = async () => {
    isLoadingSubmissions.value = true
    try {
        submissions.value = await submissionService.listByAssignment(assignmentId.value)
    } catch {
        toast.error('Failed to load submissions')
    } finally {
        isLoadingSubmissions.value = false
    }
}

await Promise.all([loadAssignment(), loadClass()])

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([
    { label: 'Classes', to: '/classes' },
    { label: classItem.value?.name ?? 'Class', to: `/classes/${classId.value}` },
    { label: assignment.value?.name ?? 'Assignment' },
])

const isStudent = computed(() => authStore.user?.user_type === 'student' || !authStore.user)

const activeTab = ref<'detail' | 'exercises' | 'submissions'>('detail')
const isSubmitDialogOpen = ref(false)
const searchQuery = ref('')
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 10 })

const onTabChange = async (tab: 'detail' | 'exercises' | 'submissions') => {
    activeTab.value = tab
    if (tab === 'submissions' && submissions.value.length === 0) {
        await loadSubmissions()
    }
}

// ---- exercises / questions CRUD state ----

const showAddExercise = ref(false)
const addExerciseForm = reactive({ title: '', instructions: '' })
const editingExerciseId = ref<number | null>(null)
const editExerciseForm = reactive({ title: '', instructions: '' })

const addingQuestionExerciseId = ref<number | null>(null)
const addQuestionForm = reactive({
    type: 'fill_in',
    prompt: '',
    options: '',
    accepted_answers: '',
    points: '',
})
const editingQuestionId = ref<number | null>(null)
const editQuestionForm = reactive({
    prompt: '',
    options: '',
    accepted_answers: '',
    points: '',
})

const splitLines = (s: string) =>
    s
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)

const choiceTypes = new Set(['multiple_choice', 'multiple_select'])

const startEditExercise = (ex: { id: number; title: string; instructions: string | null }) => {
    editingExerciseId.value = ex.id
    editExerciseForm.title = ex.title
    editExerciseForm.instructions = ex.instructions ?? ''
}

const startEditQuestion = (q: {
    id: number
    prompt: string
    options: string[]
    accepted_answers?: string[]
    points?: number | null
}) => {
    editingQuestionId.value = q.id
    editQuestionForm.prompt = q.prompt
    editQuestionForm.options = q.options.join('\n')
    editQuestionForm.accepted_answers = (q.accepted_answers ?? []).join('\n')
    editQuestionForm.points = q.points != null ? String(q.points) : ''
}

const handleAddExercise = async () => {
    if (!addExerciseForm.title.trim()) return
    try {
        await assignmentService.addExercise(assignmentId.value, {
            title: addExerciseForm.title.trim(),
            instructions: addExerciseForm.instructions.trim() || undefined,
        })
        await loadAssignment()
        showAddExercise.value = false
        addExerciseForm.title = ''
        addExerciseForm.instructions = ''
    } catch {
        toast.error('Failed to add exercise')
    }
}

const handleUpdateExercise = async (exerciseId: number) => {
    try {
        await assignmentService.updateExercise(exerciseId, {
            title: editExerciseForm.title.trim(),
            instructions: editExerciseForm.instructions.trim() || undefined,
        })
        await loadAssignment()
        editingExerciseId.value = null
    } catch {
        toast.error('Failed to update exercise')
    }
}

const handleRemoveExercise = async (exerciseId: number) => {
    try {
        await assignmentService.removeExercise(exerciseId)
        await loadAssignment()
    } catch {
        toast.error('Failed to delete exercise')
    }
}

const handleAddQuestion = async (exerciseId: number) => {
    if (!addQuestionForm.prompt.trim()) return
    try {
        await assignmentService.addQuestion(exerciseId, {
            type: addQuestionForm.type,
            prompt: addQuestionForm.prompt.trim(),
            options: choiceTypes.has(addQuestionForm.type)
                ? splitLines(addQuestionForm.options)
                : undefined,
            accepted_answers: splitLines(addQuestionForm.accepted_answers),
            points: addQuestionForm.points ? Number(addQuestionForm.points) : undefined,
        })
        await loadAssignment()
        addingQuestionExerciseId.value = null
        addQuestionForm.type = 'fill_in'
        addQuestionForm.prompt = ''
        addQuestionForm.options = ''
        addQuestionForm.accepted_answers = ''
        addQuestionForm.points = ''
    } catch {
        toast.error('Failed to add question')
    }
}

const handleUpdateQuestion = async (questionId: number, questionType: string) => {
    try {
        await assignmentService.updateQuestion(questionId, {
            prompt: editQuestionForm.prompt.trim(),
            options: choiceTypes.has(questionType)
                ? splitLines(editQuestionForm.options)
                : undefined,
            accepted_answers: splitLines(editQuestionForm.accepted_answers),
            points: editQuestionForm.points ? Number(editQuestionForm.points) : undefined,
        })
        await loadAssignment()
        editingQuestionId.value = null
    } catch {
        toast.error('Failed to update question')
    }
}

const handleRemoveQuestion = async (questionId: number) => {
    try {
        await assignmentService.removeQuestion(questionId)
        await loadAssignment()
    } catch {
        toast.error('Failed to delete question')
    }
}

const studentFullName = (s: SubmissionView) =>
    s.student ? `${s.student.user.firstname} ${s.student.user.lastname}` : s.student_id

const filteredSubmissions = computed(() => {
    if (!searchQuery.value) return submissions.value
    const q = searchQuery.value.toLowerCase()
    return submissions.value.filter((s) => studentFullName(s).toLowerCase().includes(q))
})

watch(searchQuery, () => {
    pagination.value = { ...pagination.value, pageIndex: 0 }
})

const submissionScore = (s: SubmissionView): number | null => {
    if (s.score === null || s.score === undefined) return null
    const points = assignment.value?.points
    if (!points) return null
    return Math.round((s.score / points) * 100)
}

const columns: ColumnDef<SubmissionView>[] = [
    { accessorKey: 'studentName', header: 'Student' },
    { accessorKey: 'submitted_at', header: 'Submitted' },
    { accessorKey: 'quality', header: () => h('div', { class: 'tw:text-center' }, 'Score') },
    { accessorKey: 'status', header: () => h('div', { class: 'tw:text-center' }, 'Status') },
    { accessorKey: 'actions', header: () => h('div', { class: 'tw:text-center' }, 'Actions') },
]

const formatDate = (date: string) => $dayjs(date).format('MMM D, YYYY')
const formatDateTime = (date: string) => $dayjs(date).format('MMM D, h:mm A')

function getScoreColor(score: number) {
    if (score >= 70) return { bar: 'tw:bg-emerald-500', text: 'tw:text-emerald-600' }
    if (score >= 40) return { bar: 'tw:bg-amber-400', text: 'tw:text-amber-600' }
    return { bar: 'tw:bg-red-400', text: 'tw:text-red-600' }
}
</script>

<template>
    <div>
        <div
            v-if="isLoadingAssignment"
            class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60"
        >
            Loading…
        </div>

        <template v-else-if="assignment">
            <!-- Header -->
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-6">
                <div class="tw:flex tw:items-center tw:gap-3">
                    <button
                        class="tw:flex tw:items-center tw:gap-1.5 tw:text-navy-60 tw:hover:text-primary tw:transition-colors"
                        @click="router.push(`/classes/${classId}`)"
                    >
                        <ArrowLeft class="tw:w-4 tw:h-4" />
                    </button>
                    <div class="tw:flex tw:items-center tw:gap-3">
                        <div
                            class="tw:w-10 tw:h-10 tw:flex tw:items-center tw:justify-center tw:bg-primary/10 tw:rounded-lg"
                        >
                            <FileText class="tw:w-5 tw:h-5 tw:text-primary" />
                        </div>
                        <div>
                            <h1 class="tw:text-xl tw:font-bold tw:text-primary tw:leading-tight">
                                {{ assignment.name }}
                            </h1>
                            <p class="tw:text-xs tw:text-navy-60">
                                Due {{ formatDate(assignment.due_date) }}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="tw:flex tw:items-center tw:gap-2">
                    <McBadge :variant="assignment.status === 'active' ? 'default' : 'outline'">
                        {{ assignment.status === 'active' ? 'Active' : 'Closed' }}
                    </McBadge>
                    <McButton
                        v-if="assignment.status === 'active' && isStudent"
                        @click="isSubmitDialogOpen = true"
                    >
                        <Send class="tw:w-4 tw:h-4 tw:mr-1" />
                        Submit
                    </McButton>
                </div>
            </div>

            <!-- Tabs -->
            <div class="tw:flex tw:border-b tw:border-navy-10 tw:mb-6">
                <button
                    v-for="tab in [
                        { value: 'detail', label: 'Detail' },
                        {
                            value: 'exercises',
                            label: `Exercises (${assignment.exercises.length})`,
                        },
                        {
                            value: 'submissions',
                            label: `Submissions (${submissions.length})`,
                        },
                    ]"
                    :key="tab.value"
                    class="tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:border-b-2 tw:-mb-px tw:transition-colors"
                    :class="
                        activeTab === tab.value
                            ? 'tw:border-primary tw:text-primary'
                            : 'tw:border-transparent tw:text-navy-60 tw:hover:text-navy-100'
                    "
                    @click="onTabChange(tab.value as 'detail' | 'exercises' | 'submissions')"
                >
                    {{ tab.label }}
                </button>
            </div>

            <!-- Detail Tab -->
            <template v-if="activeTab === 'detail'">
                <div class="tw:grid tw:grid-cols-2 tw:gap-4 tw:mb-4">
                    <div
                        class="tw:flex tw:items-center tw:gap-4 tw:p-4 tw:bg-white tw:rounded-md tw:border tw:border-gray-200"
                    >
                        <Calendar class="tw:w-5 tw:h-5 tw:text-navy-60" />
                        <div>
                            <p class="tw:text-sm tw:text-navy-60">Due Date</p>
                            <p class="tw:text-base tw:font-medium">
                                {{ formatDate(assignment.due_date) }}
                            </p>
                        </div>
                    </div>
                    <div
                        v-if="assignment.points"
                        class="tw:flex tw:items-center tw:gap-4 tw:p-4 tw:bg-white tw:rounded-md tw:border tw:border-gray-200"
                    >
                        <Trophy class="tw:w-5 tw:h-5 tw:text-navy-60" />
                        <div>
                            <p class="tw:text-sm tw:text-navy-60">Points</p>
                            <p class="tw:text-base tw:font-medium">{{ assignment.points }} pts</p>
                        </div>
                    </div>
                </div>

                <div
                    v-if="assignment.description"
                    class="tw:bg-white tw:rounded-md tw:border tw:border-gray-200 tw:p-6 tw:mb-4"
                >
                    <h2 class="tw:text-base tw:font-semibold tw:text-navy-100 tw:mb-3">
                        Description
                    </h2>
                    <p class="tw:text-sm tw:leading-relaxed tw:text-navy-80">
                        {{ assignment.description }}
                    </p>
                </div>

                <div
                    v-if="assignment.instructions"
                    class="tw:bg-white tw:rounded-md tw:border tw:border-gray-200 tw:p-6 tw:mb-4"
                >
                    <h2
                        class="tw:flex tw:items-center tw:gap-2 tw:text-base tw:font-semibold tw:text-navy-100 tw:mb-3"
                    >
                        <ClipboardList class="tw:w-5 tw:h-5" />
                        Instructions
                    </h2>
                    <div class="tw:text-sm tw:leading-loose tw:text-navy-80">
                        <p
                            v-for="(line, i) in assignment.instructions.split('\n')"
                            :key="i"
                            class="tw:mb-1 last:tw:mb-0"
                        >
                            {{ line }}
                        </p>
                    </div>
                </div>

                <div
                    v-if="assignment.attachments.length > 0"
                    class="tw:bg-white tw:rounded-md tw:border tw:border-gray-200 tw:p-6"
                >
                    <h2
                        class="tw:flex tw:items-center tw:gap-2 tw:text-base tw:font-semibold tw:text-navy-100 tw:mb-3"
                    >
                        <Paperclip class="tw:w-5 tw:h-5" />
                        Attachments
                    </h2>
                    <div class="tw:flex tw:flex-col tw:gap-2">
                        <a
                            v-for="att in assignment.attachments"
                            :key="att.id"
                            :href="att.path"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="tw:flex tw:items-center tw:gap-2 tw:p-2 tw:bg-gray-50 tw:rounded-md tw:hover:bg-gray-100"
                        >
                            <FileText class="tw:w-4 tw:h-4 tw:text-primary" />
                            <span class="tw:text-sm">{{ att.filename }}</span>
                        </a>
                    </div>
                </div>
            </template>

            <!-- Exercises Tab -->
            <template v-else-if="activeTab === 'exercises'">
                <div class="tw:flex tw:flex-col tw:gap-4">
                    <div
                        v-for="ex in assignment.exercises"
                        :key="ex.id"
                        class="tw:bg-white tw:border tw:border-gray-200 tw:rounded-md tw:p-4"
                    >
                        <!-- Exercise header -->
                        <template v-if="editingExerciseId === ex.id">
                            <div class="tw:flex tw:flex-col tw:gap-2 tw:mb-3">
                                <input
                                    v-model="editExerciseForm.title"
                                    placeholder="Exercise title"
                                    class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm tw:w-full"
                                />
                                <textarea
                                    v-model="editExerciseForm.instructions"
                                    placeholder="Instructions (optional)"
                                    rows="2"
                                    class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm tw:w-full"
                                />
                                <div class="tw:flex tw:gap-2">
                                    <button
                                        class="tw:text-xs tw:px-3 tw:py-1 tw:bg-primary tw:text-white tw:rounded"
                                        @click="handleUpdateExercise(ex.id)"
                                    >
                                        Save
                                    </button>
                                    <button
                                        class="tw:text-xs tw:px-3 tw:py-1 tw:border tw:border-gray-300 tw:rounded"
                                        @click="editingExerciseId = null"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </template>
                        <template v-else>
                            <div class="tw:flex tw:items-start tw:justify-between tw:mb-3">
                                <div>
                                    <p class="tw:font-medium tw:text-sm tw:text-navy-100">
                                        {{ ex.title }}
                                    </p>
                                    <p
                                        v-if="ex.instructions"
                                        class="tw:text-xs tw:text-navy-60 tw:mt-0.5"
                                    >
                                        {{ ex.instructions }}
                                    </p>
                                </div>
                                <div v-if="!isStudent" class="tw:flex tw:gap-2 tw:shrink-0">
                                    <button
                                        class="tw:text-xs tw:text-navy-60 tw:hover:text-primary"
                                        @click="startEditExercise(ex)"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        class="tw:text-xs tw:text-red-500 tw:hover:text-red-700"
                                        @click="handleRemoveExercise(ex.id)"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </template>

                        <!-- Questions list -->
                        <div class="tw:flex tw:flex-col tw:gap-2 tw:pl-3 tw:border-l tw:border-gray-100">
                            <div
                                v-for="q in ex.questions"
                                :key="q.id"
                                class="tw:text-sm"
                            >
                                <template v-if="editingQuestionId === q.id">
                                    <div class="tw:flex tw:flex-col tw:gap-2 tw:p-2 tw:bg-gray-50 tw:rounded">
                                        <textarea
                                            v-model="editQuestionForm.prompt"
                                            placeholder="Question prompt"
                                            rows="2"
                                            class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm tw:w-full"
                                        />
                                        <template v-if="choiceTypes.has(q.type)">
                                            <textarea
                                                v-model="editQuestionForm.options"
                                                placeholder="Options (one per line)"
                                                rows="3"
                                                class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm tw:w-full"
                                            />
                                        </template>
                                        <textarea
                                            v-model="editQuestionForm.accepted_answers"
                                            placeholder="Accepted answers (one per line)"
                                            rows="2"
                                            class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm tw:w-full"
                                        />
                                        <input
                                            v-model="editQuestionForm.points"
                                            type="number"
                                            placeholder="Points (optional)"
                                            class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm tw:w-32"
                                        />
                                        <div class="tw:flex tw:gap-2">
                                            <button
                                                class="tw:text-xs tw:px-3 tw:py-1 tw:bg-primary tw:text-white tw:rounded"
                                                @click="handleUpdateQuestion(q.id, q.type)"
                                            >
                                                Save
                                            </button>
                                            <button
                                                class="tw:text-xs tw:px-3 tw:py-1 tw:border tw:border-gray-300 tw:rounded"
                                                @click="editingQuestionId = null"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </template>
                                <template v-else>
                                    <div class="tw:flex tw:items-start tw:justify-between tw:py-1">
                                        <div>
                                            <span class="tw:text-navy-100">{{ q.prompt }}</span>
                                            <span
                                                class="tw:ml-2 tw:text-xs tw:text-navy-40 tw:font-mono"
                                            >
                                                {{ q.type }}
                                            </span>
                                            <span
                                                v-if="q.points"
                                                class="tw:ml-1 tw:text-xs tw:text-navy-40"
                                            >
                                                · {{ q.points }}pt
                                            </span>
                                        </div>
                                        <div v-if="!isStudent" class="tw:flex tw:gap-2 tw:shrink-0 tw:ml-4">
                                            <button
                                                class="tw:text-xs tw:text-navy-60 tw:hover:text-primary"
                                                @click="startEditQuestion(q)"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                class="tw:text-xs tw:text-red-500 tw:hover:text-red-700"
                                                @click="handleRemoveQuestion(q.id)"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </template>
                            </div>

                            <!-- Add question form -->
                            <template v-if="addingQuestionExerciseId === ex.id">
                                <div class="tw:flex tw:flex-col tw:gap-2 tw:mt-2 tw:p-2 tw:bg-gray-50 tw:rounded">
                                    <select
                                        v-model="addQuestionForm.type"
                                        class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm"
                                    >
                                        <option value="fill_in">Fill In</option>
                                        <option value="multiple_choice">Multiple Choice</option>
                                        <option value="multiple_select">Multiple Select</option>
                                        <option value="image_detection">Image Detection</option>
                                    </select>
                                    <textarea
                                        v-model="addQuestionForm.prompt"
                                        placeholder="Question prompt"
                                        rows="2"
                                        class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm tw:w-full"
                                    />
                                    <template v-if="choiceTypes.has(addQuestionForm.type)">
                                        <textarea
                                            v-model="addQuestionForm.options"
                                            placeholder="Options (one per line)"
                                            rows="3"
                                            class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm tw:w-full"
                                        />
                                    </template>
                                    <textarea
                                        v-model="addQuestionForm.accepted_answers"
                                        placeholder="Accepted answers (one per line)"
                                        rows="2"
                                        class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm tw:w-full"
                                    />
                                    <input
                                        v-model="addQuestionForm.points"
                                        type="number"
                                        placeholder="Points (optional)"
                                        class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm tw:w-32"
                                    />
                                    <div class="tw:flex tw:gap-2">
                                        <button
                                            class="tw:text-xs tw:px-3 tw:py-1 tw:bg-primary tw:text-white tw:rounded"
                                            @click="handleAddQuestion(ex.id)"
                                        >
                                            Add Question
                                        </button>
                                        <button
                                            class="tw:text-xs tw:px-3 tw:py-1 tw:border tw:border-gray-300 tw:rounded"
                                            @click="addingQuestionExerciseId = null"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </template>
                            <button
                                v-else-if="!isStudent"
                                class="tw:text-xs tw:text-navy-50 tw:hover:text-primary tw:text-left tw:mt-1"
                                @click="addingQuestionExerciseId = ex.id"
                            >
                                + Add Question
                            </button>
                        </div>
                    </div>

                    <!-- Add exercise -->
                    <template v-if="!isStudent">
                        <template v-if="showAddExercise">
                            <div class="tw:bg-white tw:border tw:border-gray-200 tw:rounded-md tw:p-4 tw:flex tw:flex-col tw:gap-2">
                                <input
                                    v-model="addExerciseForm.title"
                                    placeholder="Exercise title"
                                    class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm tw:w-full"
                                />
                                <textarea
                                    v-model="addExerciseForm.instructions"
                                    placeholder="Instructions (optional)"
                                    rows="2"
                                    class="tw:border tw:border-gray-300 tw:rounded tw:px-2 tw:py-1 tw:text-sm tw:w-full"
                                />
                                <div class="tw:flex tw:gap-2">
                                    <button
                                        class="tw:text-xs tw:px-3 tw:py-1 tw:bg-primary tw:text-white tw:rounded"
                                        @click="handleAddExercise"
                                    >
                                        Add Exercise
                                    </button>
                                    <button
                                        class="tw:text-xs tw:px-3 tw:py-1 tw:border tw:border-gray-300 tw:rounded"
                                        @click="showAddExercise = false"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </template>
                        <button
                            v-else
                            class="tw:text-sm tw:text-navy-50 tw:hover:text-primary tw:text-left"
                            @click="showAddExercise = true"
                        >
                            + Add Exercise
                        </button>
                    </template>

                    <p
                        v-if="assignment.exercises.length === 0 && isStudent"
                        class="tw:text-sm tw:text-navy-50 tw:py-8 tw:text-center"
                    >
                        No exercises yet.
                    </p>
                </div>
            </template>

            <!-- Submissions Tab -->
            <template v-else-if="activeTab === 'submissions'">
                <div class="tw:flex tw:items-center tw:justify-between tw:mb-4">
                    <span class="tw:text-sm tw:text-navy-60">
                        {{ filteredSubmissions.length }} submission{{
                            filteredSubmissions.length !== 1 ? 's' : ''
                        }}
                    </span>
                    <div
                        class="tw:flex tw:items-center tw:gap-2 tw:bg-white tw:border tw:border-slate-200 tw:rounded-md tw:px-3 tw:py-2 tw:w-64"
                    >
                        <Search class="tw:w-3.5 tw:h-3.5 tw:text-slate-400 tw:shrink-0" />
                        <input
                            v-model="searchQuery"
                            type="text"
                            placeholder="Search student..."
                            class="tw:outline-none tw:w-full tw:text-sm tw:text-slate-700 tw:placeholder-slate-400 tw:bg-transparent"
                        />
                    </div>
                </div>

                <div
                    v-if="isLoadingSubmissions"
                    class="tw:py-16 tw:text-center tw:text-sm tw:text-navy-60"
                >
                    Loading submissions…
                </div>

                <div v-else class="tw:bg-white tw:p-6 tw:border tw:border-navy-10 tw:rounded-md">
                    <McDataTable
                        v-model:pagination="pagination"
                        :columns="columns"
                        :data="filteredSubmissions"
                        :total="filteredSubmissions.length"
                    >
                        <template #body-studentName="{ row }">
                            <div class="tw:flex tw:items-center tw:gap-2.5">
                                <div
                                    class="tw:w-8 tw:h-8 tw:rounded-full tw:bg-navy-10 tw:border tw:border-navy-20 tw:flex tw:items-center tw:justify-center tw:shrink-0"
                                >
                                    <User class="tw:w-4 tw:h-4 tw:text-navy-60" />
                                </div>
                                <div class="tw:flex tw:flex-col">
                                    <span class="tw:text-sm tw:font-medium tw:text-navy-100">
                                        {{ studentFullName(row.original) }}
                                    </span>
                                    <span class="tw:text-xs tw:text-navy-50">
                                        {{ row.original.student_id }}
                                    </span>
                                </div>
                            </div>
                        </template>

                        <template #body-submitted_at="{ row }">
                            <span class="tw:text-sm tw:text-slate-500">
                                {{ formatDateTime(row.original.submitted_at) }}
                            </span>
                        </template>

                        <template #body-quality="{ row }">
                            <div class="tw:flex tw:items-center tw:justify-center tw:gap-2.5">
                                <template v-if="submissionScore(row.original) !== null">
                                    <div
                                        class="tw:w-14 tw:h-1.5 tw:bg-slate-100 tw:rounded-md tw:overflow-hidden tw:shrink-0"
                                    >
                                        <div
                                            class="tw:h-full tw:rounded-md tw:transition-all"
                                            :class="
                                                getScoreColor(submissionScore(row.original)!).bar
                                            "
                                            :style="{
                                                width: `${submissionScore(row.original)}%`,
                                            }"
                                        />
                                    </div>
                                    <span
                                        class="tw:text-xs tw:font-semibold tw:tabular-nums"
                                        :class="
                                            getScoreColor(submissionScore(row.original)!).text
                                        "
                                    >
                                        {{ submissionScore(row.original) }}%
                                    </span>
                                </template>
                                <span v-else class="tw:text-xs tw:text-navy-40">—</span>
                            </div>
                        </template>

                        <template #body-status="{ row }">
                            <McBadge
                                :variant="getStatusVariant(row.original.status)"
                                class="tw:capitalize"
                            >
                                {{ row.original.status }}
                            </McBadge>
                        </template>

                        <template #body-actions="{ row }">
                            <NuxtLink
                                :to="`/classes/${classId}/assignments/${assignmentId}/submissions/${row.original.id}`"
                            >
                                <McButton
                                    variant="outline"
                                    size="sm"
                                    class="tw:text-xs tw:h-7 tw:border-slate-200 tw:text-primary tw:hover:bg-primary/5 tw:hover:border-primary/30"
                                >
                                    Review
                                </McButton>
                            </NuxtLink>
                        </template>
                    </McDataTable>
                </div>
            </template>
        </template>

        <div v-else class="tw:text-center tw:py-16 tw:text-navy-60">Assignment not found.</div>

        <!-- Submit dialog placeholder — wired in Phase 4 (submissions) -->
        <McDialog v-model:open="isSubmitDialogOpen">
            <McDialogContent class="tw:sm:max-w-xl">
                <div class="tw:p-6 tw:text-center tw:text-navy-60 tw:text-sm">
                    Submit assignment — coming soon
                </div>
            </McDialogContent>
        </McDialog>
    </div>
</template>
