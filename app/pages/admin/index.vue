<script setup lang="ts">
import { Plus, Search } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { systemConfigService, type SystemConfigEntry } from '~/services/systemConfigService'
import { systemService, type SystemInfo } from '~/services/systemService'
import {
    userAdminService,
    staffRoles,
    type AdminUser,
    type StaffRole,
} from '~/services/userAdminService'
import AccountsTable from '~/features/components/admin/AccountsTable.vue'

// Admin-only. Enforced for real by the API (RolesGuard); this meta is the UX gate in
// app/middleware/auth.global.ts.
definePageMeta({ role: 'admin' })

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: 'Admin', to: '/admin' }])

// ---- About system -----------------------------------------------------------------------------
// Three separately-deployed components, so a mismatched set is a real and easily-missed
// failure mode. The frontend reports its own baked-in build; the other two come from the API.
const systemInfo = ref<SystemInfo | null>(null)
const systemError = ref(false)
const frontendVersion = useRuntimeConfig().public.appVersion as string

const loadSystemInfo = async () => {
    systemError.value = false
    try {
        systemInfo.value = await systemService.info()
    } catch {
        systemError.value = true
    }
}

// ---- Runtime config ---------------------------------------------------------------------------
const configs = ref<SystemConfigEntry[]>([])
// Editable copy, keyed by config key. Booleans stay booleans (switch); anything else is edited
// as text and coerced back on save.
const configDraft = reactive<Record<string, boolean | string>>({})

const loadConfigs = async () => {
    try {
        configs.value = await systemConfigService.list()
        for (const c of configs.value) {
            configDraft[c.key] = typeof c.value === 'boolean' ? c.value : String(c.value ?? '')
        }
    } catch (e) {
        toast.error(apiErrorMessage(e, 'Failed to load runtime config'))
    }
}

const saveConfig = async (entry: SystemConfigEntry) => {
    try {
        await systemConfigService.set(entry.key, configDraft[entry.key])
        await loadConfigs()
        toast.success(`Saved ${entry.key}`)
    } catch (e) {
        toast.error(apiErrorMessage(e, `Failed to save ${entry.key}`))
    }
}

// ---- Accounts ---------------------------------------------------------------------------------
const users = ref<AdminUser[]>([])
const filterType = ref<'' | 'staff' | 'student'>('')
const filterQuery = ref('')

const loadUsers = async () => {
    try {
        users.value = await userAdminService.list({
            ...(filterType.value ? { user_type: filterType.value } : {}),
            ...(filterQuery.value ? { q: filterQuery.value } : {}),
        })
    } catch (e) {
        toast.error(apiErrorMessage(e, 'Failed to load accounts'))
    }
}

// Split by how the account authenticates: `local` (password) vs Azure SSO. Anything not
// explicitly local is treated as SSO. Each table paginates and mutates on its own.
const localAccounts = computed(() => users.value.filter((u) => u.auth_provider === 'local'))
const ssoAccounts = computed(() => users.value.filter((u) => u.auth_provider !== 'local'))

// ---- Create account ---------------------------------------------------------------------------
const createForm = reactive({
    kind: 'staff' as 'staff' | 'student',
    email: '',
    firstname: '',
    lastname: '',
    role: 'instructor' as StaffRole,
    student_id: '',
    auth_provider: 'local' as 'azure' | 'local',
    password: '',
})

// A native <select> hands back an AcceptableValue (widened, possibly undefined); these coerce it
// back to the field's literal union. They live in the script on purpose - a TS `as` cast inside
// an inline template handler trips Nuxt's macro parser at build time.
const onFilterTypeChange = (v: unknown) => {
    filterType.value = String(v) as '' | 'staff' | 'student'
    loadUsers()
}
const onKindChange = (v: unknown) => {
    createForm.kind = String(v) as 'staff' | 'student'
}
const onRoleChange = (v: unknown) => {
    createForm.role = String(v) as StaffRole
}
const onAuthProviderChange = (v: unknown) => {
    createForm.auth_provider = String(v) as 'azure' | 'local'
}

