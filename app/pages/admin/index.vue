<script setup lang="ts">
import { Plus, Pencil, Trash2, Check, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { systemConfigService, type SystemConfigEntry } from '~/services/systemConfigService'
import {
    userAdminService,
    staffRoles,
    type AdminUser,
    type StaffRole,
} from '~/services/userAdminService'

// Admin-only. Enforced for real by the API (RolesGuard); this meta is the UX gate in
// app/middleware/auth.global.ts.
definePageMeta({ role: 'admin' })

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: 'Admin', to: '/admin' }])

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

const changeRole = async (user: AdminUser, role: string) => {
    if (role === user.role) return
    try {
        await userAdminService.setRole(user.userID, role as StaffRole)
        toast.success(`${user.email} is now ${role}`)
    } catch (e) {
        // Backend rejects self-demotion and demoting the last admin — surface its message.
        toast.error(apiErrorMessage(e, 'Failed to change role'))
    } finally {
        await loadUsers()
    }
}

// Inline edit of identity fields.
const editingId = ref<number | null>(null)
const editDraft = reactive({
    firstname: '',
    lastname: '',
    email: '',
    is_active: true,
})

const startEdit = (user: AdminUser) => {
    editingId.value = user.userID
    editDraft.firstname = user.firstname
    editDraft.lastname = user.lastname
    editDraft.email = user.email
    editDraft.is_active = user.is_active ?? true
}

const cancelEdit = () => {
    editingId.value = null
}

const saveEdit = async (user: AdminUser) => {
    try {
        await userAdminService.update(user.userID, {
            firstname: editDraft.firstname,
            lastname: editDraft.lastname,
            email: editDraft.email,
            is_active: editDraft.is_active,
        })
        editingId.value = null
        await loadUsers()
        toast.success('Account updated')
    } catch (e) {
        toast.error(apiErrorMessage(e, 'Failed to update account'))
    }
}

const removeUser = async (user: AdminUser) => {
    if (!confirm(`Delete ${user.email}? This cannot be undone.`)) return
    try {
        await userAdminService.remove(user.userID)
        await loadUsers()
        toast.success('Account deleted')
    } catch (e) {
        // Backend rejects deleting yourself and the last admin.
        toast.error(apiErrorMessage(e, 'Failed to delete account'))
    }
}

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

await Promise.all([loadConfigs(), loadUsers()])
</script>

