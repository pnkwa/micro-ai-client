<script setup lang="ts">
import type CameraType from 'simple-vue-camera'
import { Camera as CameraIcon, X } from 'lucide-vue-next'

const camera = ref<InstanceType<typeof CameraType>>()
const snapshotUrl = ref<string | null>(null)

const takeSnapshot = async () => {
    const blob = await camera.value?.snapshot()
    if (blob) {
        if (snapshotUrl.value) {
            URL.revokeObjectURL(snapshotUrl.value)
        }
        snapshotUrl.value = URL.createObjectURL(blob)
    }
}

const clearSnapshot = () => {
    if (snapshotUrl.value) {
        URL.revokeObjectURL(snapshotUrl.value)
        snapshotUrl.value = null
    }
}

onUnmounted(() => {
    if (snapshotUrl.value) {
        URL.revokeObjectURL(snapshotUrl.value)
    }
})
</script>

<template>
    <div class="content-container tw:p-4 tw:md:p-6">
        <h2 class="tw:text-xl tw:md:text-2xl tw:font-semibold tw:mb-4">Image Detection</h2>
        <p class="tw:mb-4 tw:text-sm tw:md:text-base">
            Capture images for AI-powered detection and analysis.
        </p>

        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-2 tw:gap-4 tw:md:gap-6">
            <div class="camera-section">
                <h3 class="tw:text-base tw:md:text-lg tw:font-medium tw:mb-3">Camera</h3>
                <div class="camera-wrapper">
                    <Camera ref="camera" :resolution="{ width: 375, height: 375 }" autoplay />
                </div>
                <McButton class="tw:mt-3 tw:w-full" @click="takeSnapshot">
                    <CameraIcon class="tw:w-4 tw:h-4 tw:mr-2" />
                    Take Snapshot
                </McButton>
            </div>

            <div v-if="snapshotUrl" class="snapshot-section">
                <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
                    <h3 class="tw:text-base tw:md:text-lg tw:font-medium">Snapshot</h3>
                    <McButton variant="ghost" size="icon" @click="clearSnapshot">
                        <X class="tw:w-4 tw:h-4" />
                    </McButton>
                </div>
                <div class="snapshot-wrapper">
                    <img :src="snapshotUrl" alt="Snapshot" class="snapshot-image" />
                </div>
                <McButton variant="outline" class="tw:mt-3 tw:w-full">Analyze Image</McButton>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.camera-section,
.snapshot-section {
    background: white;
    padding: 1rem;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);

    @media (min-width: 768px) {
        padding: 1.5rem;
    }
}

.camera-wrapper,
.snapshot-wrapper {
    width: 100%;
    aspect-ratio: 1 / 1;
    max-width: 375px;
    margin: 0 auto;
    border-radius: 8px;
    overflow: hidden;
    background: var(--color-navy-10);

    @media (min-width: 1024px) {
        max-width: 100%;
    }
}

.snapshot-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>
