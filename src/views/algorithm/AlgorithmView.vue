<template>
  <div class="algo-view">
    <n-tabs type="line" size="small" v-model:value="activeTab">
      <n-tab-pane name="profiles" :tab="t('algorithm.profiles')">
        <AlgorithmProfilePanel
          :columns="profileColumns"
          :profiles="profiles"
          :loading="loading"
          :filter-type="filterType"
          :filter-purpose="filterPurpose"
          :type-options="typeOptions"
          :purpose-options="purposeOptions"
          :type-loading="typeLoading"
          @update:filter-type="filterType = $event"
          @update:filter-purpose="filterPurpose = $event"
          @create="showInitModal = true"
        />
      </n-tab-pane>
      <n-tab-pane name="strategies" :tab="t('algorithm.strategies')">
        <AlgorithmStrategiesPanel :columns="strategyColumns" :strategies="strategies" :loading="strategyLoading" />
      </n-tab-pane>
    </n-tabs>

    <AlgorithmCreateDialog
      v-model:show="showInitModal"
      v-model:algorithm-type="initForm.algorithmType"
      v-model:algorithm-name="initForm.algorithmName"
      v-model:params="initForm.params"
      :params-hint="initParamsHint"
      :type-options="typeOptions"
      :type-loading="typeLoading"
      :loading="initLoading"
      @submit="handleInit"
    />
    <AlgorithmBindingsDialog
      v-model:show="showBindModal"
      v-model:user-id="bindUserId"
      :profile="bindProfile"
      :columns="boundUserColumns"
      :users="boundUsers"
      :loading="bindLoading"
      :submit-loading="bindSubmitLoading"
      @submit="handleBind"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NTag, NPopconfirm, useMessage } from 'naive-ui'
import { getStrategies, initProfile, deinitProfile, listAlgorithmTypes, listProfileBindings, bindUser, unbindUser } from '@/api/algorithm'
import type { AlgorithmStrategy, AlgorithmProfile } from '@/api/algorithm'
import type { DataTableColumns } from 'naive-ui'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import AlgorithmProfilePanel from '@/views/algorithm/AlgorithmProfilePanel.vue'
import AlgorithmStrategiesPanel from '@/views/algorithm/AlgorithmStrategiesPanel.vue'
import AlgorithmCreateDialog from '@/views/algorithm/AlgorithmCreateDialog.vue'
import AlgorithmBindingsDialog from '@/views/algorithm/AlgorithmBindingsDialog.vue'
import { type KvHintItem } from '@/components/KeyValueEditor.vue'
import { usePagePolling } from '@/composables/usePagePolling'
import { trackJob } from '@/stores/jobTracking'
import { useI18n } from '@/stores/i18n'
const message = useMessage()
const { t } = useI18n()
const { algorithmEntitiesById, userEntitiesById, ensureAlgorithmsLoaded, refreshAlgorithms, ensureUsersLoaded } = useReferenceCatalog()
const route = useRoute()
const { register } = usePagePolling()
const loading = ref(false)
const strategyLoading = ref(false)
const profiles = ref<AlgorithmProfile[]>([])
const strategies = ref<AlgorithmStrategy[]>([])
const filterType = ref<string | null>(null)
const filterPurpose = ref<string | null>(null)
const activeTab = ref('profiles')

const showInitModal = ref(false)
const initLoading = ref(false)
const initForm = ref({ algorithmType: '', algorithmName: '', params: {} as Record<string, string> })
const initParamsHint = computed<KvHintItem[]>(() => [
  { key: 'masterKey', type: 'string', desc: t('algorithm.masterKeyHint') },
])

// Algorithm type options are loaded from the backend via listAlgorithmTypes (deduplicated from strategies).
// The list is filtered by the currently selected purpose (if any) so that only applicable types are shown.
const typeLoading = ref(false)
const algoTypes = ref<string[]>([])
const typeOptions = computed(() => algoTypes.value.map(t => ({ label: t, value: t })))
const purposeOptions = [
  { label: 'Audit', value: 'Audit' },
  { label: 'Identity', value: 'Identity' },
]

