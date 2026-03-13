<template>
    <div class="tw:flex tw:h-full tw:gap-4 tw:p-4 tw:bg-slate-50 tw:overflow-hidden">
        <!-- ── LEFT: Image Viewer ── -->
        <div
            class="tw:flex-1 tw:flex tw:flex-col tw:bg-white tw:rounded-md tw:border tw:border-slate-200 tw:overflow-hidden tw:min-w-0"
        >
            <!-- Student Info Header -->
            <div
                class="tw:flex tw:items-center tw:justify-between tw:px-5 tw:py-3.5 tw:border-b tw:border-slate-100"
            >
                <div class="tw:flex tw:items-center tw:gap-3">
                    <div
                        class="tw:w-9 tw:h-9 tw:rounded-full tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:text-primary tw:font-bold tw:text-sm tw:shrink-0"
                    >
                        SK
                    </div>
                    <div>
                        <div class="tw:flex tw:items-center tw:gap-2">
                            <span class="tw:font-semibold tw:text-slate-900 tw:text-sm">
                                Sarah Kim
                            </span>
                            <span class="tw:text-xs tw:text-slate-400">65200001</span>
                            <!-- Pending badge removed -->
                        </div>
                        <div class="tw:text-xs tw:text-slate-400 tw:mt-0.5">
                            Gram Stain Analysis · Microbiology Lab · Feb 15, 2:34 PM
                        </div>
                    </div>
                </div>
                <div class="tw:flex tw:items-center tw:gap-2">
                    <McButton
                        variant="outline"
                        size="sm"
                        class="tw:text-xs tw:h-7 tw:border-slate-200 tw:text-slate-500"
                    >
                        Download
                    </McButton>
                </div>
            </div>

            <!-- Toolbar -->
            <div
                class="tw:flex tw:items-center tw:justify-between tw:px-4 tw:py-2 tw:border-b tw:border-slate-100 tw:bg-slate-50/60"
            >
                <span class="tw:text-[11px] tw:text-slate-400">submission_gram_stain.jpg</span>
                <div class="tw:flex tw:items-center tw:gap-1">
                    <McButton variant="ghost" size="icon" class="tw:w-7 tw:h-7 tw:text-slate-400">
                        ＋
                    </McButton>
                    <McButton variant="ghost" size="icon" class="tw:w-7 tw:h-7 tw:text-slate-400">
                        －
                    </McButton>
                    <McButton variant="ghost" size="icon" class="tw:w-7 tw:h-7 tw:text-slate-400">
                        ⟳
                    </McButton>
                    <McButton variant="ghost" size="icon" class="tw:w-7 tw:h-7 tw:text-slate-400">
                        ⛶
                    </McButton>
                    <div class="tw:w-px tw:h-4 tw:bg-slate-200 tw:mx-1"></div>
                    <label
                        class="tw:flex tw:items-center tw:gap-2 tw:cursor-pointer tw:select-none"
                    >
                        <div
                            class="tw:relative tw:w-8 tw:h-4.5 tw:rounded-full tw:transition-colors tw:duration-200 tw:cursor-pointer"
                            :class="showAIDetection ? 'tw:bg-primary' : 'tw:bg-slate-200'"
                            @click="showAIDetection = !showAIDetection"
                        >
                            <div
                                class="tw:absolute tw:top-0.5 tw:w-3.5 tw:h-3.5 tw:rounded-full tw:bg-white tw:shadow-sm tw:transition-all tw:duration-200"
                                :class="showAIDetection ? 'tw:left-4' : 'tw:left-0.5'"
                            ></div>
                        </div>
                        <span class="tw:text-[11px] tw:text-slate-500">AI Detection</span>
                    </label>
                </div>
            </div>

            <!-- Image -->
            <div
                class="tw:relative tw:flex-1 tw:bg-slate-950 tw:flex tw:items-center tw:justify-center tw:overflow-hidden"
            >
                <img
                    :src="fileUrl"
                    alt="Microscope Submission"
                    class="tw:max-h-full tw:max-w-full tw:object-contain"
                />
                <template v-if="showAIDetection">
                    <div
                        v-for="box in aiBoxes"
                        :key="box.id"
                        :style="box.style"
                        class="tw:absolute tw:border-2 tw:rounded"
                        :class="box.color"
                    >
                        <span
                            class="tw:absolute tw:-top-5 tw:left-0 tw:px-1.5 tw:py-0.5 tw:rounded tw:text-[10px] tw:font-semibold tw:whitespace-nowrap"
                            :class="box.labelColor"
                        >
                            {{ box.label }} · {{ box.confidence }}%
                        </span>
                    </div>
                </template>
            </div>

            <!-- Legend -->
            <div
                class="tw:flex tw:items-center tw:gap-5 tw:px-5 tw:py-2.5 tw:border-t tw:border-slate-100 tw:bg-slate-50/60"
            >
                <div
                    v-for="box in aiBoxes"
                    :key="box.id"
                    class="tw:flex tw:items-center tw:gap-1.5 tw:text-[11px] tw:text-slate-500"
                >
                    <span
                        class="tw:inline-block tw:w-2.5 tw:h-2.5 tw:rounded-sm tw:border-2"
                        :class="box.color"
                    ></span>
                    {{ box.label }}
                </div>
            </div>
        </div>

        <!-- ── RIGHT: Analysis + Grading ── -->
        <div class="tw:w-100 tw:shrink-0 tw:flex tw:flex-col tw:gap-3 tw:overflow-y-auto tw:pb-1">
            <!-- AI Detection Summary -->
            <div class="tw:bg-white tw:rounded-md tw:border tw:border-slate-200 tw:overflow-hidden">
                <div class="tw:px-4 tw:py-3 tw:border-b tw:border-slate-100">
                    <span class="tw:text-xs tw:font-semibold tw:text-slate-700">
                        Detection Summary
                    </span>
                </div>
                <div class="tw:divide-y tw:divide-slate-100">
                    <div
                        v-for="item in detectionSummary"
                        :key="item.label"
                        class="tw:flex tw:items-center tw:justify-between tw:px-4 tw:py-2.5"
                    >
                        <span class="tw:text-xs tw:text-slate-600">{{ item.label }}</span>
                        <div class="tw:flex tw:items-center tw:gap-2">
                            <span
                                class="tw:text-xs tw:font-bold tw:px-2 tw:py-0.5 tw:rounded-full tw:min-w-6 tw:text-center"
                                :class="
                                    item.count > 0
                                        ? 'tw:bg-primary/10 tw:text-primary'
                                        : 'tw:bg-slate-100 tw:text-slate-400'
                                "
                            >
                                {{ item.count }}
                            </span>
                            <span class="tw:text-[10px] tw:text-slate-400 tw:w-12">
                                {{ item.count > 0 ? `avg ${item.avg}%` : '—' }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- AI Diagnosis -->
            <div class="tw:bg-white tw:rounded-md tw:border tw:border-slate-200 tw:overflow-hidden">
                <div class="tw:px-4 tw:py-3 tw:border-b tw:border-slate-100">
                    <span class="tw:text-xs tw:font-semibold tw:text-slate-700">AI Diagnosis</span>
                </div>
                <div class="tw:p-4">
                    <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
                        <span class="tw:text-sm tw:font-semibold tw:text-red-600">
                            Bacterial Vaginosis (BV)
                        </span>
                        <span class="tw:text-sm tw:font-bold tw:text-red-600">92%</span>
                    </div>
                    <div class="tw:w-full tw:bg-red-100 tw:rounded-full tw:h-1 tw:mb-2.5">
                        <div class="tw:bg-red-500 tw:h-1 tw:rounded-full" style="width: 92%"></div>
                    </div>
                    <p class="tw:text-[10px] tw:text-slate-400 tw:leading-relaxed">
                        AI suggestions only — verify before grading.
                    </p>
                </div>
            </div>

            <!-- Image Quality -->
            <div class="tw:bg-white tw:rounded-md tw:border tw:border-slate-200 tw:overflow-hidden">
                <div class="tw:px-4 tw:py-3 tw:border-b tw:border-slate-100">
                    <span class="tw:text-xs tw:font-semibold tw:text-slate-700">Image Quality</span>
                </div>
                <div class="tw:p-4 tw:flex tw:flex-col tw:gap-3">
                    <div v-for="q in qualityMetrics" :key="q.label">
                        <div class="tw:flex tw:justify-between tw:items-center tw:mb-1.5">
                            <span class="tw:text-xs tw:text-slate-500">{{ q.label }}</span>
                            <span class="tw:text-xs tw:font-semibold tw:text-slate-700">
                                {{ q.value }}%
                            </span>
                        </div>
                        <div class="tw:w-full tw:bg-slate-100 tw:rounded-full tw:h-1">
                            <div
                                class="tw:h-1 tw:rounded-full tw:transition-all"
                                :class="q.color"
                                :style="`width:${q.value}%`"
                            ></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Grading -->
            <div class="tw:bg-white tw:rounded-md tw:border tw:border-slate-200 tw:overflow-hidden">
                <div class="tw:px-4 tw:py-3 tw:border-b tw:border-slate-100">
                    <span class="tw:text-xs tw:font-semibold tw:text-slate-700">
                        Instructor Grading
                    </span>
                </div>
                <div class="tw:p-4 tw:flex tw:flex-col tw:gap-3.5">
                    <!-- Score -->
                    <div>
                        <label
                            class="tw:text-[11px] tw:font-semibold tw:text-slate-500 tw:uppercase tw:tracking-wide tw:block tw:mb-1.5"
                        >
                            Score
                        </label>
                        <div class="tw:flex tw:items-center tw:gap-2">
                            <Input
                                v-model="score"
                                type="number"
                                min="0"
                                max="100"
                                class="tw:w-16 tw:text-center tw:font-bold tw:text-base"
                            />
                            <span class="tw:text-sm tw:text-slate-400">/ 100</span>
                            <span
                                class="tw:text-xs tw:font-bold tw:px-2.5 tw:py-1 tw:rounded-lg tw:bg-primary/10 tw:text-primary tw:ml-auto"
                            >
                                {{
                                    score >= 90
                                        ? 'A'
                                        : score >= 80
                                          ? 'B'
                                          : score >= 70
                                            ? 'C'
                                            : score >= 60
                                              ? 'D'
                                              : 'F'
                                }}
                            </span>
                        </div>
                    </div>

                    <!-- Override Diagnosis -->
                    <div>
                        <label
                            class="tw:text-[11px] tw:font-semibold tw:text-slate-500 tw:uppercase tw:tracking-wide tw:block tw:mb-1.5"
                        >
                            Override Diagnosis
                        </label>
                        <Select
                            v-model="overrideDiagnosis"
                            :options="diagnosisOptions"
                            option-label="label"
                            option-value="value"
                        />
                    </div>

                    <!-- Feedback -->
                    <div>
                        <label
                            class="tw:text-[11px] tw:font-semibold tw:text-slate-500 tw:uppercase tw:tracking-wide tw:block tw:mb-1.5"
                        >
                            Feedback
                        </label>
                        <Textarea
                            v-model="instructorFeedback"
                            placeholder="Write feedback for the student..."
                            class="tw:resize-none tw:text-sm"
                            :rows="4"
                        />
                    </div>

                    <!-- Actions -->
                    <McButton class="tw:w-full tw:text-sm tw:font-semibold">Save Grade</McButton>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Button as McButton } from '~/core/components/ui/button'
