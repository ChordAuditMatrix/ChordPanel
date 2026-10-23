<template>
  <n-modal :show="show" preset="card" :title="t('algorithm.userBindings')" :style="{ width: '520px', maxWidth: '92vw' }" :bordered="true" @update:show="$emit('update:show', $event)">
    <template v-if="profile">
      <n-descriptions :column="2" label-placement="left" size="small" bordered class="profile-summary">
        <n-descriptions-item :label="t('algorithm.algorithmName')">{{ profile.algorithmName }}</n-descriptions-item>
        <n-descriptions-item :label="t('algorithm.algorithmType')">{{ profile.algorithmType }}</n-descriptions-item>
        <n-descriptions-item :label="t('algorithm.workbench.profileVersion')">{{ versions.profileVersion ?? t('algorithm.workbench.valueUnknown') }}</n-descriptions-item>
        <n-descriptions-item :label="t('algorithm.workbench.pluginVersion')">{{ versions.pluginVersion ?? t('algorithm.workbench.pluginVersionUnknown') }}</n-descriptions-item>
        <n-descriptions-item :label="t('algorithm.purpose')" :span="2">{{ strategyPurposeLabel(profile.purpose, t) }}</n-descriptions-item>
      </n-descriptions>
      <p class="binding-note">{{ t('algorithm.workbench.bindKeyHint') }}</p>
      <ServerPagedDataTable
        :columns="columns"
        :data="users"
        :loading="loading"
        :page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[5, 10, 20]"
        class="binding-table"
        @update:page="$emit('update:page', $event)"
        @update:page-size="$emit('update:pageSize', $event)"
      />
      <n-form label-placement="left" label-width="auto">
        <n-form-item :label="t('algorithm.bindUser')" required>
          <UserSelect :model-value="userId" :placeholder="t('algorithm.selectBindUser')" class="user-select" @update:model-value="$emit('update:userId', $event)" />
        </n-form-item>
      </n-form>
    </template>
    <template #footer>
      <div class="dialog-actions">
        <n-button @click="$emit('update:show', false)">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="submitLoading" :disabled="!userId" @click="$emit('submit')">{{ t('algorithm.bindUser') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import type { AlgorithmProfile, AlgorithmStrategy } from '@/api/algorithm'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useI18n } from '@/stores/i18n'
import { describeProfileVersions } from './algorithmWorkbench'
import { strategyPurposeLabel } from './strategyLabels'
import type { BoundUser } from './types'

const props = defineProps<{
  show: boolean
  profile: AlgorithmProfile | null
  /** Strategy descriptor of the profile type, for the plugin version fact. */
  strategy: AlgorithmStrategy | null
  columns: DataTableColumns<BoundUser>
  users: BoundUser[]
  loading: boolean
  page: number
  pageSize: number
  total: number
  userId: string
  submitLoading: boolean
}>()
defineEmits<{
  'update:show': [value: boolean]
  'update:userId': [value: string]
  'update:page': [page: number]
  'update:pageSize': [pageSize: number]
  submit: []
}>()

const { t } = useI18n()
const versions = computed(() => describeProfileVersions(props.profile?.version, props.strategy?.version))
</script>

<style scoped>
.profile-summary { margin-bottom: 12px; }
.binding-note { margin: 0 0 12px; color: var(--apple-gray-3); font-size: 12px; line-height: 1.6; }
.binding-table { margin-bottom: 16px; }
.user-select { width: 100%; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
