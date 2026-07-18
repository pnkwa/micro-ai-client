<script setup lang="ts">
import { Mail, Cpu, BookOpen, FileUp, Award } from 'lucide-vue-next'

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: 'Settings', to: '/settings' }])

const activeTab = ref('email')

const tabs = [
    { id: 'email', label: 'Email Config', icon: Mail },
    { id: 'ai', label: 'AI Config', icon: Cpu },
    { id: 'class-rules', label: 'Class Rules', icon: BookOpen },
    { id: 'submission', label: 'Submission Rules', icon: FileUp },
    { id: 'scoring', label: 'Scoring Rules', icon: Award },
]

const emailConfig = ref({
    smtpServer: 'smtp.uni.edu',
    smtpPort: '587',
    senderEmail: 'noreply@microai.uni.edu',
    senderName: 'MicroAI System',
    enableNotifications: true,
    scoreReleaseNotify: true,
    feedbackNotify: true,
    resubmissionNotify: true,
})

const aiConfig = ref({
    modelVersion: 'v2.1.0',
    confidenceThreshold: 0.75,
    enableAutoDetection: true,
    showBoundingBoxes: true,
    showConfidenceScores: true,
    processingPriority: 'normal',
})

const classRules = ref({
    maxStudentsPerClass: 250,
    defaultClassStatus: 'draft',
    allowLateSubmission: true,
    requireWhitelist: true,
    autoArchiveAfterDays: 90,
})

// Submission rules
const submissionRules = ref({
    maxFileSize: 10,
    allowedFormats: ['jpg', 'png', 'jpeg'],
    maxSubmissionsPerStudent: 3,
    allowResubmission: true,
    requireStudentId: true,
    requireEmail: true,
    timestampSubmissions: true,
})

// Scoring rules
const scoringRules = ref({
    maxScore: 100,
    passingScore: 60,
    enableAutoGrading: true,
    showScoreBreakdown: true,
    allowManualOverride: true,
    gradeOnSubmit: false,
})

// Select options
const modelVersionOptions = [
    { value: 'v2.1.0', label: 'v2.1.0 (Current)' },
    { value: 'v2.0.0', label: 'v2.0.0' },
    { value: 'v1.5.0', label: 'v1.5.0 (Legacy)' },
]

const processingPriorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'High' },
]

const classStatusOptions = [
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
]
</script>

