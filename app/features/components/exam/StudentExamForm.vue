<script setup lang="ts">
import { Send, CheckCircle2, ImageUp, X, Clock, Lock } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { submissionService, type SubmissionView } from '~/services/submissionService'
import { assignmentTotalPoints } from '~/services/assignmentService'
import type { Exam } from '~/services/examService'

const props = defineProps<{
    exam: Exam
    mySubmission: SubmissionView | null
}>()
const emit = defineEmits<{ submitted: [] }>()

const { $dayjs } = useNuxtApp()

// Flatten the slide_identification questions; each is one slide "station".
let flatIndex = 0
const stations = props.exam.exercises.flatMap((ex, exIndex) =>
    ex.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        points: q.points,
        exIndex,
        index: flatIndex++,
    })),
)

// Per-station answer: the self-reported slide number and the written diagnosis. slideNumber
// is typed loosely because v-model on <input type="number"> yields a number, '' when cleared.
const answers = reactive<Record<number, { slideNumber: string | number; diagnosis: string }>>({})
const images = reactive<
    Record<number, { file: File | null; name: string; previewUrl: string | null }>
>({})
for (const s of stations) answers[s.id] = { slideNumber: '', diagnosis: '' }

const invalidIds = reactive(new Set<number>())
const submitting = ref(false)
const submitted = ref(props.mySubmission !== null)
const isGraded = computed(() => props.mySubmission?.status === 'graded')
const totalPoints = computed(() => assignmentTotalPoints(props.exam))

// ---- window gating ----
const now = ref($dayjs())
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => {
    ticker = setInterval(() => (now.value = $dayjs()), 1000)
})
onBeforeUnmount(() => {
    if (ticker) clearInterval(ticker)
    for (const entry of Object.values(images)) {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl)
    }
})

const opensAt = computed(() => (props.exam.exam_opens_at ? $dayjs(props.exam.exam_opens_at) : null))
const closesAt = computed(() =>
    props.exam.exam_closes_at ? $dayjs(props.exam.exam_closes_at) : null,
)
const windowState = computed<'before' | 'open' | 'closed'>(() => {
    if (opensAt.value && now.value.isBefore(opensAt.value)) return 'before'
    if (closesAt.value && now.value.isAfter(closesAt.value)) return 'closed'
    return 'open'
})

// mm:ss (or h:mm:ss) until close, for the live countdown.
const countdown = computed(() => {
    if (!closesAt.value) return null
    const secs = Math.max(0, closesAt.value.diff(now.value, 'second'))
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
})

const isAnswered = (id: number): boolean =>
    String(answers[id]!.slideNumber).trim() !== '' &&
    !Number.isNaN(Number(answers[id]!.slideNumber)) &&
    answers[id]!.diagnosis.trim() !== '' &&
    images[id]?.file != null

const onImage = (id: number, e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0] ?? null
    const prev = images[id]
    if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
    images[id] = {
        file,
        name: file?.name ?? '',
        previewUrl: file ? URL.createObjectURL(file) : null,
    }
    if (file) invalidIds.delete(id)
}

const removeImage = (id: number) => {
    const prev = images[id]
    if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
    delete images[id]
}

