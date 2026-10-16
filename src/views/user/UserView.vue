<template>
  <div class="user-view">
    <n-card size="small" :bordered="true">
      <!-- Toolbar -->
      <PageToolbar>
        <n-input v-model:value="searchText" :placeholder="t('user.searchPlaceholder')" clearable size="small" style="width: 240px;" />
        <template #actions>
          <n-button type="primary" size="small" @click="showCreateModal = true">
            {{ t('user.register') }}
          </n-button>
        </template>
      </PageToolbar>

      <ServerPagedDataTable
        :columns="columns"
        :remote="true"
        :data="displayUsers"
        :loading="loading"
        :page="page"
        :page-size="pageSize"
        :total="totalItems"
        @update:page="page = $event"
        @update:page-size="pageSize = $event"
        @update:sorter="handleSortChange"
      />
</n-card>

    <!-- Register user modal -->
    <n-modal v-model:show="showCreateModal" preset="card" :title="t('user.register')" style="width: 360px; max-width: 92vw;" :bordered="true">
      <n-form label-placement="left" label-width="auto">
        <n-form-item :label="t('user.username')" required>
          <n-input v-model:value="createForm.name" :placeholder="t('user.inputUsername')" @keyup.enter="handleCreate" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <n-button @click="showCreateModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="createLoading" @click="handleCreate">{{ t('user.registerBtn') }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- Rename modal -->
    <n-modal v-model:show="showRenameModal" preset="card" :title="t('user.rename')" style="width: 360px; max-width: 92vw;" :bordered="true">
      <n-form label-placement="left" label-width="auto">
        <n-form-item :label="t('user.userId')">
          <n-text depth="3" code>{{ renameForm.userId }}</n-text>
        </n-form-item>
        <n-form-item :label="t('user.newUsername')" required>
          <n-input v-model:value="renameForm.name" :placeholder="t('user.inputNewUsername')" @keyup.enter="handleRename" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <n-button @click="showRenameModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="renameLoading" @click="handleRename">{{ t('user.renameBtn') }}</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NSpace, NPopconfirm, useMessage } from 'naive-ui'
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import { getUsers, createUser, renameUser, deleteUser } from '@/api/user'
import type { User } from '@/api/user'
import { usePagePolling } from '@/composables/usePagePolling'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import PageToolbar from '@/components/PageToolbar.vue'
import { formatDateTime } from '@/utils/datetime'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { useI18n } from '@/stores/i18n'

const message = useMessage()
const route = useRoute()
const { register } = usePagePolling()
const { t } = useI18n()
const { refreshUsers, ensureUsersLoaded, userEntitiesById } = useReferenceCatalog()

const users = ref<User[]>([])
const total = ref(0)
const loading = ref(false)
const searchText = ref('')
const page = ref(1)
const pageSize = ref(20)
const sortBy = ref<'createdAtMs' | 'updatedAtMs'>('createdAtMs')
const sortOrder = ref<'ascend' | 'descend'>('descend')
let fetchSequence = 0

// Modal state
const showCreateModal = ref(false)
const createLoading = ref(false)
const createForm = ref({ name: '' })

const showRenameModal = ref(false)
const renameLoading = ref(false)
const renameForm = ref({ userId: '', name: '' })

const filteredUsers = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  if (!q) return []
  const direction = sortOrder.value === 'ascend' ? 1 : -1
  return Array.from(userEntitiesById.value.values())
    .filter(u => u.userName?.toLowerCase().includes(q) || u.userId?.toLowerCase().includes(q))
    .sort((a, b) => {
      const timeOrder = (a[sortBy.value] - b[sortBy.value]) * direction
      return timeOrder || a.userId.localeCompare(b.userId)
    })
})
const displayUsers = computed(() => searchText.value.trim()
  ? filteredUsers.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  : users.value)
const totalItems = computed(() => searchText.value.trim() ? filteredUsers.value.length : total.value)

