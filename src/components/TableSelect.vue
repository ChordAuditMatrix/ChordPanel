<template>
  <div class="table-select">
    <n-select
      :value="modelValue || null"
      :options="options"
      :loading="auditTablesState.loading"
      :status="catalogError && !auditTables.length ? 'error' : undefined"
      :placeholder="placeholder || t('common.selectTable')"
      filterable
      clearable
      :size="size"
      :style="style"
      @focus="ensureAuditTablesLoaded"
      @update:value="onChange"
    />
    <n-text v-if="catalogError" class="table-select-error" depth="3">{{ catalogError }}</n-text>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { computed, watch, type CSSProperties } from 'vue'
import type { AuditTable } from '@/api/auditTables'
import { useI18n } from '@/stores/i18n'
import { useReferenceCatalog } from '@/stores/referenceCatalog'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  size?: 'small' | 'medium' | 'large'
  style?: string | CSSProperties
  activeOnly?: boolean
}>(), { size: 'medium', activeOnly: true })
const emit = defineEmits<{ 'update:modelValue': [string], change: [table: AuditTable | null] }>()
const { t } = useI18n()
const { auditTables, auditTablesById, auditTablesState, ensureAuditTablesLoaded } = useReferenceCatalog()
const catalogError = computed(() => {
  const error = auditTablesState.error
  if (!error) return ''
  if (axios.isAxiosError<{ error?: string }>(error) && error.response?.data?.error === 'AuditTableRegistryNotBootstrapped') {
    return t('auditTables.registryUninitialized')
  }
  return auditTables.value.length ? t('auditTables.staleData') : t('auditTables.loadFailed')
})

const options = computed(() => {
  const tables = props.activeOnly ? auditTables.value.filter(table => table.status === 'active') : auditTables.value
  const available: Array<{ label: string; value: string; disabled?: boolean }> = tables.map(table => ({ label: `${table.tableName} (${table.tableId}) · ${t(`auditTables.statuses.${table.status}`)}`, value: table.tableId }))
  const selectedId = props.modelValue
  if (selectedId && !available.some(option => option.value === selectedId)) {
    const table = auditTablesById.value.get(selectedId)
    available.unshift({
      label: table ? `${table.tableName} (${table.tableId}) · ${t(`auditTables.statuses.${table.status}`)}` : `${selectedId} · ${t('common.unavailable')}`,
      value: selectedId,
      disabled: true,
    })
  }
  return available
})
watch(() => props.modelValue, () => { void ensureAuditTablesLoaded() }, { immediate: true })

function onChange(value: string | null) {
  emit('update:modelValue', value ?? '')
  emit('change', value ? auditTablesById.value.get(value) ?? null : null)
}
</script>

<style scoped>
.table-select { width: 100%; min-width: 0; }
.table-select-error { display: block; margin-top: 4px; font-size: 12px; }
</style>
