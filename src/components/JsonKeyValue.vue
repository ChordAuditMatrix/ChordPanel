<template>
  <div class="json-kv">
    <template v-for="(value, key) in data" :key="key">
      <div class="kv-row">
        <span class="kv-key">{{ formatKey(key) }}</span>
        <span class="kv-sep"></span>
        <span class="kv-value">
          <template v-if="value === null || value === undefined">
            <n-tag size="tiny" :bordered="false" type="default">-</n-tag>
          </template>
          <template v-else-if="typeof value === 'boolean'">
            <n-tag size="small" :bordered="false" :type="value ? 'success' : 'default'">{{ value ? t('common.yes') : t('common.no') }}</n-tag>
          </template>
          <template v-else-if="typeof value === 'number'">
            <span class="kv-number">{{ value }}</span>
          </template>
          <template v-else-if="typeof value === 'string' && isUuid(value)">
            <span class="kv-uuid" :title="value">{{ value.substring(0, 8) }}...</span>
          </template>
          <template v-else-if="typeof value === 'string'">
            {{ value }}
          </template>
          <template v-else-if="Array.isArray(value)">
            <span v-if="value.length === 0" class="kv-empty">[]</span>
            <span v-else v-for="(item, i) in value" :key="i" class="kv-array-item">
              <template v-if="typeof item === 'object' && item !== null">
                <JsonKeyValue :data="item" :depth="depth + 1" class="kv-nested" />
              </template>
              <template v-else>{{ item }}</template>
              <span v-if="i < value.length - 1" class="kv-comma">, </span>
            </span>
          </template>
          <template v-else-if="typeof value === 'object'">
            <JsonKeyValue :data="value" :depth="depth + 1" class="kv-nested" />
          </template>
          <template v-else>{{ String(value) }}</template>
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NTag } from 'naive-ui'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()

withDefaults(defineProps<{
  data: Record<string, any>
  depth?: number
}>(), {
  depth: 0,
})

defineOptions({ name: 'JsonKeyValue' })

function formatKey(key: string): string {
  // camelCase → 空格分隔，首字母大写
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim()
}

function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}
</script>

<style scoped>
.json-kv {
  font-size: 13px;
}

.kv-row {
  display: flex;
  align-items: baseline;
  padding: 4px 0;
  border-bottom: 1px solid var(--n-border-color, rgba(0, 0, 0, 0.06));
}

.kv-row:last-child {
  border-bottom: none;
}

.kv-key {
  color: var(--apple-gray-3, var(--n-text-color-3, #999));
  flex-shrink: 0;
  min-width: 100px;
  font-weight: 500;
}

.kv-sep {
  flex-shrink: 0;
  width: 12px;
}

.kv-value {
  word-break: break-all;
  flex: 1;
  min-width: 0;
}

.kv-uuid {
  font-family: var(--apple-font-mono, monospace);
  font-size: 12px;
  color: var(--n-text-color-2, #666);
  cursor: default;
}

.kv-number {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.kv-empty {
  opacity: 0.3;
}

.kv-array-item {
  display: inline;
}

.kv-comma {
  opacity: 0.4;
}

.kv-nested {
  margin: 4px 0 4px 16px;
  padding-left: 8px;
  border-left: 2px solid var(--n-border-color, rgba(0, 0, 0, 0.08));
}
</style>