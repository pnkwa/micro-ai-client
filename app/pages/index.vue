<script setup lang="ts">
import { Microscope } from 'lucide-vue-next'

const router = useRouter()
</script>

<template>
    <div class="tw:h-[calc(100vh-100px)] tw:flex tw:flex-col">
        <div
            class="tw:flex-1 tw:flex tw:items-center tw:justify-center tw-px-6 tw-py-12 tw:bg-linear-to-r tw:from-primary-disable-bg tw:to-white tw:rounded-md"
        >
            <div class="hero-content">
                <div class="logo-wrapper">
                    <Microscope class="hero-icon" />
                </div>
                <h1 class="hero-title">Welcome to MicroAI</h1>
                <p class="hero-subtitle">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas eget commodo
                </p>
                <div class="hero-actions">
                    <McButton size="lg" @click="router.push('/dashboard')">
                        Go to Dashboard
                    </McButton>
                    <McButton size="lg" variant="outline" @click="router.push('/class')">
                        Explore Classes
                    </McButton>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.hero-section {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.5rem;
    background: linear-gradient(135deg, var(--color-primary-disable-bg) 0%, white 100%);
}

.hero-content {
    text-align: center;
    max-width: 600px;
}

.logo-wrapper {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background: var(--color-primary);
    border-radius: 20px;
    margin-bottom: 1.5rem;
    box-shadow: 0 10px 40px rgba(36, 148, 134, 0.3);
}

.hero-icon {
    width: 48px;
    height: 48px;
    color: white;
}

.hero-title {
    font-size: 2.5rem;
    font-weight: 800;
    color: var(--color-primary);
    margin-bottom: 1rem;
    letter-spacing: -0.025em;
}

.hero-subtitle {
    font-size: 1.125rem;
    color: var(--color-navy-60);
    margin-bottom: 2rem;
    line-height: 1.6;
}

.hero-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
}
</style>
