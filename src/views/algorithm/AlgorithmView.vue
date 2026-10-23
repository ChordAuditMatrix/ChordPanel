<template>
  <main class="algorithm-workbench">
    <PageHeader :title="t('algorithm.workbench.title')" :description="t('algorithm.workbench.description')" :eyebrow="t('algorithm.workbench.eyebrow')">
      <template #meta>
        <span>{{ t('algorithm.workbench.strategyCount', { n: strategyTotal }) }}</span>
        <span>{{ t('algorithm.workbench.profileCount', { n: profileTotal }) }}</span>
      </template>
      <template #actions>
        <n-button type="primary" size="small" @click="openCreate()">{{ t('algorithm.workbench.initializeInstance') }}</n-button>
      </template>
    </PageHeader>

    <n-tabs v-model:value="activeTab" type="line" size="small" @update:value="onTabChange">
      <n-tab-pane name="strategies" :tab="t('algorithm.workbench.tabStrategies')">
        <AlgorithmStrategiesPanel
          :strategies="strategies"
          :loading="strategyLoading"
          :error="strategyError"
          :purpose="strategyPurpose"
          :profile-counts="profileCounts"
          :total="strategyTotal"
          @update:purpose="strategyPurpose = $event"
          @open-strategy="openStrategyDetail"
          @view-instances="showInstancesOf"
          @retry="fetchStrategies"
        />
      </n-tab-pane>

      <n-tab-pane name="profiles" :tab="t('algorithm.workbench.tabProfiles')">
        <div ref="profilesSectionRef">
          <AlgorithmProfilePanel
            :columns="profileColumns"
            :profiles="profiles"
            :loading="loading"
            :error="profileError"
            :page="profilePage"
            :page-size="profilePageSize"
            :total="profileTotal"
            :filter-type="filterType"
            :filter-purpose="filterPurpose"
            :type-options="typeOptions"
            :purpose-options="purposeOptions"
            :type-loading="strategyLoading"
            @update:page="profilePage = $event"
            @update:page-size="profilePageSize = $event"
            @update:filter-type="filterType = $event"
            @update:filter-purpose="filterPurpose = $event"
            @retry="fetchProfiles"
          />
        </div>
      </n-tab-pane>

      <n-tab-pane name="bindings" :tab="t('algorithm.workbench.tabBindings')">
        <AlgorithmBindingsPanel
          :rows="overviewRows"
          :loading="overviewLoading"
          :error="overviewError"
          :page="overviewPage"
          :page-size="overviewPageSize"
          :total="overviewTotal"
          @update:page="overviewPage = $event"
          @update:page-size="overviewPageSize = $event"
          @open-instance="openBindingInstance"
          @retry="fetchBindings"
        />
      </n-tab-pane>
    </n-tabs>

    <AlgorithmStrategyDetail
      v-model:show="showStrategyDetail"
      :strategy="selectedStrategy"
      :profile-count="selectedStrategyProfileCount"
      @create="createFromStrategy"
      @view-instances="instancesFromStrategy"
    />
    <AlgorithmCreateDialog
      v-model:show="showInitModal"
      v-model:algorithm-type="initForm.algorithmType"
      v-model:algorithm-name="initForm.algorithmName"
      v-model:params="initForm.params"
      :params-hint="initParamsHint"
      :type-options="createTypeOptions"
      :type-loading="strategyLoading"
      :loading="initLoading"
      :strategy="createStrategy"
      @submit="handleInit"
    />
    <AlgorithmBindingsDialog
      v-model:show="showBindModal"
      v-model:user-id="bindUserId"
      :profile="bindProfile"
      :strategy="bindStrategy"
      :columns="boundUserColumns"
      :users="boundUsers"
      :loading="bindLoading"
      :page="bindingPage"
      :page-size="bindingPageSize"
      :total="bindingTotal"
      :submit-loading="bindSubmitLoading"
      @update:page="bindingPage = $event"
      @update:page-size="bindingPageSize = $event"
      @submit="handleBindSubmit"
    />
    <AlgorithmProfileDetail
      v-model:show="showProfileDetail"
      :profile="detailProfile"
      :strategy="detailStrategy"
      :binding-total="detailBindingTotal"
      :bindings-loading="detailBindingsLoading"
      :bindings-error="detailBindingsError"
      :bound-users="detailBoundUsers"
      :session-jobs="detailSessionJobs"
      :deinit-loading="deinitLoading"
      @manage-bindings="openBindingsFromDetail"
      @retry-bindings="reloadDetailBindings"
      @open-job="openJob"
      @deinit="handleDetailDeinit"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NPopconfirm, NTag, useMessage } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  deinitProfile,
  getBindings,
  getProfiles,
  getStrategies,
  initProfile,
  listProfileBindings,
} from '@/api/algorithm'
import type { AlgorithmProfile, AlgorithmStrategy } from '@/api/algorithm'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { usePagePolling } from '@/composables/usePagePolling'
import { trackJob } from '@/stores/jobTracking'
import { useI18n } from '@/stores/i18n'
import type { KvHintItem } from '@/components/KeyValueEditor.vue'
import PageHeader from '@/components/PageHeader.vue'
import AlgorithmStrategiesPanel from '@/views/algorithm/AlgorithmStrategiesPanel.vue'
import AlgorithmProfilePanel from '@/views/algorithm/AlgorithmProfilePanel.vue'
import AlgorithmBindingsPanel from '@/views/algorithm/AlgorithmBindingsPanel.vue'
import AlgorithmStrategyDetail from '@/views/algorithm/AlgorithmStrategyDetail.vue'
import AlgorithmCreateDialog from '@/views/algorithm/AlgorithmCreateDialog.vue'
import AlgorithmBindingsDialog from '@/views/algorithm/AlgorithmBindingsDialog.vue'
import AlgorithmProfileDetail from '@/views/algorithm/AlgorithmProfileDetail.vue'
import { useAlgorithmBindings } from './useAlgorithmBindings'
import {
  countProfilesByType,
  describeProfileVersions,
  findStrategyByType,
  jobsForProfile,
} from './algorithmWorkbench'
import { strategyPurposeLabel } from './strategyLabels'
import type { BindingRowView, BoundUser, SessionJobLink } from './types'