const onSubmit = async () => {
    if (windowState.value !== 'open') return
    invalidIds.clear()
    let firstUnanswered: number | null = null
    for (const s of stations) {
        if (!isAnswered(s.id)) {
            invalidIds.add(s.id)
            if (firstUnanswered === null) firstUnanswered = s.id
        }
    }
    if (firstUnanswered !== null) {
        toast.error('Complete every slide: number, diagnosis and a photo')
        document
            .getElementById(`station-${firstUnanswered}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
    }

    submitting.value = true
    try {
        const fd = new FormData()
        fd.append('assignment_id', String(props.exam.id))
        const payload = stations.map((s) => ({
            question_id: s.id,
            response_text: answers[s.id]!.diagnosis.trim(),
            slide_number: Number(answers[s.id]!.slideNumber),
        }))
        fd.append('answers', JSON.stringify(payload))
        for (const s of stations) {
            const image = images[s.id]?.file
            if (image) fd.append(`image_${s.id}`, image)
        }
        await submissionService.create(fd)
        submitted.value = true
        toast.success('Exam submitted')
        emit('submitted')
    } catch (e) {
        // The server 403s a submission outside the window even if the client clock drifted.
        toast.error(apiErrorMessage(e, 'Failed to submit exam'))
    } finally {
        submitting.value = false
    }
}
</script>

<template>
    <!-- already submitted -->
    <div
        v-if="submitted"
        class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:bg-white tw:border tw:border-primary/20 tw:rounded-lg tw:py-16 tw:text-center"
    >
        <CheckCircle2 class="tw:size-10 tw:text-primary" />
        <template v-if="isGraded">
            <p class="tw:text-lg tw:font-semibold tw:text-navy-100">Your exam has been graded</p>
            <p class="tw:text-3xl tw:font-bold tw:text-primary tw:tabular-nums">
                {{ mySubmission?.score ?? 0 }} / {{ totalPoints }}
            </p>
        </template>
        <template v-else>
            <p class="tw:text-lg tw:font-semibold tw:text-navy-100">Your exam was submitted</p>
            <p class="tw:text-sm tw:text-navy-60">
                It's final and can't be changed. Your score appears here once it's graded.
            </p>
        </template>
    </div>

    <!-- before open / after close -->
    <div
        v-else-if="windowState !== 'open'"
        class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:bg-white tw:border tw:border-navy-15 tw:rounded-lg tw:py-16 tw:text-center"
    >
        <Lock class="tw:size-8 tw:text-navy-40" />
        <p class="tw:text-lg tw:font-semibold tw:text-navy-100">
            {{ windowState === 'before' ? 'This exam has not opened yet' : 'This exam has closed' }}
        </p>
        <p v-if="windowState === 'before' && opensAt" class="tw:text-sm tw:text-navy-60">
            Opens {{ opensAt.format('MMM D, YYYY HH:mm') }}
        </p>
        <p v-else-if="windowState === 'closed' && closesAt" class="tw:text-sm tw:text-navy-60">
            Closed {{ closesAt.format('MMM D, YYYY HH:mm') }}
        </p>
    </div>

    <div
        v-else-if="stations.length === 0"
        class="tw:text-sm tw:text-navy-50 tw:py-8 tw:text-center"
    >
        No slide stations yet.
    </div>

    <!-- open: the exam form -->
    <form v-else class="tw:flex tw:flex-col tw:gap-4" @submit.prevent="onSubmit">
        <div
            v-if="countdown"
            class="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:border tw:border-warning/40 tw:bg-warning/5 tw:py-2 tw:text-sm tw:font-medium tw:text-warning"
        >
            <Clock class="tw:size-4" />
            Closes in {{ countdown }}
        </div>

        <div
            v-for="s in stations"
            :id="`station-${s.id}`"
            :key="s.id"
            class="tw:rounded-lg tw:border tw:bg-white tw:p-5 tw:transition-colors"
            :class="
                invalidIds.has(s.id) ? 'tw:border-danger/50 tw:bg-danger/5' : 'tw:border-navy-15'
            "
        >
            <p class="tw:font-medium tw:text-navy-100">
                {{ s.prompt }}
                <span class="tw:text-danger" aria-label="required">*</span>
            </p>

            <div class="tw:mt-3 tw:grid tw:grid-cols-1 tw:gap-3 tw:sm:grid-cols-[8rem_1fr]">
                <div class="tw:flex tw:flex-col tw:gap-1">
                    <label class="tw:text-xs tw:font-medium tw:text-navy-60">Slide number</label>
                    <input
                        v-model="answers[s.id]!.slideNumber"
                        type="number"
                        min="0"
                        placeholder="e.g. 4"
                        class="tw:rounded-md tw:border tw:border-navy-20 tw:px-3 tw:py-2 tw:text-sm tw:outline-none tw:focus:border-primary"
                        @input="invalidIds.delete(s.id)"
                    />
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                    <label class="tw:text-xs tw:font-medium tw:text-navy-60">Your diagnosis</label>
                    <textarea
                        v-model="answers[s.id]!.diagnosis"
                        rows="2"
                        placeholder="What is this slide?"
                        class="tw:rounded-md tw:border tw:border-navy-20 tw:px-3 tw:py-2 tw:text-sm tw:outline-none tw:focus:border-primary"
                        @input="invalidIds.delete(s.id)"
                    ></textarea>
                </div>
            </div>

            <div class="tw:mt-3">
                <div
                    v-if="images[s.id]?.file"
                    class="tw:flex tw:items-center tw:gap-3 tw:rounded-md tw:border tw:border-primary/30 tw:bg-primary/5 tw:px-3 tw:py-2"
                >
                    <img
                        :src="images[s.id]?.previewUrl ?? undefined"
                        alt=""
                        class="tw:size-10 tw:shrink-0 tw:rounded tw:border tw:border-navy-15 tw:object-cover"
                    />
                    <div class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-1.5">
                        <CheckCircle2 class="tw:size-4 tw:shrink-0 tw:text-primary" />
                        <span class="tw:truncate tw:text-sm tw:text-navy-90">
                            {{ images[s.id]?.name }}
                        </span>
                    </div>
                    <label
                        class="tw:shrink-0 tw:cursor-pointer tw:rounded tw:px-2 tw:py-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:bg-primary/10"
                    >
                        Change
                        <input
                            type="file"
                            accept="image/*"
                            class="tw:hidden"
                            @change="onImage(s.id, $event)"
                        />
                    </label>
                    <button
                        type="button"
                        aria-label="Remove photo"
                        class="tw:shrink-0 tw:cursor-pointer tw:rounded tw:p-1 tw:text-navy-50 tw:hover:bg-danger/10 tw:hover:text-danger"
                        @click="removeImage(s.id)"
                    >
                        <X class="tw:size-4" />
                    </button>
                </div>
                <label
                    v-else
                    class="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-md tw:border tw:border-navy-20 tw:px-3 tw:py-2 tw:text-sm tw:text-navy-70 tw:cursor-pointer tw:hover:border-primary tw:hover:bg-primary/5"
                >
                    <ImageUp class="tw:size-4" />
                    <span>Attach field-of-view photo</span>
                    <input
                        type="file"
                        accept="image/*"
                        class="tw:hidden"
                        @change="onImage(s.id, $event)"
                    />
                </label>
            </div>

            <p v-if="invalidIds.has(s.id)" class="tw:mt-2 tw:text-xs tw:font-medium tw:text-danger">
                Enter a slide number, a diagnosis and a photo.
            </p>
        </div>

        <div class="tw:flex tw:justify-end">
            <McButton type="submit" :loading="submitting">
                <Send class="tw:size-4 tw:mr-1.5" />
                Submit exam
            </McButton>
        </div>
    </form>
</template>
