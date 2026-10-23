<template>
  <main class="user-view">
    <PageHeader
      :eyebrow="t('user.workbench.eyebrow')"
      :title="t('menu.users')"
      :description="t('user.workbench.pageDescription')"
    >
      <template #actions>
        <n-button size="small" :disabled="listLoading" @click="refreshList">{{ t('common.refresh') }}</n-button>
        <n-button size="small" quaternary @click="openCreate">{{ t('user.register') }}</n-button>
      </template>
    </PageHeader>

    <section class="stat-strip" :aria-label="t('user.workbench.statScope')">
      <div class="stat">
        <strong>{{ total }}</strong>
        <span>{{ t('user.workbench.statRegistered') }}</span>
      </div>
      <div class="stat">
        <strong :class="{ 'is-partial': coverage === 'partial' }">{{ userEntitiesById.size }}</strong>
        <span>{{ t('user.workbench.statCatalog') }}</span>
      </div>
      <div class="stat">
        <strong class="stat-time">{{ catalogUpdatedText }}</strong>
        <span>{{ t('user.workbench.statCatalogTime') }}</span>
      </div>
    </section>

    <WorkbenchSection :title="t('user.workbench.listTitle')" :description="t('user.workbench.searchDescription')">
      <template #actions>
        <div class="search-bar">
          <n-input
            v-model:value="searchText"
            :placeholder="t('user.searchPlaceholder')"
            clearable
            size="small"
          />
          <template v-if="searchActive">
            <span class="coverage" :class="{ 'is-partial': coverage === 'partial' || coverageError }">{{ coverageText }}</span>
            <span v-if="coverageError" class="coverage is-partial">
              {{ usersState.lastLoadedAt ? t('user.workbench.coverageStale') : t('user.workbench.coverageFailed') }}
            </span>
            <n-button size="tiny" quaternary :loading="catalogLoading" @click="reloadCatalog">
              {{ t('user.workbench.reloadCatalog') }}
            </n-button>
          </template>
        </div>
      </template>

      <p v-if="searchActive && filteredUsers.length === 0 && !catalogLoading" class="search-empty">
        {{ t('user.workbench.searchEmpty') }}
        <span class="search-empty-hint">{{ t('user.workbench.searchEmptyHint') }}</span>
      </p>

      <ServerPagedDataTable
        :columns="columns"
        :remote="!searchActive"
        :data="displayUsers"
        :loading="listLoading"
        :page="page"
        :page-size="pageSize"
        :total="totalItems"
        :row-props="rowProps"
        @update:page="page = $event"
        @update:page-size="pageSize = $event"
        @update:sorter="handleSortChange"
      />

      <p class="note-box">{{ t('user.workbench.scopeNote') }}</p>
    </WorkbenchSection>

    <n-drawer v-model:show="showDetail" :width="DETAIL_WIDTH" placement="right" :style="{ maxWidth: '92vw' }">
      <n-drawer-content :title="t('user.workbench.detailTitle')" closable>
        <UserDetailPanel
          v-if="selectedUser"
          :key="selectedUser.userId"
          :user="selectedUser"
          @rename="openRename(selectedUser)"
          @delete="handleDelete(selectedUser)"
        />
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="showCreateModal" preset="card" :title="t('user.register')" style="width: 360px; max-width: 92vw;" :bordered="true">
      <n-form label-placement="left" label-width="auto">
        <n-form-item :label="t('user.username')" required>
          <n-input v-model:value="createForm.name" :placeholder="t('user.inputUsername')" @keyup.enter="handleCreate" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-actions">
          <n-button @click="showCreateModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="createLoading" @click="handleCreate">{{ t('user.registerBtn') }}</n-button>
        </div>
      </template>
    </n-modal>

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
        <div class="modal-actions">
          <n-button @click="showRenameModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="renameLoading" @click="handleRename">{{ t('user.renameBtn') }}</n-button>
        </div>
      </template>
    </n-modal>
  </main>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, useMessage } from 'naive-ui'
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import { getUsers, createUser, renameUser, deleteUser } from '@/api/user'
import type { User } from '@/api/user'
import { usePagePolling } from '@/composables/usePagePolling'
import PageHeader from '@/components/PageHeader.vue'
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import { formatDateTime } from '@/utils/datetime'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { useI18n } from '@/stores/i18n'
import UserDetailPanel from './UserDetailPanel.vue'
import { compareSearchCoverage } from './userDetail'

const DETAIL_WIDTH = 560
const COVERAGE_PAGE_SIZE = 1

const message = useMessage()
const route = useRoute()
const { register } = usePagePolling()
const { t } = useI18n()
const { refreshUsers, ensureUsersLoaded, userEntitiesById, usersState } = useReferenceCatalog()