const message = useMessage()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { register } = usePagePolling()
const {
  refreshAlgorithms,
  ensureAlgorithmsLoaded,
  ensureUsersLoaded,
  userEntitiesById,
  algorithmEntitiesById,
} = useReferenceCatalog()

const activeTab = ref('strategies')

const strategies = ref<AlgorithmStrategy[]>([])
const strategyTotal = ref(0)
const strategyLoading = ref(true)
const strategyError = ref(false)
const strategyPurpose = ref<string | null>(null)
let strategySequence = 0

const profiles = ref<AlgorithmProfile[]>([])
const loading = ref(true)
const profileError = ref(false)
const profilePage = ref(1)
const profilePageSize = ref(20)
const profileTotal = ref(0)
let profileSequence = 0

// Complete profile set used only for per-type instance counts.
const allProfiles = ref<AlgorithmProfile[]>([])
const allProfilesTotal = ref<number | null>(null)
const allProfilesError = ref(false)
let allProfilesSequence = 0

const overviewRows = ref<BindingRowView[]>([])
const overviewTotal = ref(0)
const overviewLoading = ref(false)
const overviewError = ref(false)
const overviewPage = ref(1)
const overviewPageSize = ref(20)
let overviewSequence = 0

const filterType = ref<string | null>(null)
const filterPurpose = ref<string | null>(null)

const showInitModal = ref(false)
const initLoading = ref(false)
const initForm = ref({ algorithmType: '', algorithmName: '', params: {} as Record<string, string> })
const initParamsHint = computed<KvHintItem[]>(() => [
  { key: 'masterKey', type: 'string', desc: t('algorithm.masterKeyHint') },
])

