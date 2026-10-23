<template>
  <div class="profile-panel">
    <div class="panel-toolbar">
      <div class="panel-filters">
        <n-select :value="filterType" :placeholder="t('algorithm.algorithmType')" clearable size="small"
          :options="typeOptions" :loading="typeLoading" class="type-filter" @update:value="$emit('update:filterType', $event ?? null)" />
        <n-select :value="filterPurpose" :placeholder="t('algorithm.purpose')" clearable size="small"
          :options="purposeOptions" class="purpose-filter" @update:value="$emit('update:filterPurpose', $event ?? null)" />
      </div>
    </div>

    <div v-if="error" class="panel-error" role="alert">
      <span>{{ t('algorithm.workbench.profilesFailed') }}</span>
      <n-button size="tiny" quaternary type="primary" @click="$emit('retry')">{{ t('common.retry') }}</n-button>
    </div>

    <ServerPagedDataTable
      :columns="columns"
      :data="profiles"
      :loading="loading"
      :page="page"
      :page-size="pageSize"
      :total="total"
      @update:page="$emit('update:page', $event)"
      @update:page-size="$emit('update:pageSize', $event)"
    />
    <p v-if="!loading && !error && profiles.length === 0 && total === 0" class="empty-hint">
      {{ t('algorithm.workbench.noProfilesHint') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { AlgorithmProfile } from '@/api/algorithm'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import { useI18n } from '@/stores/i18n'
import type { DataTableColumns } from 'naive-ui'

defineProps<{
  columns: DataTableColumns<AlgorithmProfile>
  profiles: AlgorithmProfile[]
  loading: boolean
  error: boolean
  page: number
  pageSize: number
  total: number
  filterType: string | null
  filterPurpose: string | null
  typeOptions: Array<{ label: string; value: string }>
  purposeOptions: Array<{ label: string; value: string }>
  typeLoading: boolean
}>()
defineEmits<{
  'update:filterType': [value: string | null]
  'update:filterPurpose': [value: string | null]
  'update:page': [page: number]
  'update:pageSize': [pageSize: number]
  retry: []
}>()

const { t } = useI18n()
</script>

<style scoped>
.profile-panel {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3, 12px);
  min-width: 0;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--apple-space-3, 12px);
  flex-wrap: wrap;
}

.panel-filters {
  display: flex;
  align-items: center;
  gap: var(--apple-space-3, 12px);
  flex-wrap: wrap;
}

.type-filter { width: 160px; }
.purpose-filter { width: 120px; }

.panel-error {
  display: flex;
  align-items: center;
  gap: var(--apple-space-3, 12px);
  color: var(--apple-red);
  font-size: 13px;
  line-height: 1.5;
}

.empty-hint {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 640px) {
  .type-filter, .purpose-filter { width: 100%; }
  .panel-filters { width: 100%; }
  .panel-filters :deep(.n-select) { width: 100%; }
}
</style>
