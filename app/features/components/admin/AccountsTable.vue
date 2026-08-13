<script setup lang="ts">
import { Pencil, Trash2, Check, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import {
    userAdminService,
    staffRoles,
    type AdminUser,
    type StaffRole,
} from '~/services/userAdminService'

const props = withDefaults(
    defineProps<{
        title: string
        subtitle?: string
        accounts: AdminUser[]
        // The SSO table shows an extra column: whether the account is Azure-linked yet.
        showAzure?: boolean
        emptyText?: string
    }>(),
    { subtitle: '', showAzure: false, emptyText: 'No accounts.' },
)

// Parent owns the fetch; it re-lists both tables when a mutation here changes anything.
const emit = defineEmits<{ changed: [] }>()

const columnCount = computed(() => (props.showAzure ? 9 : 8))

// ---- Client-side pagination -------------------------------------------------------------------
const PAGE_SIZE = 8
const page = ref(1)
const pagedAccounts = computed(() =>
    props.accounts.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)
// Clamp the page when the list shrinks (delete, filter) so we never strand on an empty page.
watch(
    () => props.accounts.length,
    (len) => {
        const maxPage = Math.max(1, Math.ceil(len / PAGE_SIZE))
        if (page.value > maxPage) page.value = maxPage
    },
)

const formatDate = (d?: Date) => (d ? new Date(d).toLocaleDateString() : '—')

// ---- Inline edit ------------------------------------------------------------------------------
const editingId = ref<number | null>(null)
const editDraft = reactive({ firstname: '', lastname: '', email: '', is_active: true })

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
        toast.success('Account updated')
        emit('changed')
    } catch (e) {
        toast.error(apiErrorMessage(e, 'Failed to update account'))
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
        emit('changed')
    }
}

const removeUser = async (user: AdminUser) => {
    if (!confirm(`Delete ${user.email}? This cannot be undone.`)) return
    try {
        await userAdminService.remove(user.userID)
        toast.success('Account deleted')
        emit('changed')
    } catch (e) {
        // Backend rejects deleting yourself and the last admin.
        toast.error(apiErrorMessage(e, 'Failed to delete account'))
    }
}
</script>

<template>
    <section
        class="tw:bg-white tw:rounded-xl tw:border tw:border-navy-10 tw:p-6 tw:flex tw:flex-col tw:gap-4"
    >
        <div>
            <h3 class="tw:text-base tw:font-semibold tw:text-navy-100">
                {{ title }}
                <span class="tw:text-navy-60 tw:font-normal">({{ accounts.length }})</span>
            </h3>
            <p v-if="subtitle" class="tw:text-sm tw:text-navy-60">{{ subtitle }}</p>
        </div>

        <McTable>
            <McTableHeader>
                <McTableRow>
                    <McTableHead>ID</McTableHead>
                    <McTableHead>Name</McTableHead>
                    <McTableHead>Email</McTableHead>
                    <McTableHead>Type</McTableHead>
                    <McTableHead>Role / Student ID</McTableHead>
                    <McTableHead v-if="showAzure">Azure</McTableHead>
                    <McTableHead>Status</McTableHead>
                    <McTableHead>Created</McTableHead>
                    <McTableHead class="tw:text-right">Actions</McTableHead>
                </McTableRow>
            </McTableHeader>
            <McTableBody>
                <McTableRow v-for="u in pagedAccounts" :key="u.userID">
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
                        <McTableCell v-if="showAzure" class="tw:text-navy-60">
                            {{ u.azure_oid ? 'Linked' : 'Not linked' }}
                        </McTableCell>
                        <McTableCell>
                            <div class="tw:flex tw:items-center tw:gap-2">
                                <McSwitch v-model="editDraft.is_active" />
                                <span class="tw:text-sm tw:text-navy-60">
                                    {{ editDraft.is_active ? 'Active' : 'Inactive' }}
                                </span>
                            </div>
                        </McTableCell>
                        <McTableCell class="tw:text-navy-60">
                            {{ formatDate(u.created_at) }}
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
                        <McTableCell v-if="showAzure">
                            <McBadge :variant="u.azure_oid ? 'success' : 'outline'">
                                {{ u.azure_oid ? 'Linked' : 'Not linked' }}
                            </McBadge>
                        </McTableCell>
                        <McTableCell>
                            <McBadge :variant="u.is_active === false ? 'outline' : 'success'">
                                {{ u.is_active === false ? 'Inactive' : 'Active' }}
                            </McBadge>
                        </McTableCell>
                        <McTableCell class="tw:text-navy-60">
                            {{ formatDate(u.created_at) }}
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
                <McTableEmpty v-if="accounts.length === 0" :colspan="columnCount">
                    {{ emptyText }}
                </McTableEmpty>
            </McTableBody>
        </McTable>

        <div
            v-if="accounts.length > PAGE_SIZE"
            class="tw:flex tw:items-center tw:justify-end tw:pt-1"
        >
            <McPagination
                v-slot="{ page: current }"
                :items-per-page="PAGE_SIZE"
                :total="accounts.length"
                :sibling-count="1"
                show-edges
                :page="page"
                @update:page="page = $event"
            >
                <McPaginationContent v-slot="{ items }">
                    <McPaginationPrevious />
                    <template v-for="(item, index) in items" :key="index">
                        <McPaginationItem
                            v-if="item.type === 'page'"
                            :value="item.value"
                            :is-active="item.value === current"
                        >
                            {{ item.value }}
                        </McPaginationItem>
                        <McPaginationEllipsis v-else :key="item.type" :index="index" />
                    </template>
                    <McPaginationNext />
                </McPaginationContent>
            </McPagination>
        </div>
    </section>
</template>