// Type options come from the strategy catalog already in memory: a type is
// selectable only when a registered strategy declares it for the chosen purpose.
const typeOptions = computed(() => {
  const types = strategies.value
    .filter(strategy => !filterPurpose.value || strategy.purpose === filterPurpose.value)
    .map(strategy => strategy.algorithmType)
  return Array.from(new Set(types)).map(type => ({ label: type, value: type }))
})
const createTypeOptions = computed(() => Array.from(new Set(strategies.value.map(strategy => strategy.algorithmType)))
  .map(type => ({ label: type, value: type })))
const purposeOptions = computed(() => [
  { label: strategyPurposeLabel('Audit', t), value: 'Audit' },
  { label: strategyPurposeLabel('Identity', t), value: 'Identity' },
])

const {
  showBindModal, bindLoading, bindSubmitLoading, bindProfile, bindUserId, boundUsers,
  bindingPage, bindingPageSize, bindingTotal, openBindModal, handleBind, handleUnbind,
} = useAlgorithmBindings()

const sessionJobs = ref<SessionJobLink[]>([])
const profilesSectionRef = ref<HTMLElement | null>(null)

const showStrategyDetail = ref(false)
const selectedStrategyType = ref<string | null>(null)

const showProfileDetail = ref(false)
const detailProfile = ref<AlgorithmProfile | null>(null)
const detailBoundUsers = ref<BoundUser[]>([])
const detailBindingTotal = ref<number | null>(null)
const detailBindingsLoading = ref(false)
const detailBindingsError = ref(false)
const deinitLoading = ref(false)
let detailBindingSequence = 0

const profileCounts = computed(() =>
  allProfilesError.value ? null : countProfilesByType(allProfiles.value, allProfilesTotal.value),
)
const selectedStrategy = computed(() => findStrategyByType(strategies.value, selectedStrategyType.value))
const selectedStrategyProfileCount = computed(() => {
  const counts = profileCounts.value
  const type = selectedStrategyType.value
  if (!counts || !type) return null
  return counts.get(type) ?? 0
})
const createStrategy = computed(() => findStrategyByType(strategies.value, initForm.value.algorithmType))
const bindStrategy = computed(() => findStrategyByType(strategies.value, bindProfile.value?.algorithmType))
const detailStrategy = computed(() => findStrategyByType(strategies.value, detailProfile.value?.algorithmType))
const detailSessionJobs = computed(() => jobsForProfile(sessionJobs.value, detailProfile.value?.algorithmId))

const boundUserColumns = computed<DataTableColumns<BoundUser>>(() => [
  {
    title: t('user.username'), key: 'userName', width: 120, ellipsis: { tooltip: true },
    render: (row: BoundUser) => row.userName || h('span', { style: 'color:var(--apple-gray-3);font-style:italic' }, t('algorithm.workbench.userNameUnavailable')),
  },
  { title: t('user.userId'), key: 'userId', minWidth: 200, ellipsis: { tooltip: true } },
  {
    title: t('common.actions'), key: 'actions', width: 96,
    render: (row: BoundUser) => h(NPopconfirm, { onPositiveClick: () => handleUnbind(row), positiveText: t('common.confirm'), negativeText: t('common.cancel') }, {
      trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, () => t('algorithm.unbindUser')),
      default: () => t('algorithm.unbindConfirm', { name: row.userName || row.userId }),
    }),
  },
])

