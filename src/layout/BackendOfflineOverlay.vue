<template>
  <transition name="apple-material">
    <div v-if="!online" class="offline-overlay apple-glass">
      <div class="offline-card">
        <div class="offline-icon-wrap">
          <n-icon size="40" :component="CloudOfflineOutline" class="offline-icon" />
        </div>
        <div class="offline-title">{{ t('app.backendOffline') }}</div>
        <div class="offline-desc">{{ t('app.backendOfflineDesc', { url }) }}</div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { CloudOfflineOutline } from '@vicons/ionicons5'
import { useI18n } from '@/stores/i18n'

defineProps<{
  online: boolean
  /** Effective API address shown to the user (never empty). */
  url: string
}>()

const { t } = useI18n()
</script>

<style scoped>
.offline-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.offline-card {
  text-align: center;
  padding: 40px 56px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: var(--apple-shadow-xl, 0 20px 60px rgba(0, 0, 0, 0.12));
}
.app-dark .offline-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.offline-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255, 59, 48, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.offline-icon {
  color: #FF3B30;
}

.offline-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--apple-gray-1);
  margin-bottom: 6px;
}

.offline-desc {
  font-size: 13px;
  color: var(--apple-gray-3);
  font-family: var(--apple-font-mono, monospace);
  overflow-wrap: anywhere;
}
</style>