// ---- User key binding ----
interface BoundUser { userId: string; userName?: string }
const showBindModal = ref(false)
const bindLoading = ref(false)
const bindSubmitLoading = ref(false)
const bindProfile = ref<AlgorithmProfile | null>(null)
const bindUserId = ref('')
const boundUsers = ref<BoundUser[]>([])

const boundUserColumns = computed<DataTableColumns<BoundUser>>(() => [
  { title: t('user.username'), key: 'userName', width: 120, render: (r: BoundUser) => r.userName || h('span', { style: 'color:var(--apple-gray-3, #6E6E73);font-style:italic' }, r.userId) },
  { title: t('user.userId'), key: 'userId', minWidth: 260, ellipsis: { tooltip: true } },
  {
    title: t('common.actions'), key: 'actions', width: 120,
    render: (r: BoundUser) => h(NPopconfirm, { onPositiveClick: () => handleUnbind(r), positiveText: t('common.confirm'), negativeText: t('common.cancel') }, {
      trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, () => t('algorithm.unbindUser')),
      default: () => t('algorithm.unbindConfirm', { name: r.userName || r.userId }),
    }),
  },
])

async function loadAlgoTypes() {
  typeLoading.value = true
  try {
    algoTypes.value = await listAlgorithmTypes(filterPurpose.value || undefined)
  } catch (e) { console.error(e) } finally { typeLoading.value = false }
}

// Pagination is managed by the DataTable component

const profileColumns = computed<DataTableColumns<AlgorithmProfile>>(() => [
  { title: t('algorithm.algorithmName'), key: 'algorithmName', minWidth: 120, sorter: 'default', render: (r: AlgorithmProfile) => h('span', { style: 'font-weight:600' }, r.algorithmName) },
  { title: t('algorithm.algorithmType'), key: 'algorithmType', minWidth: 100, sorter: 'default' },
  { title: t('algorithm.purpose'), key: 'purpose', minWidth: 70, sorter: 'default', render: (r: AlgorithmProfile) => h(NTag, { size: 'small', type: r.purpose === 'Audit' ? 'success' : 'info', bordered: false }, () => r.purpose) },
  { title: t('algorithm.version'), key: 'version', minWidth: 60, sorter: 'default' },
  { title: t('algorithm.algorithmId'), key: 'algorithmId', ellipsis: { tooltip: true }, minWidth: 160, sorter: 'default' },
  {
    title: t('common.actions'), key: 'actions', width: 160,
    render: (r: AlgorithmProfile) => h('div', { style: 'display:flex;gap:6px;' }, [
      h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openBindModal(r) }, () => t('algorithm.bindUser')),
      h(NPopconfirm, { onPositiveClick: () => handleDeinit(r), positiveText: t('common.delete'), negativeText: t('common.cancel') }, {
        trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, () => t('common.delete')),
        default: () => t('algorithm.deleteConfirm', { name: r.algorithmName }),
      }),
    ]),
  },
])

const strategyColumns = computed<DataTableColumns<AlgorithmStrategy>>(() => [
  { title: t('algorithm.algorithmType'), key: 'algorithmType', width: 160, sorter: 'default', render: (r: AlgorithmStrategy) => h('span', { style: 'font-weight:600' }, r.algorithmType) },
  { title: t('algorithm.purpose'), key: 'purpose', width: 100, sorter: 'default', render: (r: AlgorithmStrategy) => h(NTag, { size: 'small', type: r.purpose === 'Audit' ? 'success' : 'info', bordered: false }, () => r.purpose) },
  { title: t('algorithm.version'), key: 'version', width: 80, sorter: 'default' },
])

async function fetchProfiles() {
  loading.value = true
  try {
    await ensureAlgorithmsLoaded()
    profiles.value = Array.from(algorithmEntitiesById.value.values()).filter(profile =>
      (!filterType.value || profile.algorithmType === filterType.value)
      && (!filterPurpose.value || profile.purpose === filterPurpose.value))
  } catch (e) { console.error(e) } finally { loading.value = false }
}