const users = ref<User[]>([])
const total = ref(0)
const loading = ref(false)
const searchText = ref('')
const page = ref(1)
const pageSize = ref(20)
const sortBy = ref<'createdAtMs' | 'updatedAtMs'>('createdAtMs')
const sortOrder = ref<'ascend' | 'descend'>('descend')
const catalogTotal = ref<number | null>(null)

const showDetail = ref(false)
const selectedUser = ref<User | null>(null)

const showCreateModal = ref(false)
const createLoading = ref(false)
const createForm = ref({ name: '' })

const showRenameModal = ref(false)
const renameLoading = ref(false)
const renameForm = ref({ userId: '', name: '' })

let fetchSequence = 0

const searchActive = computed(() => searchText.value.trim().length > 0)
const coverage = computed(() => compareSearchCoverage(userEntitiesById.value.size, catalogTotal.value))
const catalogLoading = computed(() => usersState.loading)
const coverageError = computed(() => Boolean(usersState.error))
const listLoading = computed(() => (searchActive.value ? catalogLoading.value : loading.value))

const catalogUpdatedText = computed(() => (usersState.lastLoadedAt ? formatDateTime(usersState.lastLoadedAt) : '-'))

const coverageText = computed(() => {
  const loaded = userEntitiesById.value.size
  const recent = usersState.lastLoadedAt ? formatDateTime(usersState.lastLoadedAt) : '-'
  if (catalogTotal.value === null) return t('user.workbench.coverageUnknown', { loaded, time: recent })
  return coverage.value === 'complete'
    ? t('user.workbench.coverageComplete', { loaded, total: catalogTotal.value, time: recent })
    : t('user.workbench.coveragePartial', { loaded, total: catalogTotal.value, time: recent })
})

const filteredUsers = computed(() => {
  const query = searchText.value.trim().toLowerCase()
  if (!query) return []
  const direction = sortOrder.value === 'ascend' ? 1 : -1
  return Array.from(userEntitiesById.value.values())
    .filter(user => user.userName?.toLowerCase().includes(query) || user.userId?.toLowerCase().includes(query))
    .sort((a, b) => {
      const timeOrder = (a[sortBy.value] - b[sortBy.value]) * direction
      return timeOrder || a.userId.localeCompare(b.userId)
    })
})

const displayUsers = computed(() => searchActive.value
  ? filteredUsers.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  : users.value)
const totalItems = computed(() => (searchActive.value ? filteredUsers.value.length : total.value))

const columns = computed<DataTableColumns<User>>(() => [
  {
    title: t('user.username'),
    key: 'userName',
    minWidth: 140,
    render: (row: User) => row.userName,
  },
  { title: t('user.userId'), key: 'userId', minWidth: 180, ellipsis: { tooltip: true } },
  {
    title: t('user.createdAt'),
    key: 'createdAtMs',
    minWidth: 170,
    sorter: 'default',
    sortOrder: sortBy.value === 'createdAtMs' ? sortOrder.value : false,
    render: (row: User) => formatDateTime(row.createdAtMs),
  },
  {
    title: t('user.updatedAt'),
    key: 'updatedAtMs',
    minWidth: 170,
    sorter: 'default',
    sortOrder: sortBy.value === 'updatedAtMs' ? sortOrder.value : false,
    render: (row: User) => formatDateTime(row.updatedAtMs),
  },
  {
    title: '',
    key: 'actions',
    width: 88,
    render: (row: User) => h(
      NButton,
      {
        size: 'tiny',
        quaternary: true,
        type: 'primary',
        onClick: (event: MouseEvent) => {
          event.stopPropagation()
          openDetail(row)
        },
      },
      () => t('user.workbench.openDetail'),
    ),
  },
])

const rowProps = (row: User) => ({
  style: 'cursor: pointer',
  onClick: () => openDetail(row),
})

function handleSortChange(sorter: DataTableSortState | null) {
  sortBy.value = sorter?.columnKey === 'updatedAtMs' ? 'updatedAtMs' : 'createdAtMs'
  sortOrder.value = sorter?.order === 'ascend' ? 'ascend' : 'descend'
  page.value = 1
}

async function loadCatalogCoverage() {
  try {
    const response = await getUsers({ page: 1, pageSize: COVERAGE_PAGE_SIZE })
    catalogTotal.value = typeof response?.total === 'number' && Number.isFinite(response.total) ? response.total : null
  } catch {
    catalogTotal.value = null
  }
}

