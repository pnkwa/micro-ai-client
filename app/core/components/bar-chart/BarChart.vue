<script setup lang="ts">
import { computed } from 'vue'
import { BarChart3 } from 'lucide-vue-next'

interface ChartData {
    label: string
    value: number
}

interface Props {
    title?: string
    data: ChartData[]
    periods?: string[]
    showPeriodSelect?: boolean
    selectedPeriod?: string
    maxY?: number
}

const props = withDefaults(defineProps<Props>(), {
    title: 'Chart',
    periods: () => ['Weekly', 'Monthly'],
    showPeriodSelect: true,
    selectedPeriod: 'Weekly',
    maxY: undefined,
})

const emit = defineEmits<{
    'update:selected-period': [value: string]
}>()

const onPeriodChange = (value: unknown) => {
    if (typeof value === 'string') {
        emit('update:selected-period', value)
    }
}

const maxValue = computed(() => {
    if (props.maxY !== undefined) return props.maxY
    return Math.max(...props.data.map((date) => date.value))
})

const yAxisSteps = computed(() => {
    const max = maxValue.value || 1

    const useExactMax = props.maxY !== undefined
    const step = Math.ceil(max / 4) || 1
    const roundedMax = useExactMax ? max : Math.ceil(max / step) * step
    return [
        roundedMax,
        Math.round(roundedMax * 0.75),
        Math.round(roundedMax * 0.5),
        Math.round(roundedMax * 0.25),
    ]
})

const chartMax = computed(() => yAxisSteps.value[0] || 1)

const getBarHeight = (value: number) => {
    return `${(value / chartMax.value) * 100}%`
}
</script>

<template>
    <div class="bar-chart-container">
        <div class="chart-header">
            <div class="chart-title-row">
                <BarChart3 class="chart-icon" />
                <h3 class="chart-title">{{ title }}</h3>
            </div>
            <McSelect
                v-if="showPeriodSelect"
                :model-value="selectedPeriod"
                @update:model-value="onPeriodChange"
            >
                <McSelectTrigger size="sm">
                    <McSelectValue :placeholder="selectedPeriod" />
                </McSelectTrigger>
                <McSelectContent>
                    <McSelectItem v-for="period in periods" :key="period" :value="period">
                        {{ period }}
                    </McSelectItem>
                </McSelectContent>
            </McSelect>
        </div>
        <div class="bar-chart">
            <div class="y-axis">
                <span v-for="step in yAxisSteps" :key="step">{{ step }}</span>
            </div>
            <div class="bars-container">
                <div v-for="item in data" :key="item.label" class="bar-item">
                    <div class="bar" :style="{ height: getBarHeight(item.value) }" />
                    <span class="bar-label">{{ item.label }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.bar-chart-container {
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    border: 1px solid var(--color-navy-10);
}

.chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
}

.chart-title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.chart-icon {
    width: 20px;
    height: 20px;
    color: var(--color-navy-60);
}

.chart-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-navy-100);
}

.bar-chart {
    display: flex;
    gap: 1rem;
    height: 180px;
}

.y-axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--color-navy-50);
    padding-bottom: 1.5rem;
    min-width: 24px;
    text-align: right;
}

.bars-container {
    flex: 1;
    display: flex;
    align-items: flex-end;
    justify-content: space-around;
    gap: 0.5rem;
    border-bottom: 1px solid var(--color-navy-10);
    padding-bottom: 0.5rem;
}

.bar-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    height: 100%;
}

.bar {
    width: 100%;
    max-width: 40px;
    background: var(--color-primary);
    border-radius: 4px 4px 0 0;
    transition: height 0.3s ease;
    margin-top: auto;
}

.bar-label {
    font-size: 0.75rem;
    color: var(--color-navy-60);
    margin-top: 0.5rem;
}
</style>
