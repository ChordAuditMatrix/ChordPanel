<template>
  <n-modal v-model:show="show" preset="card" :title="t('errorModal.title')" :style="{ width: modalWidth, maxWidth: '92vw' }" :bordered="true">    <div class="error-content">
      <div class="error-status-row">
        <n-tag :type="statusTagType" size="medium" :bordered="false">
          {{ currentError.status }} {{ currentError.statusText }}
        </n-tag>
        <span v-if="currentError.error" class="error-type">{{ currentError.error }}</span>
      </div>

      <n-divider style="margin: 12px 0;" />

      <div class="error-message">
        <n-icon size="20" :component="AlertCircleOutline" class="error-icon" />
        <span>{{ currentError.message }}</span>
      </div>

      <div v-if="currentError.detail" class="error-detail">
        <span class="detail-label">{{ t('errorModal.detail') }}:</span>
        <pre>{{ currentError.detail }}</pre>
      </div>

      <n-divider style="margin: 12px 0;" />

      <div class="error-meta">
        <div v-if="currentError.method" class="meta-item">
          <span class="meta-label">{{ t('errorModal.method') }}:</span>
          <code>{{ currentError.method }}</code>
        </div>
        <div v-if="currentError.url" class="meta-item">
          <span class="meta-label">{{ t('errorModal.url') }}:</span>
          <code>{{ currentError.url }}</code>
        </div>
        <div v-if="currentError.timestamp" class="meta-item">
          <span class="meta-label">{{ t('errorModal.timestamp') }}:</span>
          <span>{{ currentError.timestamp }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <div style="display: flex; justify-content: flex-end;">
        <n-button @click="hideError">{{ t('errorModal.close') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { AlertCircleOutline } from '@vicons/ionicons5'
import { useErrorModal } from './useError'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'

const { drawerWidth: modalWidth } = useAdaptiveWidth(420)
const { t } = useI18n()

const { show, currentError, hideError } = useErrorModal()

const statusTagType = computed(() => {
  const s = currentError.status
  if (s >= 500) return 'error'
  if (s >= 400) return 'warning'
  if (s === 0) return 'error'
  return 'default'
})
</script>

<style scoped>
.error-content {
  font-size: 14px;
}

.error-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-type {
  font-family: monospace;
  font-size: 13px;
  opacity: 0.6;
}

.error-message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 15px;
  font-weight: 500;
}

.error-icon {
  color: #F87272;
  flex-shrink: 0;
  margin-top: 2px;
}

.error-detail {
  margin-top: 12px;
  font-size: 13px;
}

.detail-label {
  opacity: 0.5;
  margin-bottom: 4px;
  display: block;
}

.error-detail pre {
  background: rgba(128, 128, 128, 0.1);
  padding: 8px 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}

.meta-item {
  display: flex;
  gap: 6px;
  align-items: center;
}

.meta-label {
  opacity: 0.5;
  min-width: 40px;
}

.meta-item code {
  font-family: monospace;
  font-size: 11px;
  background: rgba(128, 128, 128, 0.08);
  padding: 1px 6px;
  border-radius: 3px;
  word-break: break-all;
}
</style>
