<template>
  <n-modal :show="show" preset="card" :title="t('algorithm.userBindings')" class="bindings-dialog" :bordered="true" @update:show="$emit('update:show', $event)">
    <template v-if="profile">
      <n-descriptions :column="2" label-placement="left" size="small" bordered class="profile-summary">
        <n-descriptions-item :label="t('algorithm.algorithmName')">{{ profile.algorithmName }}</n-descriptions-item>
        <n-descriptions-item :label="t('algorithm.algorithmType')">{{ profile.algorithmType }}</n-descriptions-item>
      </n-descriptions>
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
import type { DataTableColumns } from 'naive-ui'
import type { AlgorithmProfile } from '@/api/algorithm'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useI18n } from '@/stores/i18n'

interface BoundUser { userId: string; userName?: string }

defineProps<{
  show: boolean
  profile: AlgorithmProfile | null
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
</script>

<style scoped>
.bindings-dialog { width: 520px; max-width: 92vw; }
.profile-summary { margin-bottom: 12px; }
.binding-table { margin-bottom: 16px; }
.user-select { width: 100%; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