<template>
    <div class="settings-page">
        <div class="settings-header">
            <div>
                <h1 class="settings-title">Settings</h1>
                <p class="settings-subtitle">Manage your account and preferences</p>
            </div>
        </div>

        <div class="settings-container">
            <div class="settings-sidebar">
                <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    class="settings-tab"
                    :class="{ active: activeTab === tab.id }"
                    @click="activeTab = tab.id"
                >
                    <component :is="tab.icon" class="tw:w-4 tw:h-4" />
                    <span>{{ tab.label }}</span>
                </button>
            </div>

            <div class="settings-content">
                <div v-if="activeTab === 'email'" class="settings-panel">
                    <h2 class="panel-title">Email Configuration</h2>
                    <p class="panel-description">
                        Configure email server and notification settings
                    </p>

                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">SMTP Server</label>
                            <McInput
                                v-model="emailConfig.smtpServer"
                                placeholder="smtp.example.com"
                            />
                        </div>
                        <div class="form-group">
                            <label class="form-label">SMTP Port</label>
                            <McInput v-model="emailConfig.smtpPort" placeholder="587" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Sender Email</label>
                            <McInput
                                v-model="emailConfig.senderEmail"
                                placeholder="noreply@example.com"
                            />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Sender Name</label>
                            <McInput
                                v-model="emailConfig.senderName"
                                placeholder="MicroAI System"
                            />
                        </div>
                    </div>

                    <h3 class="tw:text-sm tw:font-semibold tw:mt-6 tw:mb-4">Email Notifications</h3>
                    <div class="toggle-list">
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Enable Notifications</p>
                                <p class="toggle-description">
                                    Send email notifications to students
                                </p>
                            </div>
                            <input
                                v-model="emailConfig.enableNotifications"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Score Release Notification</p>
                                <p class="toggle-description">Notify when scores are released</p>
                            </div>
                            <input
                                v-model="emailConfig.scoreReleaseNotify"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Feedback Ready Notification</p>
                                <p class="toggle-description">Notify when feedback is available</p>
                            </div>
                            <input
                                v-model="emailConfig.feedbackNotify"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Resubmission Allowed Notification</p>
                                <p class="toggle-description">
                                    Notify when resubmission is enabled
                                </p>
                            </div>
                            <input
                                v-model="emailConfig.resubmissionNotify"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                    </div>

                    <div class="panel-actions">
                        <McButton>Save Email Config</McButton>
                    </div>
                </div>

                <div v-if="activeTab === 'ai'" class="settings-panel">
                    <h2 class="panel-title">AI Configuration</h2>
                    <p class="panel-description">Configure AI model and detection settings</p>

                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Model Version</label>
                            <McSelect
                                v-model="aiConfig.modelVersion"
                                :options="modelVersionOptions"
                                option-value="value"
                                option-label="label"
                                placeholder="Select model version"
                            />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Confidence Threshold</label>
                            <McInput
                                v-model="aiConfig.confidenceThreshold"
                                type="number"
                                min="0"
                                max="1"
                                step="0.05"
                            />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Processing Priority</label>
                            <McSelect
                                v-model="aiConfig.processingPriority"
                                :options="processingPriorityOptions"
                                option-value="value"
                                option-label="label"
                                placeholder="Select priority"
                            />
                        </div>
                    </div>

                    <h3 class="tw:text-sm tw:font-semibold tw:mt-6 tw:mb-4">Detection Display</h3>
                    <div class="toggle-list">
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Enable Auto Detection</p>
                                <p class="toggle-description">
                                    Automatically run AI detection on upload
                                </p>
                            </div>
                            <input
                                v-model="aiConfig.enableAutoDetection"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Show Bounding Boxes</p>
                                <p class="toggle-description">Display detection boxes on images</p>
                            </div>
                            <input
                                v-model="aiConfig.showBoundingBoxes"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Show Confidence Scores</p>
                                <p class="toggle-description">Display confidence percentages</p>
                            </div>
                            <input
                                v-model="aiConfig.showConfidenceScores"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                    </div>

                    <div class="panel-actions">
                        <McButton>Save AI Config</McButton>
                    </div>
                </div>

                <!-- Class Rules Tab -->
                <div v-if="activeTab === 'class-rules'" class="settings-panel">
                    <h2 class="panel-title">Class Rules Configuration</h2>
                    <p class="panel-description">Set default rules for class management</p>

                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Max Students Per Class</label>
                            <McInput v-model="classRules.maxStudentsPerClass" type="number" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Default Class Status</label>
                            <McSelect
                                v-model="classRules.defaultClassStatus"
                                :options="classStatusOptions"
                                option-value="value"
                                option-label="label"
                                placeholder="Select status"
                            />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Auto-Archive After (days)</label>
                            <McInput v-model="classRules.autoArchiveAfterDays" type="number" />
                        </div>
                    </div>

                    <h3 class="tw:text-sm tw:font-semibold tw:mt-6 tw:mb-4">Access Control</h3>
                    <div class="toggle-list">
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Allow Late Submission</p>
                                <p class="toggle-description">
                                    Allow students to submit after deadline
                                </p>
                            </div>
                            <input
                                v-model="classRules.allowLateSubmission"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Require Whitelist</p>
                                <p class="toggle-description">
                                    Only whitelisted students can access
                                </p>
                            </div>
                            <input
                                v-model="classRules.requireWhitelist"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                    </div>

                    <div class="panel-actions">
                        <McButton>Save Class Rules</McButton>
                    </div>
                </div>

                <!-- Submission Rules Tab -->
                <div v-if="activeTab === 'submission'" class="settings-panel">
                    <h2 class="panel-title">Submission Rules</h2>
                    <p class="panel-description">Configure submission requirements and limits</p>

                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Max File Size (MB)</label>
                            <McInput v-model="submissionRules.maxFileSize" type="number" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Max Submissions Per Student</label>
                            <McInput
                                v-model="submissionRules.maxSubmissionsPerStudent"
                                type="number"
                            />
                        </div>
                        <div class="form-group tw:col-span-2">
                            <label class="form-label">Allowed File Formats</label>
                            <McInput
                                :model-value="submissionRules.allowedFormats.join(', ')"
                                placeholder="jpg, png, jpeg"
                            />
                            <span class="tw:text-xs tw:text-gray-500 tw:mt-1">
                                Comma-separated formats
                            </span>
                        </div>
                    </div>

                    <h3 class="tw:text-sm tw:font-semibold tw:mt-6 tw:mb-4">Requirements</h3>
                    <div class="toggle-list">
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Allow Resubmission</p>
                                <p class="toggle-description">Students can resubmit assignments</p>
                            </div>
                            <input
                                v-model="submissionRules.allowResubmission"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Require Student ID</p>
                                <p class="toggle-description">Student ID is mandatory</p>
                            </div>
                            <input
                                v-model="submissionRules.requireStudentId"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Require Email</p>
                                <p class="toggle-description">Email is mandatory</p>
                            </div>
                            <input
                                v-model="submissionRules.requireEmail"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Record Timestamps</p>
                                <p class="toggle-description">Track submission time</p>
                            </div>
                            <input
                                v-model="submissionRules.timestampSubmissions"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                    </div>

                    <div class="panel-actions">
                        <McButton>Save Submission Rules</McButton>
                    </div>
                </div>

                <!-- Scoring Rules Tab -->
                <div v-if="activeTab === 'scoring'" class="settings-panel">
                    <h2 class="panel-title">Scoring Rules</h2>
                    <p class="panel-description">Configure grading and scoring settings</p>

                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Maximum Score</label>
                            <McInput v-model="scoringRules.maxScore" type="number" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Passing Score</label>
                            <McInput v-model="scoringRules.passingScore" type="number" />
                        </div>
                    </div>

                    <h3 class="tw:text-sm tw:font-semibold tw:mt-6 tw:mb-4">Grading Options</h3>
                    <div class="toggle-list">
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Enable Auto Grading</p>
                                <p class="toggle-description">AI-assisted automatic grading</p>
                            </div>
                            <input
                                v-model="scoringRules.enableAutoGrading"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Show Score Breakdown</p>
                                <p class="toggle-description">Display detailed score components</p>
                            </div>
                            <input
                                v-model="scoringRules.showScoreBreakdown"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Allow Manual Override</p>
                                <p class="toggle-description">Instructors can override AI grades</p>
                            </div>
                            <input
                                v-model="scoringRules.allowManualOverride"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                        <div class="toggle-item">
                            <div>
                                <p class="toggle-label">Grade On Submit</p>
                                <p class="toggle-description">Automatically grade when submitted</p>
                            </div>
                            <input
                                v-model="scoringRules.gradeOnSubmit"
                                type="checkbox"
                                class="toggle-input"
                            />
                        </div>
                    </div>

                    <div class="panel-actions">
                        <McButton>Save Scoring Rules</McButton>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.settings-page {
    padding: 1rem 0;
}

