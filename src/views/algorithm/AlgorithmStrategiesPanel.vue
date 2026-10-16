<template>
  <n-card size="small" :bordered="true" class="strategy-panel">
    <DataTable :columns="columns" :data="strategies" :loading="loading" />
  </n-card>
</template>

<script setup lang="ts">
import type { DataTableColumns } from 'naive-ui'
import type { AlgorithmStrategy } from '@/api/algorithm'
import DataTable from '@/components/DataTable.vue'

defineProps<{
  columns: DataTableColumns<AlgorithmStrategy>
  strategies: AlgorithmStrategy[]
  loading: boolean
}>()
</script>

<style scoped>
.strategy-panel { overflow: hidden; }
</style>