const submitCreate = async () => {
    try {
        if (createForm.kind === 'staff') {
            await userAdminService.createStaff({
                email: createForm.email,
                firstname: createForm.firstname,
                lastname: createForm.lastname,
                role: createForm.role,
                auth_provider: createForm.auth_provider,
                ...(createForm.auth_provider === 'local' && createForm.password
                    ? { password: createForm.password }
                    : {}),
            })
        } else {
            await userAdminService.createStudent({
                email: createForm.email,
                firstname: createForm.firstname,
                lastname: createForm.lastname,
                student_id: createForm.student_id,
                auth_provider: createForm.auth_provider,
                ...(createForm.auth_provider === 'local' && createForm.password
                    ? { password: createForm.password }
                    : {}),
            })
        }
        toast.success('Account created')
        createForm.email = ''
        createForm.firstname = ''
        createForm.lastname = ''
        createForm.student_id = ''
        createForm.password = ''
        await loadUsers()
    } catch (e) {
        toast.error(apiErrorMessage(e, 'Failed to create account'))
    }
}

await Promise.all([loadConfigs(), loadUsers(), loadSystemInfo()])
</script>

<template>
    <div class="tw:flex tw:flex-col tw:gap-8">
        <div>
            <h1 class="tw:text-2xl tw:font-bold tw:text-primary tw:mb-1">Admin console</h1>
            <p class="tw:text-sm tw:text-navy-60">Runtime configuration and account management.</p>
        </div>

        <!-- ================= About system ================= -->
        <section
            class="tw:bg-white tw:rounded-xl tw:border tw:border-navy-10 tw:p-6 tw:flex tw:flex-col tw:gap-4"
        >
            <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
                <div>
                    <h2 class="tw:text-lg tw:font-semibold tw:text-navy-100">About system</h2>
                    <p class="tw:text-sm tw:text-navy-60">
                        The three components deploy separately, so their versions can drift.
                    </p>
                </div>
                <button
                    type="button"
                    class="tw:text-xs tw:text-navy-40 hover:tw:text-primary"
                    @click="loadSystemInfo"
                >
                    Refresh
                </button>
            </div>

            <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-3 tw:gap-3">
                <!-- Backend -->
                <div
                    class="tw:rounded-lg tw:border tw:border-navy-10 tw:p-4 tw:flex tw:flex-col tw:gap-1"
                >
                    <span
                        class="tw:text-[10px] tw:font-bold tw:text-navy-40 tw:uppercase tw:tracking-[0.12em]"
                    >
                        Backend
                    </span>
                    <span class="tw:text-lg tw:font-semibold tw:text-navy-100 tw:font-mono">
                        {{ systemInfo?.backend.version ?? '-' }}
                    </span>
                    <span class="tw:text-xs tw:text-navy-60">micro-ai-server</span>
                </div>

                <!-- Image detection (the worker) -->
                <div
                    class="tw:rounded-lg tw:border tw:border-navy-10 tw:p-4 tw:flex tw:flex-col tw:gap-1"
                >
                    <span
                        class="tw:text-[10px] tw:font-bold tw:text-navy-40 tw:uppercase tw:tracking-[0.12em]"
                    >
                        Image detection
                    </span>
                    <span class="tw:flex tw:items-center tw:gap-2">
                        <span class="tw:text-lg tw:font-semibold tw:text-navy-100 tw:font-mono">
                            {{ systemInfo?.imageProcessor.version ?? '-' }}
                        </span>
                        <!-- The only component whose liveness we can actually observe: it
                             publishes a heartbeat, and a missing one IS the down signal. -->
                        <span
                            v-if="systemInfo"
                            class="tw:text-[10px] tw:font-semibold tw:px-1.5 tw:py-0.5 tw:rounded-full"
                            :class="
                                systemInfo.imageProcessor.healthy
                                    ? 'tw:bg-green-100 tw:text-green-700'
                                    : 'tw:bg-red-100 tw:text-red-700'
                            "
                        >
                            {{ systemInfo.imageProcessor.healthy ? 'running' : 'not running' }}
                        </span>
                    </span>
                    <span class="tw:text-xs tw:text-navy-60">
                        {{
                            systemInfo?.imageProcessor.healthy &&
                            systemInfo.imageProcessor.lastSeenSeconds !== null
                                ? `last seen ${Math.round(systemInfo.imageProcessor.lastSeenSeconds)}s ago`
                                : 'micro-ai-image-processor'
                        }}
                    </span>
                </div>

                <!-- Frontend -->
                <div
                    class="tw:rounded-lg tw:border tw:border-navy-10 tw:p-4 tw:flex tw:flex-col tw:gap-1"
                >
                    <span
                        class="tw:text-[10px] tw:font-bold tw:text-navy-40 tw:uppercase tw:tracking-[0.12em]"
                    >
                        Frontend
                    </span>
                    <span class="tw:text-lg tw:font-semibold tw:text-navy-100 tw:font-mono">
                        {{ frontendVersion }}
                    </span>
                    <span class="tw:text-xs tw:text-navy-60">micro-ai-client (this build)</span>
                </div>
            </div>

            <p v-if="systemError" class="tw:text-sm tw:text-amber-700">
                Could not reach the API for version information. The frontend version above is still
                this build's.
            </p>
        </section>

        <!-- ================= Runtime config ================= -->
        <section
            class="tw:bg-white tw:rounded-xl tw:border tw:border-navy-10 tw:p-6 tw:flex tw:flex-col tw:gap-4"
        >
            <div>
                <h2 class="tw:text-lg tw:font-semibold tw:text-navy-100">Runtime config</h2>
                <p class="tw:text-sm tw:text-navy-60">
                    Operator switches. Changes take effect immediately - no restart.
                </p>
            </div>

            <McTable>
                <McTableHeader>
                    <McTableRow>
                        <McTableHead>Key</McTableHead>
                        <McTableHead>Description</McTableHead>
                        <McTableHead>Value</McTableHead>
                        <McTableHead>Source</McTableHead>
                        <McTableHead class="tw:text-right">Action</McTableHead>
                    </McTableRow>
                </McTableHeader>
                <McTableBody>
                    <McTableRow v-for="c in configs" :key="c.key">
                        <McTableCell class="tw:font-medium">{{ c.key }}</McTableCell>
                        <McTableCell class="tw:text-navy-60 tw:whitespace-normal">
                            {{ c.description }}
                        </McTableCell>
                        <McTableCell>
                            <McSwitch
                                v-if="typeof c.value === 'boolean'"
                                :model-value="configDraft[c.key] === true"
                                @update:model-value="configDraft[c.key] = $event === true"
                            />
                            <McInput
                                v-else
                                class="tw:max-w-xs"
                                :model-value="String(configDraft[c.key] ?? '')"
                                @update:model-value="configDraft[c.key] = String($event)"
                            />
                        </McTableCell>
                        <McTableCell>
                            <McBadge :variant="c.source === 'database' ? 'success' : 'outline'">
                                {{ c.source }}
                            </McBadge>
                        </McTableCell>
                        <McTableCell class="tw:text-right">
                            <McButton size="sm" variant="outline" @click="saveConfig(c)">
                                Save
                            </McButton>
                        </McTableCell>
                    </McTableRow>
                    <McTableEmpty v-if="configs.length === 0" :colspan="5">
                        No config keys.
                    </McTableEmpty>
                </McTableBody>
            </McTable>
        </section>

        <!-- ================= Accounts ================= -->
        <div class="tw:flex tw:flex-col tw:gap-4">
            <div class="tw:flex tw:flex-wrap tw:items-end tw:justify-between tw:gap-4">
                <div>
                    <h2 class="tw:text-lg tw:font-semibold tw:text-navy-100">Accounts</h2>
                    <p class="tw:text-sm tw:text-navy-60">
                        Split by sign-in method. Edit, promote/demote, or remove users.
                    </p>
                </div>
                <div class="tw:flex tw:items-center tw:gap-2">
                    <McNativeSelect
                        :model-value="filterType"
                        class="tw:w-32"
                        @update:model-value="onFilterTypeChange($event)"
                    >
                        <option value="">All types</option>
                        <option value="staff">Staff</option>
                        <option value="student">Student</option>
                    </McNativeSelect>
                    <div class="tw:w-56">
                        <McInput
                            v-model="filterQuery"
                            placeholder="Search name or email"
                            icon-prepend="Search"
                            @keyup.enter="loadUsers"
                        />
                    </div>
                    <McButton variant="outline" size="icon" aria-label="Search" @click="loadUsers">
                        <Search class="tw:size-4" />
                    </McButton>
                </div>
            </div>

            <AccountsTable
                title="Local accounts"
                subtitle="Password sign-in - the local-auth fallback to CMU SSO."
                :accounts="localAccounts"
                empty-text="No local accounts match."
                @changed="loadUsers"
            />
            <AccountsTable
                title="SSO accounts"
                subtitle="Azure single sign-on. 'Azure' shows whether the account has been linked yet."
                :accounts="ssoAccounts"
                show-azure
                empty-text="No SSO accounts match."
                @changed="loadUsers"
            />
        </div>

        <!-- ================= Create account ================= -->
        <section
            class="tw:bg-white tw:rounded-xl tw:border tw:border-navy-10 tw:p-6 tw:flex tw:flex-col tw:gap-4"
        >
            <div>
                <h2 class="tw:text-lg tw:font-semibold tw:text-navy-100">Create account</h2>
                <p class="tw:text-sm tw:text-navy-60">
                    Provision a staff or student account. Set a password for local login, or leave
                    it to Azure SSO.
                </p>
            </div>

            <form class="tw:flex tw:flex-col tw:gap-4" @submit.prevent="submitCreate">
                <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-4">
                    <div class="tw:flex tw:flex-col tw:gap-2">
                        <label class="tw:text-sm tw:font-medium">Account type</label>
                        <McNativeSelect
                            :model-value="createForm.kind"
                            class="tw:w-full"
                            @update:model-value="onKindChange($event)"
                        >
                            <option value="staff">Staff</option>
                            <option value="student">Student</option>
                        </McNativeSelect>
                    </div>
                    <div class="tw:flex tw:flex-col tw:gap-2">
                        <label class="tw:text-sm tw:font-medium">Email</label>
                        <McInput
                            v-model="createForm.email"
                            type="email"
                            placeholder="user@cmu.ac.th"
                        />
                    </div>
                    <div class="tw:flex tw:flex-col tw:gap-2">
                        <label class="tw:text-sm tw:font-medium">First name</label>
                        <McInput v-model="createForm.firstname" placeholder="First name" />
                    </div>
                    <div class="tw:flex tw:flex-col tw:gap-2">
                        <label class="tw:text-sm tw:font-medium">Last name</label>
                        <McInput v-model="createForm.lastname" placeholder="Last name" />
                    </div>
                    <div v-if="createForm.kind === 'staff'" class="tw:flex tw:flex-col tw:gap-2">
                        <label class="tw:text-sm tw:font-medium">Role</label>
                        <McNativeSelect
                            :model-value="createForm.role"
                            class="tw:w-full"
                            @update:model-value="onRoleChange($event)"
                        >
                            <option v-for="r in staffRoles" :key="r" :value="r">{{ r }}</option>
                        </McNativeSelect>
                    </div>
                    <div v-else class="tw:flex tw:flex-col tw:gap-2">
                        <label class="tw:text-sm tw:font-medium">Student ID</label>
                        <McInput
                            v-model="createForm.student_id"
                            placeholder="9-digit university ID"
                            maxlength="9"
                        />
                    </div>
                    <div class="tw:flex tw:flex-col tw:gap-2">
                        <label class="tw:text-sm tw:font-medium">Auth provider</label>
                        <McNativeSelect
                            :model-value="createForm.auth_provider"
                            class="tw:w-full"
                            @update:model-value="onAuthProviderChange($event)"
                        >
                            <option value="local">Local (password)</option>
                            <option value="azure">Azure (SSO)</option>
                        </McNativeSelect>
                    </div>
                    <div
                        v-if="createForm.auth_provider === 'local'"
                        class="tw:flex tw:flex-col tw:gap-2"
                    >
                        <label class="tw:text-sm tw:font-medium">Password</label>
                        <McInput
                            v-model="createForm.password"
                            type="password"
                            placeholder="min 8 characters"
                        />
                    </div>
                </div>
                <div>
                    <McButton type="submit">
                        <Plus class="tw:size-4" />
                        Create account
                    </McButton>
                </div>
            </form>
        </section>
    </div>
</template>
