<template>
  <div class="algo-view">
    <n-tabs type="line" size="small" v-model:value="activeTab">
      <n-tab-pane name="profiles" :tab="t('algorithm.profiles')">
        <AlgorithmProfilePanel
          :columns="profileColumns"
          :profiles="profiles"
          :loading="loading"
          :page="profilePage"
          :page-size="profilePageSize"
          :total="profileTotal"
          :filter-type="filterType"
          :filter-purpose="filterPurpose"
          :type-options="typeOptions"
          :purpose-options="purposeOptions"
          :type-loading="typeLoading"
          @update:page="profilePage = $event"
          @update:page-size="profilePageSize = $event"
          @update:filter-type="filterType = $event"
          @update:filter-purpose="filterPurpose = $event"
          @create="showInitModal = true"
        />
      </n-tab-pane>
      <n-tab-pane name="strategies" :tab="t('algorithm.strategies')">
        <AlgorithmStrategiesPanel
          :columns="strategyColumns"
          :strategies="strategies"
          :loading="strategyLoading"
          :page="strategyPage"
          :page-size="strategyPageSize"
          :total="strategyTotal"
          @update:page="strategyPage = $event"
          @update:page-size="strategyPageSize = $event"
        />
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
      :page="bindingPage"
      :page-size="bindingPageSize"
      :total="bindingTotal"
      :submit-loading="bindSubmitLoading"
      @update:page="bindingPage = $event"
      @update:page-size="bindingPageSize = $event"
      @submit="handleBind"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NTag, NPopconfirm, useMessage } from 'naive-ui'
import { getStrategies, getProfiles, initProfile, deinitProfile, listAlgorithmTypes } from '@/api/algorithm'
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
import { useAlgorithmBindings, type BoundUser } from './useAlgorithmBindings'
const message = useMessage()
const { t } = useI18n()
const { refreshAlgorithms } = useReferenceCatalog()
const route = useRoute()
const { register } = usePagePolling()
const loading = ref(false)
const strategyLoading = ref(false)
const profiles = ref<AlgorithmProfile[]>([])
const strategies = ref<AlgorithmStrategy[]>([])
const profilePage = ref(1)
const profilePageSize = ref(20)
const profileTotal = ref(0)
const strategyPage = ref(1)
const strategyPageSize = ref(20)
const strategyTotal = ref(0)
let profileSequence = 0
let strategySequence = 0
let typeSequence = 0
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

const {
  showBindModal, bindLoading, bindSubmitLoading, bindProfile, bindUserId, boundUsers,
  bindingPage, bindingPageSize, bindingTotal, openBindModal, handleBind, handleUnbind,
} = useAlgorithmBindings()

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

async function loadAlgoTypes(purpose = filterPurpose.value || undefined) {
  const sequence = ++typeSequence
  typeLoading.value = true
  try {
    const items = await listAlgorithmTypes(purpose)
    if (sequence === typeSequence) algoTypes.value = items
  } catch (e) {
    if (sequence === typeSequence) console.error(e)
  } finally {
    if (sequence === typeSequence) typeLoading.value = false
  }
}
const profileColumns = computed<DataTableColumns<AlgorithmProfile>>(() => [
  { title: t('algorithm.algorithmName'), key: 'algorithmName', minWidth: 120, render: (r: AlgorithmProfile) => h('span', { style: 'font-weight:600' }, r.algorithmName) },
  { title: t('algorithm.algorithmType'), key: 'algorithmType', minWidth: 100 },
  { title: t('algorithm.purpose'), key: 'purpose', minWidth: 70, render: (r: AlgorithmProfile) => h(NTag, { size: 'small', type: r.purpose === 'Audit' ? 'success' : 'info', bordered: false }, () => r.purpose) },
  { title: t('algorithm.version'), key: 'version', minWidth: 60 },
  { title: t('algorithm.algorithmId'), key: 'algorithmId', ellipsis: { tooltip: true }, minWidth: 160 },
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
  { title: t('algorithm.algorithmType'), key: 'algorithmType', width: 160, render: (r: AlgorithmStrategy) => h('span', { style: 'font-weight:600' }, r.algorithmType) },
  { title: t('algorithm.purpose'), key: 'purpose', width: 100, render: (r: AlgorithmStrategy) => h(NTag, { size: 'small', type: r.purpose === 'Audit' ? 'success' : 'info', bordered: false }, () => r.purpose) },
  { title: t('algorithm.version'), key: 'version', width: 80 },
])

async function fetchProfiles() {
  const sequence = ++profileSequence
  loading.value = true
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
  } catch (e) {
    if (sequence === profileSequence) console.error(e)
  } finally {
    if (sequence === profileSequence) loading.value = false
  }
}

async function fetchStrategies() {
  const sequence = ++strategySequence
  strategyLoading.value = true
  try {
    const response = await getStrategies({ page: strategyPage.value, pageSize: strategyPageSize.value })
    if (sequence !== strategySequence) return
    strategies.value = response.items
    strategyTotal.value = response.total
  } catch (e) {
    if (sequence === strategySequence) console.error(e)
  } finally {
    if (sequence === strategySequence) strategyLoading.value = false
  }
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
    const alreadyOnFirstPage = profilePage.value === 1
    profilePage.value = 1
    if (alreadyOnFirstPage) await fetchProfiles()
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


// Global polling: refresh data for the currently active tab
function fetchActiveTab() {
  if (activeTab.value === 'strategies') fetchStrategies()
  else fetchProfiles()
}

watch(filterPurpose, () => {
  loadAlgoTypes().then(() => {
    if (filterType.value && !algoTypes.value.includes(filterType.value)) filterType.value = null
  })
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
  fetchProfiles()
})
watch([strategyPage, strategyPageSize], (current, previous) => {
  const pageChanged = current[0] !== previous[0]
  const pageSizeChanged = current[1] !== previous[1]
  if (pageChanged || pageSizeChanged) strategies.value = []
  if (pageSizeChanged && strategyPage.value !== 1) {
    strategyPage.value = 1
    return
  }
  fetchStrategies()
})
onMounted(() => {
  register(fetchActiveTab, route.path)
  fetchStrategies()
  loadAlgoTypes()
})
</script>

<style scoped>
.algo-view { max-width: 1200px; }
</style>