const columns = computed<DataTableColumns<User>>(() => [
  {
    title: t('user.username'),
    key: 'userName',
    minWidth: 120,
    render: (row: User) => h('span', { style: 'font-weight: 600;' }, row.userName),
  },
  { title: t('user.userId'), key: 'userId', ellipsis: { tooltip: true }, minWidth: 160 },
  { title: t('user.createdAt'), key: 'createdAtMs', minWidth: 160, sorter: 'default', sortOrder: sortBy.value === 'createdAtMs' ? sortOrder.value : false, render: (row: User) => formatDateTime(row.createdAtMs) },
  { title: t('user.updatedAt'), key: 'updatedAtMs', minWidth: 160, sorter: 'default', sortOrder: sortBy.value === 'updatedAtMs' ? sortOrder.value : false, render: (row: User) => formatDateTime(row.updatedAtMs) },
  {
    title: t('common.actions'),
    key: 'actions',
    width: 140,
    render: (row: User) => h(NSpace, { size: 4 }, () => [
      h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openRename(row) }, () => t('common.edit')),
      h(NPopconfirm, {
        onPositiveClick: () => handleDelete(row),
        positiveText: t('common.delete'),
        negativeText: t('common.cancel'),
      }, {
        trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, () => t('common.delete')),
        default: () => t('user.deleteConfirm', { name: row.userName }),
      }),
    ]),
  },
])
function handleSortChange(sorter: DataTableSortState | null) {
  sortBy.value = sorter?.columnKey === 'updatedAtMs' ? 'updatedAtMs' : 'createdAtMs'
  sortOrder.value = sorter?.order === 'ascend' ? 'ascend' : 'descend'
  page.value = 1
}

async function fetchUsers() {
  const sequence = ++fetchSequence
  loading.value = true
  try {
    if (searchText.value.trim()) {
      await ensureUsersLoaded()
      if (sequence !== fetchSequence) return
    } else {
      const response = await getUsers({
        page: page.value,
        pageSize: pageSize.value,
        sortBy: sortBy.value,
        ascending: sortOrder.value === 'ascend',
      })
      if (sequence !== fetchSequence) return
      users.value = response.items
      total.value = response.total
    }
  } catch (e) {
    if (sequence === fetchSequence) console.error('Failed to fetch users', e)
  } finally {
    if (sequence === fetchSequence) loading.value = false
  }
}

watch([searchText, page, pageSize, sortBy, sortOrder], (current, previous) => {
  const searchChanged = current[0] !== previous[0]
  const pageChanged = current[1] !== previous[1]
  const pageSizeChanged = current[2] !== previous[2]
  const sortChanged = current[3] !== previous[3] || current[4] !== previous[4]
  if (!searchText.value.trim() && (searchChanged || pageChanged || pageSizeChanged || sortChanged)) {
    users.value = []
    if (searchChanged) total.value = 0
  }
  if ((searchChanged || pageSizeChanged) && page.value !== 1) {
    page.value = 1
    return
  }
  fetchUsers()
})


async function handleCreate() {
  if (!createForm.value.name.trim()) {
    message.warning(t('user.enterUsername'))
    return
  }
  createLoading.value = true
  try {
    await createUser(createForm.value.name.trim())
    message.success(t('user.registerSuccess'))
    showCreateModal.value = false
    createForm.value.name = ''
    await refreshUsers()
    const alreadyOnFirstPage = page.value === 1
    page.value = 1
    if (alreadyOnFirstPage) fetchUsers()
  } catch (e: any) {
    const err = e?.response?.data
    if (err?.error === 'DuplicateUserName') {
      message.error(t('user.duplicateName'))
    } else {
      message.error(err?.message || t('user.registerFailed'))
    }
  } finally {
    createLoading.value = false
  }
}

function openRename(user: User) {
  renameForm.value = { userId: user.userId, name: user.userName }
  showRenameModal.value = true
}

async function handleRename() {
  if (!renameForm.value.name.trim()) {
    message.warning(t('user.enterNewUsername'))
    return
  }
  renameLoading.value = true
  try {
    await renameUser(renameForm.value.userId, renameForm.value.name.trim())
    message.success(t('user.renameSuccess'))
    showRenameModal.value = false
    await refreshUsers()
    fetchUsers()
  } catch (e: any) {
    const err = e?.response?.data
    if (err?.error === 'DuplicateUserName') {
      message.error(t('user.nameTaken'))
    } else if (err?.error === 'UserNotFound') {
      message.error(t('user.userNotFound'))
    } else {
      message.error(err?.message || t('user.renameFailed'))
    }
  } finally {
    renameLoading.value = false
  }
}

async function handleDelete(user: User) {
  try {
    await deleteUser(user.userId)
    message.success(t('user.deleted'))
    await refreshUsers()
    fetchUsers()
  } catch (e: any) {
    const err = e?.response?.data
    message.error(err?.message || t('user.deleteFailed'))
  }
}

// Global polling registration
onMounted(() => { register(fetchUsers, route.path) })
</script>

<style scoped>
.user-view {
  max-width: 1200px;
}
</style>