const profileColumns = computed<DataTableColumns<AlgorithmProfile>>(() => [
  {
    title: t('algorithm.algorithmName'), key: 'algorithmName', minWidth: 140,
    render: (row: AlgorithmProfile) => h('span', { style: 'font-weight:600' }, row.algorithmName),
  },
  { title: t('algorithm.algorithmType'), key: 'algorithmType', minWidth: 100 },
  {
    title: t('algorithm.purpose'), key: 'purpose', width: 92,
    render: (row: AlgorithmProfile) => h(NTag, { size: 'small', type: row.purpose === 'Audit' ? 'success' : 'info', bordered: false }, () => strategyPurposeLabel(row.purpose, t)),
  },
  {
    title: t('algorithm.workbench.profileVersion'), key: 'version', width: 104,
    render: (row: AlgorithmProfile) => h('span', { style: 'font-variant-numeric:tabular-nums' }, String(row.version)),
  },
  {
    title: t('algorithm.workbench.pluginVersion'), key: 'pluginVersion', width: 110,
    render: (row: AlgorithmProfile) => {
      const pluginVersion = describeProfileVersions(row.version, findStrategyByType(strategies.value, row.algorithmType)?.version).pluginVersion
      return pluginVersion
        ? h('span', { style: 'font-family:var(--apple-font-mono);font-size:12px' }, pluginVersion)
        : h('span', { style: 'color:var(--apple-gray-3);font-style:italic' }, t('algorithm.workbench.pluginVersionUnknown'))
    },
  },
  { title: t('algorithm.algorithmId'), key: 'algorithmId', minWidth: 160, ellipsis: { tooltip: true } },
  {
    title: t('common.actions'), key: 'actions', width: 212,
    render: (row: AlgorithmProfile) => h('div', { style: 'display:flex;gap:6px;' }, [
      h(NButton, { size: 'small', ghost: true, onClick: () => openProfileDetail(row) }, () => t('algorithm.workbench.detail')),
      h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openBindings(row) }, () => t('algorithm.bindUser')),
      h(NPopconfirm, { onPositiveClick: () => handleDeinit(row), positiveText: t('common.delete'), negativeText: t('common.cancel') }, {
        trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, () => t('common.delete')),
        default: () => t('algorithm.deleteConfirm', { name: row.algorithmName }),
      }),
    ]),
  },
])

async function fetchStrategies() {
  const sequence = ++strategySequence
  strategyLoading.value = true
  strategyError.value = false
  try {
    const first = await getStrategies({ page: 1, pageSize: 1000 })
    const items = [...first.items]
    const totalPages = first.totalPages > 0
      ? first.totalPages
      : first.total > 0
        ? Math.ceil(first.total / 1000)
        : items.length > 0 ? 1 : 0
    for (let page = 2; page <= totalPages; page++) {
      const next = await getStrategies({ page, pageSize: 1000 })
      if (next.items.length === 0) break
      items.push(...next.items)
    }
    if (sequence !== strategySequence) return
    strategies.value = items
    strategyTotal.value = first.total
  } catch (error) {
    if (sequence === strategySequence) {
      strategyError.value = true
      console.error(error)
    }
  } finally {
    if (sequence === strategySequence) strategyLoading.value = false
  }
}

async function fetchProfiles() {
  const sequence = ++profileSequence
  loading.value = true
  profileError.value = false
  try {
    const response = await getProfiles({
      page: profilePage.value,
      pageSize: profilePageSize.value,
      type: filterType.value || undefined,
      purpose: filterPurpose.value || undefined,
    })
    if (sequence !== profileSequence) return
    profiles.value = response.items
    profileTotal.value = response.total
  } catch (error) {
    if (sequence === profileSequence) {
      profileError.value = true
      console.error(error)
    }
  } finally {
    if (sequence === profileSequence) loading.value = false
  }
}

/**
 * Fetch every profile page once so per-type instance counts are exact.
 * If the server keeps returning fewer items than its own total, the count
 * stays unknown instead of being understated.
 */
async function fetchAllProfiles() {
  const sequence = ++allProfilesSequence
  allProfilesError.value = false
  try {
    const first = await getProfiles({ page: 1, pageSize: 1000 })
    const items = [...first.items]
    const totalPages = first.totalPages > 0
      ? first.totalPages
      : first.total > 0
        ? Math.ceil(first.total / 1000)
        : items.length > 0 ? 1 : 0
    for (let page = 2; page <= totalPages; page++) {
      const next = await getProfiles({ page, pageSize: 1000 })
      if (next.items.length === 0) break
      items.push(...next.items)
    }
    if (sequence !== allProfilesSequence) return
    allProfiles.value = items
    allProfilesTotal.value = first.total
  } catch (error) {
    if (sequence === allProfilesSequence) {
      allProfilesError.value = true
      console.error(error)
    }
  }
}

