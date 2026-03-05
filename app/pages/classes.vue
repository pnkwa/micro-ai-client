<script setup lang="ts">
import { GraduationCap, Users, Clock } from 'lucide-vue-next'

const classes = [
    {
        id: 1,
        name: 'Introduction to AI',
        students: 45,
        duration: '8 weeks',
        status: 'active',
    },
    {
        id: 2,
        name: 'Machine Learning Basics',
        students: 32,
        duration: '10 weeks',
        status: 'active',
    },
    {
        id: 3,
        name: 'Data Science Fundamentals',
        students: 28,
        duration: '6 weeks',
        status: 'upcoming',
    },
]
</script>

<template>
    <div class="classes-page">
        <div class="classes-header">
            <h1 class="classes-title">Classes</h1>
            <McButton>
                <GraduationCap class="tw:w-4 tw:h-4 tw:mr-2" />
                Create Class
            </McButton>
        </div>

        <div class="classes-grid">
            <div v-for="classItem in classes" :key="classItem.id" class="class-card">
                <div class="class-icon-wrapper">
                    <GraduationCap class="class-icon" />
                </div>
                <h3 class="class-name">{{ classItem.name }}</h3>
                <div class="class-meta">
                    <span class="class-meta-item">
                        <Users class="meta-icon" />
                        {{ classItem.students }} students
                    </span>
                    <span class="class-meta-item">
                        <Clock class="meta-icon" />
                        {{ classItem.duration }}
                    </span>
                </div>
                <span
                    class="class-status"
                    :class="classItem.status === 'active' ? 'status-active' : 'status-upcoming'"
                >
                    {{ classItem.status }}
                </span>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.classes-page {
    padding: 1rem 0;
}

.classes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
}

.classes-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--color-navy-100);
}

.classes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
}

.class-card {
    padding: 1.5rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    position: relative;
    transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;

    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    }
}

.class-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: var(--color-primary-disable-bg);
    border-radius: 12px;
    margin-bottom: 1rem;
}

.class-icon {
    width: 24px;
    height: 24px;
    color: var(--color-primary);
}

.class-name {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-navy-100);
    margin-bottom: 0.75rem;
}

.class-meta {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
}

.class-meta-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    color: var(--color-navy-60);
}

.meta-icon {
    width: 14px;
    height: 14px;
}

.class-status {
    position: absolute;
    top: 1rem;
    right: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    text-transform: capitalize;
}

.status-active {
    color: var(--color-tag-success-text);
    background: var(--color-tag-success-active);
}

.status-upcoming {
    color: var(--color-tag-info-text);
    background: var(--color-tag-info-active);
}
</style>
