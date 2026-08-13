<script setup lang="ts">
import { Users } from '@lucide/vue'

/**
 * The "who submitted this" table cell: avatar, name, student id. Shared by the
 * dashboard's Recent Submissions table and the assignment's Submissions tab, which had
 * drifted into two hand-styled copies with different avatar sizes, gaps and icon
 * colours. One component means they cannot drift again.
 */
defineProps<{
    name: string
    studentId?: string | null
}>()
</script>

<template>
    <div class="tw:flex tw:items-center tw:gap-6">
        <div
            class="tw:w-9 tw:h-9 tw:shrink-0 tw:rounded-full tw:bg-navy-10 tw:flex tw:items-center tw:justify-center"
        >
            <Users class="tw:size-[18px] tw:text-navy-50" />
        </div>
        <div class="tw:flex tw:flex-col tw:items-start">
            <p class="tw:text-sm tw:font-medium tw:text-navy-100">{{ name }}</p>
            <p v-if="studentId" class="tw:text-xs tw:text-navy-50">{{ studentId }}</p>
        </div>
    </div>
</template>