async function fetchBindings() {
  const sequence = ++overviewSequence
  overviewLoading.value = true
  overviewError.value = false
  try {
    const response = await getBindings({ page: overviewPage.value, pageSize: overviewPageSize.value })
    await ensureUsersLoaded()
    await ensureAlgorithmsLoaded()
    if (sequence !== overviewSequence) return
    overviewRows.value = response.items.map(binding => ({
      ...binding,
      userName: userEntitiesById.value.get(binding.userId)?.userName,
      algorithmName: algorithmEntitiesById.value.get(binding.algorithmId)?.algorithmName,
    }))
    overviewTotal.value = response.total
  } catch (error) {
    if (sequence === overviewSequence) {
      overviewError.value = true
      console.error(error)
    }
  } finally {
    if (sequence === overviewSequence) overviewLoading.value = false
  }
}

function refreshActiveTab(tab = activeTab.value) {
  if (tab === 'profiles') {
    void fetchProfiles()
    void fetchAllProfiles()
  } else if (tab === 'bindings') {
    void fetchBindings()
  } else {
    void fetchStrategies()
    void fetchAllProfiles()
  }
}

function onTabChange(value: string | number) {
  refreshActiveTab(String(value))
}

function openStrategyDetail(algorithmType: string) {
  selectedStrategyType.value = algorithmType
  showStrategyDetail.value = true
}

function createFromStrategy(algorithmType: string) {
  showStrategyDetail.value = false
  openCreate(algorithmType)
}

function instancesFromStrategy(algorithmType: string) {
  showStrategyDetail.value = false
  showInstancesOf(algorithmType)
}

function showInstancesOf(algorithmType: string) {
  const strategy = findStrategyByType(strategies.value, algorithmType)
  if (strategy) filterPurpose.value = strategy.purpose
  filterType.value = algorithmType
  activeTab.value = 'profiles'
  void nextTick(() => profilesSectionRef.value?.scrollIntoView({ block: 'start' }))
}

function openCreate(presetType?: string) {
  initForm.value = { algorithmType: presetType || '', algorithmName: '', params: {} }
  showInitModal.value = true
}

function openBindingInstance(algorithmId: string) {
  const profile = allProfiles.value.find(item => item.algorithmId === algorithmId)
    ?? algorithmEntitiesById.value.get(algorithmId)
  if (profile) {
    openProfileDetail(profile)
    return
  }
  message.warning(t('algorithm.workbench.instanceNotInCatalog'))
}

function rememberSessionJob(jobId: string, algorithmId: string, kind: SessionJobLink['kind']) {
  sessionJobs.value = [
    ...sessionJobs.value.filter(job => job.jobId !== jobId || job.kind !== kind),
    { jobId, algorithmId, kind, recordedAtMs: Date.now() },
  ]
}

async function refreshAfterMutation() {
  await refreshAlgorithms()
  await Promise.all([fetchProfiles(), fetchAllProfiles()])
  if (activeTab.value === 'bindings') await fetchBindings()
}

async function handleInit() {
  if (!initForm.value.algorithmType || !initForm.value.algorithmName.trim()) {
    message.warning(t('common.fillComplete'))
    return
  }
  initLoading.value = true
  try {
    const created = await initProfile(initForm.value.algorithmType, initForm.value.algorithmName.trim(), initForm.value.params)
    message.success(t('algorithm.createSuccess'))
    // Profile initialization is an async job — surface it in the global async job drawer.
    trackJob(created.jobId, 'Algorithm')
    rememberSessionJob(created.jobId, created.algorithmId, 'init')
    showInitModal.value = false
    initForm.value = { algorithmType: '', algorithmName: '', params: {} }
    await refreshAfterMutation()
    activeTab.value = 'profiles'
    openProfileDetail({
      algorithmId: created.algorithmId,
      algorithmType: created.algorithmType,
      algorithmName: created.algorithmName,
      version: created.version,
      purpose: created.purpose,
    })
  } catch (error: any) {
    message.error(error?.response?.data?.message || t('algorithm.createFailed'))
  } finally {
    initLoading.value = false
  }
}

