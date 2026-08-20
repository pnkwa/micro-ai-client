<script setup lang="ts">
import { Lock } from '@lucide/vue'

/**
 * The door a student meets when the AI tool is withheld (request 5.2, BE-ADR-012).
 *
 * A whole screen rather than a disabled control, because the tool's entire surface is the answer
 * they are being examined on - and split out of the page for the same reason it is a whole screen:
 * nothing here shares state with the scanner, so a page 1900 lines long should not be where it
 * lives. The server is the boundary; this is the explanation.
 *
 * Named and linked when the exam can be identified, which is what turns "you have an exam open"
 * into something a student can act on. See `~/core/composables/blockingExam` for who does the
 * identifying, and why a null answer means "cannot name it" rather than "not blocked".
 */
defineProps<{
    /** Why the tool is withheld, in a sentence. */
    message: string | null
    /** When it comes back, when that can be answered. Depends on the exam, so it arrives separately. */
    releaseText?: string
    /** The exam that is withholding it, when it can be named. */
    examName?: string
    /** Where that exam lives, when it can be linked. */
    examPath?: string | null
}>()

const router = useRouter()
</script>

<template>
    <div class="tw:flex tw:min-h-[calc(100vh-80px)] tw:items-center tw:justify-center tw:px-4">
        <!-- Blocked outright rather than disabled in place: a half-usable page invites a student to
         try, and the tool's whole surface is the answer they are being examined on. -->
        <!--
        Same min-height as the working page below, so the block is a full screen rather than
        content stranded at the top with empty space beneath it. No card around it: with nothing
        else on the page there is nothing to separate it from, and the border only drew a box
        around a message.
    -->
        <div
            class="tw:flex tw:w-full tw:max-w-md tw:flex-col tw:items-center tw:gap-5 tw:text-center"
        >
            <div
                class="tw:flex tw:size-14 tw:items-center tw:justify-center tw:rounded-full tw:bg-navy-5 tw:text-navy-40"
            >
                <Lock class="tw:size-7" />
            </div>

            <div class="tw:flex tw:flex-col tw:gap-2">
                <h1 class="tw:text-lg tw:font-semibold tw:text-navy-100">
                    Image Detection is unavailable
                </h1>
                <p class="tw:text-sm tw:leading-relaxed tw:text-navy-60">
                    {{ message }}
                    <!-- Its own sentence, appended rather than baked into `message`: only an exam
                     lock has a release condition, and only the caller knows which exam. -->
                    <template v-if="releaseText">{{ releaseText }}</template>
                </p>
                <!-- Named, when it can be: "an exam" is a thing to go and look for, and the student
                 who is reading this is the one who did not know where. -->
                <p v-if="examName" class="tw:text-sm tw:font-semibold tw:text-navy-90">
                    {{ examName }}
                </p>
            </div>

            <!--
            The exam is the primary action, not Back: the reason the tool is withheld is an open
            exam, so the thing they actually need is the way to it. Still true once they have
            submitted - a windowed exam keeps the lock until it closes (BE-ADR-022, amended
            2026-08-19), and the exam page is where the closing time is. Back only returns them to
            where they already were. Falls back to the class list when the exam cannot be named -
            one level of hunting rather than none, but never a dead end.
        -->
            <div class="tw:flex tw:flex-wrap tw:justify-center tw:gap-2">
                <McButton variant="outline" size="sm" @click="router.push('/')">Back</McButton>
                <McButton v-if="examPath" size="sm" @click="router.push(examPath!)">
                    Go to exam
                </McButton>
                <McButton v-else size="sm" @click="router.push('/classes')">
                    Go to my classes
                </McButton>
            </div>
        </div>
    </div>
</template>
