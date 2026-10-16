<template>
  <div class="node-select">
    <n-select
      :value="modelValue || null"
      :options="options"
      :loading="loading"
      :placeholder="placeholder"
      filterable
      clearable
      tag
      :size="size"
      :style="style"
      @focus="ensureNodesLoaded"
      @update:value="onChange"
    />
    <small v-if="error" class="node-catalog-error">{{ t('common.requestFailed') }}</small>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, type CSSProperties } from 'vue'
import { useI18n } from '@/stores/i18n'
import { useNodeCatalog } from '@/stores/nodeCatalog'

const { t } = useI18n()
const props = withDefaults(defineProps<{
  modelValue: string
  placeholder: string
  size?: 'small' | 'medium' | 'large'
  style?: string | CSSProperties
}>(), { size: 'medium' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { nodes, loading, error, ensureNodesLoaded } = useNodeCatalog()
const options = computed(() => {
  const available = nodes.value.map(node => {
    const availability = typeof node.isAvailable === 'boolean'
      ? t(node.isAvailable ? 'node.available' : 'node.unavailable')
      : node.state
    const label = [node.nodeId, node.role, availability].filter(value => typeof value === 'string' && value.length > 0).join(' · ')
    return { label, value: node.nodeId }
  })
  const current = props.modelValue.trim()
  if (current && !loading.value && !nodes.value.some(node => node.nodeId === current)) {
    available.unshift({ label: t('event.historicalNode', { id: current }), value: current })
  }
  return available
})
onMounted(() => { void ensureNodesLoaded() })

function onChange(value: string | number | null) {
  emit('update:modelValue', value === null ? '' : String(value))
}
</script>

<style scoped>
.node-select { min-width: 0; }
.node-catalog-error { color: var(--apple-gray-3, #6E6E73); font-size: 11px; }
</style>