<template>
    <div class="tw:flex tw:flex-col tw:gap-8">
        <div>
            <h1 class="tw:text-2xl tw:font-bold tw:text-primary tw:mb-1">Admin console</h1>
            <p class="tw:text-sm tw:text-navy-60">Runtime configuration and account management.</p>
        </div>

        <!-- ================= Runtime config ================= -->
        <section
            class="tw:bg-white tw:rounded-xl tw:border tw:border-navy-10 tw:p-6 tw:flex tw:flex-col tw:gap-4"
        >
            <div>
                <h2 class="tw:text-lg tw:font-semibold tw:text-navy-100">Runtime config</h2>
                <p class="tw:text-sm tw:text-navy-60">
                    Operator switches. Changes take effect immediately — no restart.
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
        <section
            class="tw:bg-white tw:rounded-xl tw:border tw:border-navy-10 tw:p-6 tw:flex tw:flex-col tw:gap-4"
        >
            <div class="tw:flex tw:flex-wrap tw:items-end tw:justify-between tw:gap-4">
                <div>
                    <h2 class="tw:text-lg tw:font-semibold tw:text-navy-100">Accounts</h2>
                    <p class="tw:text-sm tw:text-navy-60">Edit, promote/demote, or remove users.</p>
                </div>
                <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                    <McNativeSelect
                        :model-value="filterType"
                        class="tw:w-32"
                        @update:model-value="
                            filterType = String($event) as '' | 'staff' | 'student'
                            loadUsers()
                        "
                    >
                        <option value="">All types</option>
                        <option value="staff">Staff</option>
                        <option value="student">Student</option>
                    </McNativeSelect>
                    <McInput
                        v-model="filterQuery"
                        class="tw:w-56"
                        placeholder="Search name or email"
                        icon-prepend="Search"
                        @keyup.enter="loadUsers"
                    />
                    <McButton variant="outline" @click="loadUsers">Apply</McButton>
                </div>
            </div>

            <McTable>
                <McTableHeader>
                    <McTableRow>
                        <McTableHead>ID</McTableHead>
                        <McTableHead>Name</McTableHead>
                        <McTableHead>Email</McTableHead>
                        <McTableHead>Type</McTableHead>
                        <McTableHead>Role / Student ID</McTableHead>
                        <McTableHead>Status</McTableHead>
                        <McTableHead class="tw:text-right">Actions</McTableHead>
                    </McTableRow>
                </McTableHeader>
                <McTableBody>
                    <McTableRow v-for="u in users" :key="u.userID">
                        <McTableCell class="tw:text-navy-60">{{ u.userID }}</McTableCell>

                        <template v-if="editingId === u.userID">
                            <McTableCell>
                                <div class="tw:flex tw:gap-2">
                                    <McInput v-model="editDraft.firstname" placeholder="First" />
                                    <McInput v-model="editDraft.lastname" placeholder="Last" />
                                </div>
                            </McTableCell>
                            <McTableCell>
                                <McInput v-model="editDraft.email" placeholder="Email" />
                            </McTableCell>
                            <McTableCell>
                                <McBadge variant="outline">{{ u.user_type }}</McBadge>
                            </McTableCell>
                            <McTableCell class="tw:text-navy-60">
                                {{ u.role ?? u.student_id ?? '—' }}
                            </McTableCell>
                            <McTableCell>
                                <div class="tw:flex tw:items-center tw:gap-2">
                                    <McSwitch v-model="editDraft.is_active" />
                                    <span class="tw:text-sm tw:text-navy-60">
                                        {{ editDraft.is_active ? 'Active' : 'Inactive' }}
                                    </span>
                                </div>
                            </McTableCell>
                            <McTableCell>
                                <div class="tw:flex tw:justify-end tw:gap-1">
                                    <McButton size="sm" @click="saveEdit(u)">
                                        <Check class="tw:size-4" />
                                        Save
                                    </McButton>
                                    <McButton size="sm" variant="ghost" @click="cancelEdit">
                                        <X class="tw:size-4" />
                                    </McButton>
                                </div>
                            </McTableCell>
                        </template>

                        <template v-else>
                            <McTableCell class="tw:font-medium">
                                {{ u.firstname }} {{ u.lastname }}
                            </McTableCell>
                            <McTableCell class="tw:text-navy-60">{{ u.email }}</McTableCell>
                            <McTableCell>
                                <McBadge variant="outline">{{ u.user_type }}</McBadge>
                            </McTableCell>
                            <McTableCell>
                                <McNativeSelect
                                    v-if="u.user_type === 'staff'"
                                    :model-value="u.role ?? ''"
                                    class="tw:w-32"
                                    @update:model-value="changeRole(u, String($event))"
                                >
                                    <option v-for="r in staffRoles" :key="r" :value="r">
                                        {{ r }}
                                    </option>
                                </McNativeSelect>
                                <span v-else class="tw:text-sm tw:text-navy-60">
                                    {{ u.student_id ?? '—' }}
                                </span>
                            </McTableCell>
                            <McTableCell>
                                <McBadge :variant="u.is_active === false ? 'outline' : 'success'">
                                    {{ u.is_active === false ? 'Inactive' : 'Active' }}
                                </McBadge>
                            </McTableCell>
                            <McTableCell>
                                <div class="tw:flex tw:justify-end tw:gap-1">
                                    <McButton
                                        size="icon-sm"
                                        variant="ghost"
                                        aria-label="Edit"
                                        @click="startEdit(u)"
                                    >
                                        <Pencil class="tw:size-4" />
                                    </McButton>
                                    <McButton
                                        size="icon-sm"
                                        variant="ghost"
                                        aria-label="Delete"
                                        @click="removeUser(u)"
                                    >
                                        <Trash2 class="tw:size-4 tw:text-destructive" />
                                    </McButton>
                                </div>
                            </McTableCell>
                        </template>
                    </McTableRow>
                    <McTableEmpty v-if="users.length === 0" :colspan="7">No accounts.</McTableEmpty>
                </McTableBody>
            </McTable>
        </section>

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
                            @update:model-value="
                                createForm.kind = String($event) as 'staff' | 'student'
                            "
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
                            @update:model-value="createForm.role = String($event) as StaffRole"
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
                            @update:model-value="
                                createForm.auth_provider = String($event) as 'azure' | 'local'
                            "
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