// ...existing code...
import { Input } from '~/core/components/ui/input'
import { Select } from '~/core/components/ui/select'
import { Textarea } from '~/core/components/ui/textarea'
import { ref } from 'vue'

const fileUrl = 'https://upload.wikimedia.org/wikipedia/commons/6/6e/Clue_cell.jpg'
const showAIDetection = ref(true)

const aiBoxes = [
    {
        id: 1,
        label: 'Clue Cell',
        confidence: 94,
        style: 'left:18%;top:22%;width:22%;height:18%',
        color: 'tw:border-blue-400',
        labelColor: 'tw:bg-blue-600 tw:text-white',
    },
    {
        id: 2,
        label: 'Gram-positive Rod',
        confidence: 89,
        style: 'left:55%;top:40%;width:18%;height:20%',
        color: 'tw:border-emerald-400',
        labelColor: 'tw:bg-emerald-600 tw:text-white',
    },
    {
        id: 3,
        label: 'Fungal Element',
        confidence: 77,
        style: 'left:35%;top:65%;width:15%;height:15%',
        color: 'tw:border-amber-400',
        labelColor: 'tw:bg-amber-500 tw:text-white',
    },
]

const detectionSummary = [
    { label: 'Clue Cells', count: 4, avg: 88 },
    { label: 'Gram-positive rods', count: 12, avg: 91 },
    { label: 'Fungal elements', count: 0, avg: 0 },
]

const qualityMetrics = [
    { label: 'Focus Quality', value: 85, color: 'tw:bg-blue-500' },
    { label: 'Stain Quality', value: 76, color: 'tw:bg-amber-400' },
    { label: 'Overall Quality', value: 87, color: 'tw:bg-emerald-500' },
]

const score = ref(90)
const overrideDiagnosis = ref('bv')
const instructorFeedback = ref('')
const diagnosisOptions = [
    { label: 'Healthy', value: 'healthy' },
    { label: 'Transition', value: 'transition' },
    { label: 'VVC', value: 'vvc' },
    { label: 'BV', value: 'bv' },
    { label: 'TV', value: 'tv' },
    { label: 'GU', value: 'gu' },
    { label: 'NGU', value: 'ngu' },
]
</script>
