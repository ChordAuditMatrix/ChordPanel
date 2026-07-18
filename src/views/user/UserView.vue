<template>
  <div class="user-view">
    <n-card size="small" :bordered="true">
      <!-- Toolbar -->
      <div class="toolbar">
        <n-input v-model:value="searchText" :placeholder="t('user.searchPlaceholder')" clearable size="small" style="width: 240px;" />
        <n-button type="primary" size="small" @click="showCreateModal = true">
          {{ t('user.register') }}
        </n-button>
      </div>

      <!-- User table -->
      <DataTable
        :columns="columns"
        :data="filteredUsers"
        :loading="loading"
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
import { ref, computed, h, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NSpace, NPopconfirm, useMessage } from 'naive-ui'
import { getUsers, createUser, renameUser, deleteUser } from '@/api/user'
import type { User } from '@/api/user'
import { usePagePolling } from '@/composables/usePagePolling'
import DataTable from '@/components/DataTable.vue'
import { useI18n } from '@/stores/i18n'

const message = useMessage()
const route = useRoute()
const { register } = usePagePolling()
const { t } = useI18n()

const users = ref<User[]>([])
const loading = ref(false)
const searchText = ref('')

// Modal state
const showCreateModal = ref(false)
const createLoading = ref(false)
const createForm = ref({ name: '' })

const showRenameModal = ref(false)
const renameLoading = ref(false)
const renameForm = ref({ userId: '', name: '' })

// Pagination is managed by the DataTable component

const filteredUsers = computed(() => {
  if (!searchText.value) return users.value
  const q = searchText.value.toLowerCase()
  return users.value.filter(u =>
    u.userName?.toLowerCase().includes(q) || u.userId?.toLowerCase().includes(q)
  )
})

function formatTime(ms: number): string {
  if (!ms) return '-'
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

const columns = computed(() => [
  {
    title: t('user.username'),
    key: 'userName',
    minWidth: 120,
    render: (row: User) => h('span', { style: 'font-weight: 600;' }, row.userName),
  },
  { title: t('user.userId'), key: 'userId', ellipsis: { tooltip: true }, minWidth: 160, sorter: 'default' },
  { title: t('user.createdAt'), key: 'createdAtMs', minWidth: 160, sorter: 'default', defaultSortOrder: 'descend', render: (row: User) => formatTime(row.createdAtMs) },
  { title: t('user.updatedAt'), key: 'updatedAtMs', minWidth: 160, sorter: 'default', render: (row: User) => formatTime(row.updatedAtMs) },
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

async function fetchUsers() {
  loading.value = true
  try {
    const res = await getUsers({ pageSize: 1000 })
    users.value = ((res as any)?.items ?? []) as User[]
  } catch (e) {
    console.error('Failed to fetch users', e)
  } finally {
    loading.value = false
  }
}

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
    fetchUsers()
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
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
</style>