async function handleBindSubmit() {
  const created = await handleBind()
  if (!created) return
  trackJob(created.jobId, 'Algorithm')
  rememberSessionJob(created.jobId, created.algorithmId, 'bind')
  if (showProfileDetail.value && detailProfile.value?.algorithmId === created.algorithmId) {
    await loadDetailBindings(created.algorithmId)
  }
  if (activeTab.value === 'bindings') await fetchBindings()
}

async function handleDeinit(profile: AlgorithmProfile) {
  deinitLoading.value = true
  try {
    await deinitProfile(profile.algorithmId)
    message.success(t('algorithm.deleteSuccess'))
    if (detailProfile.value?.algorithmId === profile.algorithmId) {
      showProfileDetail.value = false
      detailProfile.value = null
    }
    sessionJobs.value = sessionJobs.value.filter(job => job.algorithmId !== profile.algorithmId)
    await refreshAfterMutation()
  } catch (error: any) {
    message.error(error?.response?.data?.message || t('algorithm.deleteFailed'))
  } finally {
    deinitLoading.value = false
  }
}

function handleDetailDeinit() {
  if (detailProfile.value) void handleDeinit(detailProfile.value)
}

function openBindings(profile: AlgorithmProfile) {
  void openBindModal(profile)
}

function openBindingsFromDetail() {
  if (detailProfile.value) void openBindModal(detailProfile.value)
}

async function loadDetailBindings(algorithmId: string) {
  const sequence = ++detailBindingSequence
  detailBindingsLoading.value = true
  detailBindingsError.value = false
  try {
    const response = await listProfileBindings(algorithmId, { page: 1, pageSize: 5 })
    await ensureUsersLoaded()
    if (sequence !== detailBindingSequence) return
    detailBoundUsers.value = response.items.map(binding => ({
      userId: binding.userId,
      userName: userEntitiesById.value.get(binding.userId)?.userName,
    }))
    detailBindingTotal.value = response.total
  } catch (error) {
    if (sequence !== detailBindingSequence) return
    detailBindingsError.value = true
    detailBindingTotal.value = null
    detailBoundUsers.value = []
    console.error(error)
  } finally {
    if (sequence === detailBindingSequence) detailBindingsLoading.value = false
  }
}

function reloadDetailBindings() {
  const profile = detailProfile.value
  if (profile) void loadDetailBindings(profile.algorithmId)
}

function openProfileDetail(profile: AlgorithmProfile) {
  detailProfile.value = profile
  detailBoundUsers.value = []
  detailBindingTotal.value = null
  detailBindingsError.value = false
  showProfileDetail.value = true
  void loadDetailBindings(profile.algorithmId)
}

function openJob(jobId: string) {
  void router.push({ name: 'executionDetail', params: { jobId } })
}

watch([filterPurpose, strategies], () => {
  if (filterType.value && !typeOptions.value.some(option => option.value === filterType.value)) {
    filterType.value = null
  }
})
watch([filterType, filterPurpose, profilePage, profilePageSize], (current, previous) => {
  const filtersChanged = current[0] !== previous[0] || current[1] !== previous[1]
  const pageChanged = current[2] !== previous[2]
  const pageSizeChanged = current[3] !== previous[3]
  if (filtersChanged || pageChanged || pageSizeChanged) {
    profiles.value = []
    if (filtersChanged) profileTotal.value = 0
  }
  if ((filtersChanged || pageSizeChanged) && profilePage.value !== 1) {
    profilePage.value = 1
    return
  }
  void fetchProfiles()
})
watch([overviewPage, overviewPageSize], ([page, pageSize], [previousPage, previousPageSize]) => {
  if (pageSize !== previousPageSize && page !== 1) {
    overviewPage.value = 1
    return
  }
  if (page !== previousPage || pageSize !== previousPageSize) void fetchBindings()
})
watch(showBindModal, shown => {
  if (!shown && showProfileDetail.value) reloadDetailBindings()
})

onMounted(() => {
  void fetchProfiles()
  register(refreshActiveTab, route.path)
})
</script>

<style scoped>
.algorithm-workbench {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-4, 16px);
  width: 100%;
  max-width: var(--apple-content-max, 1440px);
  margin: 0 auto;
  padding-bottom: var(--apple-space-8, 32px);
  min-width: 0;
}
</style>
