<template>
  <div class="kv-editor">
    <div v-if="hint" class="kv-hint">
      <n-tooltip placement="top" :width="360">
        <template #trigger>
          <n-icon :component="HelpCircleOutline" class="kv-hint-icon" />
        </template>
        <div class="kv-hint-content">
          <div v-for="(item, idx) in hint" :key="idx" class="kv-hint-item">
            <code>{{ item.key }}</code>
            <span v-if="item.required" class="kv-hint-req">{{ t('common.required') }}</span>
            <span v-else class="kv-hint-opt">{{ t('common.optional') }}</span>
            <span class="kv-hint-type">[{{ item.type }}]</span>
            <p class="kv-hint-desc">{{ item.desc }}</p>
          </div>
        </div>
      </n-tooltip>
    </div>
    <div v-for="(item, index) in items" :key="index" class="kv-row">
      <n-input
        v-model:value="item.key"
        :placeholder="t('common.key')"
        size="small"
        style="flex: 1; min-width: 0;"
        @update:value="emitChange"
      />
      <span class="kv-sep">:</span>
      <n-input
        v-model:value="item.value"
        :placeholder="t('common.value')"
        size="small"
        style="flex: 1; min-width: 0;"
        @update:value="emitChange"
      />
      <n-button size="small" quaternary type="error" @click="removeRow(index)">
        <template #icon><n-icon :component="CloseOutline" /></template>
      </n-button>
    </div>
    <n-button size="small" dashed block @click="addRow">
      {{ t('common.addParam') }}
    </n-button>
  </div>
</template>

<script lang="ts">
export interface KvHintItem {
  key: string
  type: 'string' | 'number' | 'boolean'
  required?: boolean
  desc: string
}
</script>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { NButton, NIcon, NTooltip } from 'naive-ui'
import { CloseOutline, HelpCircleOutline } from '@vicons/ionicons5'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()

const props = defineProps<{
  modelValue?: Record<string, string>
  hint?: KvHintItem[]
}>()

const emit = defineEmits<{ 'update:modelValue': [Record<string, string>] }>()

interface KVItem { key: string; value: string }

const items = ref<KVItem[]>([])

function fromMap(map?: Record<string, string>) {
  if (!map || !Object.keys(map).length) return []
  return Object.entries(map).map(([k, v]) => ({ key: k, value: String(v) }))
}

function toMap(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const item of items.value) {
    const k = item.key.trim()
    if (k) result[k] = item.value
  }
  return result
}

function emitChange() {
  emit('update:modelValue', toMap())
}

function addRow() {
  items.value.push({ key: '', value: '' })
}

function removeRow(index: number) {
  items.value.splice(index, 1)
  emitChange()
}

// Initialize
items.value = fromMap(props.modelValue)

// Sync when external modelValue changes (only on reference change)
watch(() => props.modelValue, (v) => {
  const current = toMap()
  const incoming = v || {}
  // Simple comparison: sync if the key sets differ
  const curKeys = Object.keys(current).sort().join(',')
  const newKeys = Object.keys(incoming).sort().join(',')
  if (curKeys !== newKeys) {
    items.value = fromMap(incoming)
  }
}, { deep: true })
</script>

<style scoped>
.kv-editor {
  width: 100%;
}
.kv-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.kv-sep {
  color: var(--apple-gray-4, rgba(127, 127, 127, 0.6));
  font-size: 13px;
  flex-shrink: 0;
}
.kv-hint {
  margin-bottom: 6px;
  display: flex;
  justify-content: flex-end;
}
.kv-hint-icon {
  cursor: help;
  font-size: 16px;
  color: var(--apple-gray-4, rgba(127, 127, 127, 0.75));
}
.kv-hint-icon:hover {
  color: var(--apple-blue, #0071E3);
}
.kv-hint-content {
  font-size: 12px;
  line-height: 1.5;
}
.kv-hint-item {
  padding: 4px 0;
  border-bottom: 1px solid var(--n-border-color, rgba(0, 0, 0, 0.08));
}
.kv-hint-item:last-child {
  border-bottom: none;
}
.kv-hint-item code {
  font-family: var(--apple-font-mono, 'Menlo', 'Consolas', monospace);
  font-weight: 600;
  color: var(--apple-blue, #0071E3);
}
.kv-hint-req {
  margin: 0 6px;
  padding: 1px 6px;
  font-size: 11px;
  border-radius: 980px;
  background: rgba(255, 59, 48, 0.1);
  color: var(--apple-red, #FF3B30);
  font-weight: 500;
}
.kv-hint-opt {
  margin: 0 6px;
  padding: 1px 6px;
  font-size: 11px;
  border-radius: 980px;
  background: rgba(52, 199, 89, 0.12);
  color: var(--apple-green, #34C759);
  font-weight: 500;
}
.kv-hint-type {
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
}
.kv-hint-desc {
  margin: 2px 0 0 0;
  color: rgba(255, 255, 255, 0.8);
}
</style>
