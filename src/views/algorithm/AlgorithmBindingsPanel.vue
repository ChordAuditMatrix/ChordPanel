<template>
  <div class="bindings-panel">
    <div v-if="error" class="panel-error" role="alert">
      <span>{{ t('algorithm.workbench.bindingsFailed') }}</span>
      <n-button size="tiny" quaternary type="primary" @click="$emit('retry')">{{ t('common.retry') }}</n-button>
    </div>

    <ServerPagedDataTable
      :columns="columns"
      :data="rows"
      :loading="loading"
      :page="page"
      :page-size="pageSize"
      :total="total"
      @update:page="$emit('update:page', $event)"
      @update:page-size="$emit('update:pageSize', $event)"
    />
    <p v-if="!loading && !error && rows.length === 0 && total === 0" class="empty-hint">
      {{ t('algorithm.workbench.noBindingsHint') }}
    </p>
    <p v-else-if="!loading && !error" class="empty-hint">
      {{ t('algorithm.workbench.bindingVersionHint') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { NButton, NTag } from 'naive-ui'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import { useI18n } from '@/stores/i18n'
import { strategyPurposeLabel } from './strategyLabels'
import type { BindingRowView } from './types'

defineProps<{
  rows: BindingRowView[]
  loading: boolean
  error: boolean
  page: number
  pageSize: number
  total: number
}>()

const emit = defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [pageSize: number]
  'open-instance': [algorithmId: string]
  retry: []
}>()

const { t } = useI18n()

const columns = computed<DataTableColumns<BindingRowView>>(() => [
  {
    title: t('algorithm.workbench.boundOwner'),
    key: 'userId',
    minWidth: 200,
    render: (row: BindingRowView) => h('div', { style: 'display:flex;flex-direction:column;gap:2px;min-width:0' }, [
      h('span', { style: 'font-weight:600;color:var(--apple-gray-1)' },
        row.userName || t('algorithm.workbench.userNameUnavailable')),
      h('span', { style: 'font-family:var(--apple-font-mono);font-size:11px;color:var(--apple-gray-3);overflow-wrap:anywhere' }, row.userId),
    ]),
  },
  {
    title: t('algorithm.workbench.boundInstance'),
    key: 'algorithmId',
    minWidth: 220,
    render: (row: BindingRowView) => h('div', { style: 'display:flex;flex-direction:column;gap:2px;min-width:0' }, [
      h('span', { style: 'font-weight:600;color:var(--apple-gray-1);overflow-wrap:anywhere' },
        row.algorithmName || t('algorithm.workbench.instanceNameUnavailable')),
      h('span', { style: 'font-family:var(--apple-font-mono);font-size:11px;color:var(--apple-gray-3);overflow-wrap:anywhere' }, row.algorithmId),
    ]),
  },
  {
    title: t('algorithm.purpose'),
    key: 'purpose',
    width: 92,
    render: (row: BindingRowView) => h(NTag, { size: 'small', type: row.purpose === 'Audit' ? 'success' : 'info', bordered: false },
      () => strategyPurposeLabel(row.purpose, t)),
  },
  {
    title: t('algorithm.workbench.bindingVersion'),
    key: 'algorithmVersion',
    width: 108,
    render: (row: BindingRowView) => h('span', { style: 'font-variant-numeric:tabular-nums' }, String(row.algorithmVersion)),
  },
  {
    title: t('common.actions'),
    key: 'actions',
    width: 108,
    render: (row: BindingRowView) => h(NButton, {
      size: 'small',
      ghost: true,
      onClick: () => emit('open-instance', row.algorithmId),
    }, () => t('algorithm.workbench.viewInstance')),
  },
])
</script>

<style scoped>
.bindings-panel {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3, 12px);
  min-width: 0;
}

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
</style>
