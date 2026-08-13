<script setup lang="ts">
import { toast } from 'vue-sonner'
import { systemConfigService, type SystemConfigEntry } from '~/services/systemConfigService'
import {
    userAdminService,
    staffRoles,
    type AdminUser,
    type StaffRole,
} from '~/services/userAdminService'

// Admin-only. Enforced for real by the API (RolesGuard); this meta is the UX gate in
// app/middleware/auth.global.ts. Deliberately unstyled — a barebone operator console.
definePageMeta({ role: 'admin' })

const breadcrumb = useBreadcrumb()
breadcrumb.setBreadcrumbs([{ label: 'Admin', to: '/admin' }])

// ---- Runtime config ---------------------------------------------------------------------------
const configs = ref<SystemConfigEntry[]>([])
// Editable copy, keyed by config key. Booleans stay booleans (checkbox); anything else is edited
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
    try {
        await userAdminService.setRole(user.userID, role as StaffRole)
        await loadUsers()
        toast.success(`${user.email} is now ${role}`)
    } catch (e) {
        // Backend rejects self-demotion and demoting the last admin — surface its message.
        toast.error(apiErrorMessage(e, 'Failed to change role'))
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
    <div>
        <h1>Admin console</h1>

        <!-- ================= Runtime config ================= -->
        <section>
            <h2>Runtime config</h2>
            <table border="1" cellpadding="4">
                <thead>
                    <tr>
                        <th>Key</th>
                        <th>Description</th>
                        <th>Value</th>
                        <th>Source</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="c in configs" :key="c.key">
                        <td>{{ c.key }}</td>
                        <td>{{ c.description }}</td>
                        <td>
                            <input
                                v-if="typeof c.value === 'boolean'"
                                type="checkbox"
                                :checked="configDraft[c.key] === true"
                                @change="
                                    configDraft[c.key] = ($event.target as HTMLInputElement).checked
                                "
                            />
                            <input
                                v-else
                                type="text"
                                :value="String(configDraft[c.key] ?? '')"
                                @input="
                                    configDraft[c.key] = ($event.target as HTMLInputElement).value
                                "
                            />
                        </td>
                        <td>{{ c.source }}</td>
                        <td><button @click="saveConfig(c)">Save</button></td>
                    </tr>
                    <tr v-if="configs.length === 0">
                        <td colspan="5">No config keys.</td>
                    </tr>
                </tbody>
            </table>
        </section>

        <hr />

        <!-- ================= Accounts ================= -->
        <section>
            <h2>Accounts</h2>
            <div>
                <label>
                    Type:
                    <select v-model="filterType" @change="loadUsers">
                        <option value="">all</option>
                        <option value="staff">staff</option>
                        <option value="student">student</option>
                    </select>
                </label>
                <label>
                    Search:
                    <input
                        v-model="filterQuery"
                        type="text"
                        placeholder="name or email"
                        @keyup.enter="loadUsers"
                    />
                </label>
                <button @click="loadUsers">Apply</button>
            </div>

            <table border="1" cellpadding="4">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Type</th>
                        <th>Role / Student ID</th>
                        <th>Active</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="u in users" :key="u.userID">
                        <td>{{ u.userID }}</td>
                        <template v-if="editingId === u.userID">
                            <td>
                                <input v-model="editDraft.firstname" type="text" />
                                <input v-model="editDraft.lastname" type="text" />
                            </td>
                            <td><input v-model="editDraft.email" type="text" /></td>
                            <td>{{ u.user_type }}</td>
                            <td>{{ u.role ?? u.student_id ?? '—' }}</td>
                            <td>
                                <input v-model="editDraft.is_active" type="checkbox" />
                            </td>
                            <td>
                                <button @click="saveEdit(u)">Save</button>
                                <button @click="cancelEdit">Cancel</button>
                            </td>
                        </template>
                        <template v-else>
                            <td>{{ u.firstname }} {{ u.lastname }}</td>
                            <td>{{ u.email }}</td>
                            <td>{{ u.user_type }}</td>
                            <td>
                                <select
                                    v-if="u.user_type === 'staff'"
                                    :value="u.role ?? ''"
                                    @change="
                                        changeRole(u, ($event.target as HTMLSelectElement).value)
                                    "
                                >
                                    <option v-for="r in staffRoles" :key="r" :value="r">
                                        {{ r }}
                                    </option>
                                </select>
                                <span v-else>{{ u.student_id ?? '—' }}</span>
                            </td>
                            <td>{{ u.is_active === false ? 'no' : 'yes' }}</td>
                            <td>
                                <button @click="startEdit(u)">Edit</button>
                                <button @click="removeUser(u)">Delete</button>
                            </td>
                        </template>
                    </tr>
                    <tr v-if="users.length === 0">
                        <td colspan="7">No accounts.</td>
                    </tr>
                </tbody>
            </table>
        </section>

        <hr />

        <!-- ================= Create account ================= -->
        <section>
            <h2>Create account</h2>
            <form @submit.prevent="submitCreate">
                <p>
                    <label>
                        Kind:
                        <select v-model="createForm.kind">
                            <option value="staff">staff</option>
                            <option value="student">student</option>
                        </select>
                    </label>
                </p>
                <p>
                    <label>
                        Email:
                        <input v-model="createForm.email" type="email" required />
                    </label>
                </p>
                <p>
                    <label>
                        First name:
                        <input v-model="createForm.firstname" type="text" required />
                    </label>
                    <label>
                        Last name:
                        <input v-model="createForm.lastname" type="text" required />
                    </label>
                </p>
                <p v-if="createForm.kind === 'staff'">
                    <label>
                        Role:
                        <select v-model="createForm.role">
                            <option v-for="r in staffRoles" :key="r" :value="r">
                                {{ r }}
                            </option>
                        </select>
                    </label>
                </p>
                <p v-else>
                    <label>
                        Student ID:
                        <input v-model="createForm.student_id" type="text" required />
                    </label>
                </p>
                <p>
                    <label>
                        Auth provider:
                        <select v-model="createForm.auth_provider">
                            <option value="local">local (password)</option>
                            <option value="azure">azure (SSO)</option>
                        </select>
                    </label>
                </p>
                <p v-if="createForm.auth_provider === 'local'">
                    <label>
                        Password:
                        <input
                            v-model="createForm.password"
                            type="password"
                            minlength="8"
                            placeholder="min 8 chars"
                        />
                    </label>
                </p>
                <button type="submit">Create</button>
            </form>
        </section>
    </div>
</template>