async function fetchUsers() {
  if (searchActive.value) {
    await ensureUsersLoaded()
    return
  }
  const sequence = ++fetchSequence
  loading.value = true
  try {
    const response = await getUsers({
      page: page.value,
      pageSize: pageSize.value,
      sortBy: sortBy.value,
      ascending: sortOrder.value === 'ascend',
    })
    if (sequence !== fetchSequence) return
    users.value = Array.isArray(response.items) ? response.items : []
    total.value = typeof response.total === 'number' ? response.total : users.value.length
  } catch {
    if (sequence === fetchSequence) {
      users.value = []
      total.value = 0
    }
  } finally {
    if (sequence === fetchSequence) loading.value = false
  }
}

watch([searchText, page, pageSize, sortBy, sortOrder], (current, previous) => {
  const searchChanged = current[0] !== previous[0]
  const pageChanged = current[1] !== previous[1]
  const pageSizeChanged = current[2] !== previous[2]
  const sortChanged = current[3] !== previous[3] || current[4] !== previous[4]
  if ((searchChanged || pageSizeChanged) && page.value !== 1) {
    page.value = 1
    return
  }
  if (!searchActive.value && (searchChanged || pageChanged || pageSizeChanged || sortChanged)) {
    users.value = []
    if (searchChanged) total.value = 0
  }
  if (searchActive.value) {
    if (searchChanged) {
      void ensureUsersLoaded()
      void loadCatalogCoverage()
    }
    return
  }
  void fetchUsers()
})

function openCreate() {
  createForm.value.name = ''
  showCreateModal.value = true
}

function openDetail(user: User) {
  selectedUser.value = user
  showDetail.value = true
}

function openRename(user: User | null) {
  if (!user) return
  renameForm.value = { userId: user.userId, name: user.userName }
  showRenameModal.value = true
}

async function refreshCatalog() {
  await refreshUsers()
  await loadCatalogCoverage()
}

async function reloadCatalog() {
  await refreshCatalog()
  if (usersState.error) {
    message.error(t('user.workbench.catalogReloadFailed'))
  } else {
    message.success(t('user.workbench.catalogReloaded'))
  }
}

async function refreshList() {
  if (searchActive.value) {
    await refreshCatalog()
    return
  }
  users.value = []
  await fetchUsers()
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
    await refreshCatalog()
    const alreadyOnFirstPage = page.value === 1
    page.value = 1
    if (alreadyOnFirstPage) {
      users.value = []
      await fetchUsers()
    }
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
    if (selectedUser.value?.userId === renameForm.value.userId) {
      selectedUser.value = { ...selectedUser.value, userName: renameForm.value.name.trim() }
    }
    await refreshCatalog()
    if (!searchActive.value) await fetchUsers()
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

async function handleDelete(user: User | null) {
  if (!user) return
  try {
    await deleteUser(user.userId)
    message.success(t('user.deleted'))
    if (selectedUser.value?.userId === user.userId) {
      showDetail.value = false
      selectedUser.value = null
    }
    await refreshCatalog()
    if (!searchActive.value) await fetchUsers()
  } catch (e: any) {
    const err = e?.response?.data
    message.error(err?.message || t('user.deleteFailed'))
  }
}

watch(showDetail, (visible) => {
  if (!visible) selectedUser.value = null
})

onMounted(() => {
  void ensureUsersLoaded()
  void loadCatalogCoverage()
  register(fetchUsers, route.path)
})
</script>

<style scoped>
.user-view {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  max-width: var(--apple-content-max);
  margin: 0 auto;
  padding: var(--apple-space-6) var(--apple-page-gutter) var(--apple-space-8);
}

.stat-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--apple-space-2) var(--apple-space-8);
}

.stat {
  display: inline-flex;
  align-items: baseline;
  gap: var(--apple-space-2);
  min-width: 0;
}

.stat strong {
  color: var(--apple-gray-1);
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.stat strong.is-partial {
  color: var(--apple-orange);
}

.stat strong.stat-time {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0;
}

.stat span {
  color: var(--apple-gray-3);
  font-size: 12px;
}

.note-box {
  margin: var(--apple-space-4) 0 0;
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.7;
}

.search-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
}

.search-bar :deep(.n-input) {
  width: 260px;
  max-width: 100%;
}

.coverage {
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.45;
}

.coverage.is-partial {
  color: var(--apple-orange);
}

.search-empty {
  margin: 0 0 var(--apple-space-3);
  color: var(--apple-gray-2);
  font-size: 13px;
  line-height: 1.55;
}

.search-empty-hint {
  display: block;
  margin-top: var(--apple-space-1);
  color: var(--apple-gray-3);
  font-size: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--apple-space-2);
}

@media (max-width: 680px) {
  .search-bar :deep(.n-input) {
    width: 100%;
  }
}
</style>