async function fetchStrategies() {
  strategyLoading.value = true
  try {
    const res = await getStrategies({ pageSize: 1000 })
    strategies.value = ((res as any)?.items ?? []) as AlgorithmStrategy[]
  } catch (e) { console.error(e) } finally { strategyLoading.value = false }
}

async function handleInit() {
  if (!initForm.value.algorithmType || !initForm.value.algorithmName.trim()) { message.warning(t('common.fillComplete')); return }
  initLoading.value = true
  try {
    const res: any = await initProfile(initForm.value.algorithmType, initForm.value.algorithmName.trim(), initForm.value.params)
    message.success(t('algorithm.createSuccess'))
    // Profile initialization is an async job — surface it in the global async job drawer
    if (res?.jobId) trackJob(res.jobId, 'Algorithm')
    showInitModal.value = false
    initForm.value = { algorithmType: '', algorithmName: '', params: {} }
    await refreshAlgorithms()
    await fetchProfiles()
  } catch (e: any) {
    message.error(e?.response?.data?.message || t('algorithm.createFailed'))
  } finally { initLoading.value = false }
}

async function handleDeinit(profile: AlgorithmProfile) {
  try {
    await deinitProfile(profile.algorithmId)
    message.success(t('algorithm.deleteSuccess'))
    await refreshAlgorithms()
    await fetchProfiles()
  } catch (e: any) { message.error(e?.response?.data?.message || t('algorithm.deleteFailed')) }
}

// Open the binding modal and load the current bound user list.
async function openBindModal(profile: AlgorithmProfile) {
  bindProfile.value = profile
  bindUserId.value = ''
  boundUsers.value = []
  showBindModal.value = true
  await loadBoundUsers(profile.algorithmId)
}

async function loadBoundUsers(algorithmId: string) {
  bindLoading.value = true
  try {
    const res: any = await listProfileBindings(algorithmId)
    const raw = (res?.items ?? res?.bindings ?? res?.users ?? []) as any[]
    await ensureUsersLoaded()
    const list: BoundUser[] = raw.map((u: any) => {
      const userId = u.userId ?? u.id ?? String(u)
      return { userId, userName: u.userName ?? u.name ?? userEntitiesById.value.get(userId)?.userName }
    })
    boundUsers.value = list
  } catch (e: any) {
    message.error(e?.response?.data?.message || t('algorithm.loadBindingsFailed'))
  } finally { bindLoading.value = false }
}

async function handleBind() {
  if (!bindProfile.value || !bindUserId.value) return
  bindSubmitLoading.value = true
  try {
    await bindUser(bindProfile.value.algorithmId, bindUserId.value)
    message.success(t('algorithm.bindSuccess'))
    bindUserId.value = ''
    await loadBoundUsers(bindProfile.value.algorithmId)
  } catch (e: any) {
    message.error(e?.response?.data?.message || t('algorithm.bindFailed'))
  } finally { bindSubmitLoading.value = false }
}

async function handleUnbind(user: BoundUser) {
  if (!bindProfile.value) return
  try {
    await unbindUser(bindProfile.value.algorithmId, user.userId)
    message.success(t('algorithm.unbindSuccess'))
    await loadBoundUsers(bindProfile.value.algorithmId)
  } catch (e: any) {
    message.error(e?.response?.data?.message || t('algorithm.unbindFailed'))
  }
}

// Global polling: refresh data for the currently active tab
function fetchActiveTab() {
  if (activeTab.value === 'strategies') fetchStrategies()
  else fetchProfiles()
}

// When the purpose filter changes, the applicable algorithm types also change — reload them.
watch(filterPurpose, () => {
  // Drop an invalid selection (e.g. a type not applicable to the new purpose).
  loadAlgoTypes().then(() => {
    if (filterType.value && !algoTypes.value.includes(filterType.value)) filterType.value = null
  })
})
watch([filterType, filterPurpose], fetchProfiles)
onMounted(() => {
  register(fetchActiveTab, route.path)
  fetchStrategies()
  loadAlgoTypes()
})
</script>

<style scoped>
.algo-view { max-width: 1200px; }
</style>
