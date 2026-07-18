<template>
  <div class="algo-view">
    <n-tabs type="line" size="small" v-model:value="activeTab">
      <n-tab-pane name="profiles" :tab="t('algorithm.profiles')">
        <PageToolbar>
          <n-select v-model:value="filterType" :placeholder="t('algorithm.algorithmType')" clearable size="small"
            :options="typeOptions" :loading="typeLoading" style="width: 160px;" />
          <n-select v-model:value="filterPurpose" :placeholder="t('algorithm.purpose')" clearable size="small"
            :options="purposeOptions" style="width: 120px;" />
          <template #actions>
            <n-button type="primary" size="small" @click="showInitModal = true">+ {{ t('algorithm.create') }}</n-button>
          </template>
        </PageToolbar>
        <DataTable :columns="profileColumns" :data="profiles" :loading="loading" />
      </n-tab-pane>
      <n-tab-pane name="strategies" :tab="t('algorithm.strategies')">
        <DataTable :columns="strategyColumns" :data="strategies" :loading="strategyLoading" />
      </n-tab-pane>
    </n-tabs>

    <!-- Create algorithm modal -->
    <n-modal v-model:show="showInitModal" preset="card" :title="t('algorithm.create')" style="width: 460px;" :bordered="true">
      <n-form label-placement="left" label-width="auto">
        <n-form-item :label="t('algorithm.algorithmType')" required>
          <n-select v-model:value="initForm.algorithmType" :placeholder="t('algorithm.algorithmType')"
            :options="typeOptions" :loading="typeLoading" />
        </n-form-item>
        <n-form-item :label="t('algorithm.algorithmName')" required>
          <n-input v-model:value="initForm.algorithmName" :placeholder="t('common.inputAlgorithmName')" />
        </n-form-item>
        <n-form-item :label="t('algorithm.initParams')">
          <KeyValueEditor v-model="initForm.params" :hint="initParamsHint" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <n-button @click="showInitModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="initLoading" @click="handleInit">{{ t('common.create') }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- User key binding modal -->
    <n-modal v-model:show="showBindModal" preset="card" :title="t('algorithm.userBindings')" style="width: 520px;" :bordered="true">
      <template v-if="bindProfile">
        <n-descriptions :column="2" label-placement="left" size="small" bordered style="margin-bottom: 12px;">
          <n-descriptions-item :label="t('algorithm.algorithmName')">{{ bindProfile.algorithmName }}</n-descriptions-item>
          <n-descriptions-item :label="t('algorithm.algorithmType')">{{ bindProfile.algorithmType }}</n-descriptions-item>
        </n-descriptions>

        <!-- Bound users list -->
        <n-spin :show="bindLoading">
          <div v-if="boundUsers.length" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;min-height:32px;">
            <n-tag v-for="u in boundUsers" :key="u.userId" size="small" type="info" :bordered="false" round closable @close="handleUnbind(u)">
              {{ u.userName ? `${u.userName} (${u.userId})` : u.userId }}
            </n-tag>
          </div>
          <n-empty v-else :description="t('algorithm.boundUserEmpty')" size="small" style="margin-bottom:12px;" />
        </n-spin>

        <!-- Bind a new user -->
        <n-form label-placement="left" label-width="auto">
          <n-form-item :label="t('algorithm.bindUser')" required>
            <UserSelect v-model="bindUserId" :placeholder="t('algorithm.selectBindUser')" style="width:100%" />
          </n-form-item>
        </n-form>
      </template>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <n-button @click="showBindModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="bindSubmitLoading" :disabled="!bindUserId" @click="handleBind">{{ t('algorithm.bindUser') }}</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NTag, NPopconfirm, useMessage } from 'naive-ui'
import { getStrategies, getProfiles, initProfile, deinitProfile, listAlgorithmTypes, listProfileBindings, bindUser, unbindUser } from '@/api/algorithm'
import type { AlgorithmStrategy, AlgorithmProfile } from '@/api/algorithm'
import { usePagePolling } from '@/composables/usePagePolling'
import DataTable from '@/components/DataTable.vue'
import PageToolbar from '@/components/PageToolbar.vue'
import UserSelect from '@/components/UserSelect.vue'
import KeyValueEditor, { type KvHintItem } from '@/components/KeyValueEditor.vue'
import { useI18n } from '@/stores/i18n'
const message = useMessage()
const { t } = useI18n()
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

async function loadAlgoTypes() {
  typeLoading.value = true
  try {
    algoTypes.value = await listAlgorithmTypes(filterPurpose.value || undefined)
  } catch (e) { console.error(e) } finally { typeLoading.value = false }
}

// Pagination is managed by the DataTable component

const profileColumns = computed(() => [
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

const strategyColumns = computed(() => [
  { title: t('algorithm.algorithmType'), key: 'algorithmType', width: 160, sorter: 'default', render: (r: AlgorithmStrategy) => h('span', { style: 'font-weight:600' }, r.algorithmType) },
  { title: t('algorithm.purpose'), key: 'purpose', width: 100, sorter: 'default', render: (r: AlgorithmStrategy) => h(NTag, { size: 'small', type: r.purpose === 'Audit' ? 'success' : 'info', bordered: false }, () => r.purpose) },
  { title: t('algorithm.version'), key: 'version', width: 80, sorter: 'default' },
])

async function fetchProfiles() {
  loading.value = true
  try {
    const res = await getProfiles({ pageSize: 1000, type: filterType.value || undefined, purpose: filterPurpose.value || undefined })
    profiles.value = ((res as any)?.items ?? []) as AlgorithmProfile[]
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
    await initProfile(initForm.value.algorithmType, initForm.value.algorithmName.trim(), initForm.value.params)
    message.success(t('algorithm.createSuccess'))
    showInitModal.value = false
    initForm.value = { algorithmType: '', algorithmName: '', params: {} }
    fetchProfiles()
  } catch (e: any) {
    message.error(e?.response?.data?.message || t('algorithm.createFailed'))
  } finally { initLoading.value = false }
}

async function handleDeinit(profile: AlgorithmProfile) {
  try {
    await deinitProfile(profile.algorithmId)
    message.success(t('algorithm.deleteSuccess'))
    fetchProfiles()
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
    boundUsers.value = ((res?.items ?? res?.bindings ?? res?.users ?? []) as BoundUser[])
      .map((u: any) => ({ userId: u.userId ?? u.id ?? String(u), userName: u.userName ?? u.name }))
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
