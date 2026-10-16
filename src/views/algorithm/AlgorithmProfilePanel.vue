<template>
  <n-card size="small" :bordered="true" class="profile-panel">
    <PageToolbar>
      <n-select :value="filterType" :placeholder="t('algorithm.algorithmType')" clearable size="small"
        :options="typeOptions" :loading="typeLoading" class="type-filter" @update:value="$emit('update:filterType', $event)" />
      <n-select :value="filterPurpose" :placeholder="t('algorithm.purpose')" clearable size="small"
        :options="purposeOptions" class="purpose-filter" @update:value="$emit('update:filterPurpose', $event)" />
      <template #actions>
        <n-button type="primary" size="small" @click="$emit('create')">+ {{ t('algorithm.create') }}</n-button>
      </template>
    </PageToolbar>
    <DataTable :columns="columns" :data="profiles" :loading="loading" />
  </n-card>
</template>

<script setup lang="ts">
import type { AlgorithmProfile } from '@/api/algorithm'
import DataTable from '@/components/DataTable.vue'
import PageToolbar from '@/components/PageToolbar.vue'
import { useI18n } from '@/stores/i18n'
import type { DataTableColumns } from 'naive-ui'

withDefaults(defineProps<{
  columns: DataTableColumns<AlgorithmProfile>
  profiles: AlgorithmProfile[]
  loading: boolean
  filterType: string | null
  filterPurpose: string | null
  typeOptions: Array<{ label: string; value: string }>
  purposeOptions: Array<{ label: string; value: string }>
  typeLoading: boolean
}>(), {})

defineEmits<{
  'update:filterType': [value: string | null]
  'update:filterPurpose': [value: string | null]
  create: []
}>()

const { t } = useI18n()
</script>

<style scoped>
.type-filter { width: 160px; }
.purpose-filter { width: 120px; }
@media (max-width: 640px) {
  .type-filter, .purpose-filter { width: 100%; }
}
</style>
