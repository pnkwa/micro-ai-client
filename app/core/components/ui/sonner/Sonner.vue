<script lang="ts" setup>
import type { ToasterProps } from 'vue-sonner'
import {
    CircleCheckIcon,
    InfoIcon,
    Loader2Icon,
    OctagonXIcon,
    TriangleAlertIcon,
    XIcon,
} from 'lucide-vue-next'
import { Toaster as Sonner } from 'vue-sonner'
import { cn } from '@/core/lib/utils'

const props = withDefaults(defineProps<ToasterProps>(), {
    richColors: true,
    closeButton: true,
})
</script>

<template>
    <Sonner
        :class="cn('tw:toaster tw:group', props.class)"
        :style="{
            '--normal-bg': 'var(--popover)',
            '--normal-text': 'var(--popover-foreground)',
            '--normal-border': 'var(--border)',
            '--border-radius': 'var(--radius)',
            // Rich colors themed to the app's tag palette (hex, since some tag CSS vars
            // are tree-shaken out of :root when otherwise unused).
            '--success-bg': '#c9f6df',
            '--success-text': '#187a41',
            '--success-border': '#64e8a4',
            '--error-bg': '#fde2e5',
            '--error-text': '#e5172f',
            '--error-border': '#ff96a3',
            '--warning-bg': '#ffebb5',
            '--warning-text': '#e07000',
            '--warning-border': '#ffc53d',
            '--info-bg': '#d5edff',
            '--info-text': '#095796',
            '--info-border': '#78cbff',
        }"
        v-bind="props"
    >
        <template #success-icon>
            <CircleCheckIcon class="tw:size-4" />
        </template>
        <template #info-icon>
            <InfoIcon class="tw:size-4" />
        </template>
        <template #warning-icon>
            <TriangleAlertIcon class="tw:size-4" />
        </template>
        <template #error-icon>
            <OctagonXIcon class="tw:size-4" />
        </template>
        <template #loading-icon>
            <div>
                <Loader2Icon class="tw:size-4 tw:animate-spin" />
            </div>
        </template>
        <template #close-icon>
            <XIcon class="tw:size-4" />
        </template>
    </Sonner>
</template>