.settings-header {
    margin-bottom: 1.5rem;
}

.settings-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-primary);
    margin-bottom: 0.25rem;
}

.settings-subtitle {
    font-size: 0.875rem;
    color: var(--color-navy-60);
}

.settings-container {
    display: flex;
    gap: 2rem;
    background: white;
    border-radius: 8px;
    border: 1px solid var(--color-gray-200, #e5e7eb);
    overflow: hidden;
}

.settings-sidebar {
    width: 220px;
    flex-shrink: 0;
    padding: 1rem;
    border-right: 1px solid var(--color-gray-200, #e5e7eb);
    background: var(--color-gray-50, #f9fafb);
}

.settings-tab {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 0.875rem;
    color: var(--color-navy-60);
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
        background: var(--color-gray-100, #f3f4f6);
        color: var(--color-navy-80);
    }

    &.active {
        background: var(--color-primary);
        color: white;
    }
}

.settings-content {
    flex: 1;
    padding: 1.5rem;
}

.settings-panel {
    max-width: 600px;
}

.panel-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-navy-100);
    margin-bottom: 0.25rem;
}

.panel-description {
    font-size: 0.875rem;
    color: var(--color-navy-60);
    margin-bottom: 1.5rem;
}

.form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-navy-80);
}

.panel-actions {
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--color-gray-200, #e5e7eb);
}

.toggle-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.toggle-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: var(--color-gray-50, #f9fafb);
    border-radius: 8px;
}

.toggle-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-navy-80);
    margin-bottom: 0.125rem;
}

.toggle-description {
    font-size: 0.75rem;
    color: var(--color-navy-60);
}

.toggle-input {
    width: 36px;
    height: 20px;
    accent-color: var(--color-primary);
    cursor: pointer;
}
</style>
