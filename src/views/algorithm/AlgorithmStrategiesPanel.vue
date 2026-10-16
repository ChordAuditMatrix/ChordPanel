<template>
  <n-card size="small" :bordered="true" class="strategy-panel">
    <ServerPagedDataTable
      :columns="columns"
      :data="strategies"
      :loading="loading"
      :page="page"
      :page-size="pageSize"
      :total="total"
      @update:page="$emit('update:page', $event)"
      @update:page-size="$emit('update:pageSize', $event)"
    />
  </n-card>
</template>

<script setup lang="ts">
import type { DataTableColumns } from 'naive-ui'
import type { AlgorithmStrategy } from '@/api/algorithm'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'

defineProps<{
  columns: DataTableColumns<AlgorithmStrategy>
  strategies: AlgorithmStrategy[]
  loading: boolean
  page: number
  pageSize: number
  total: number
}>()

defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [pageSize: number]
}>()
</script>

<style scoped>
.strategy-panel { overflow: hidden; }
</style>
