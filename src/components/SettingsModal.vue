<template>
  <n-modal v-model:show="showModal" preset="card" :title="t('settings.title')" :style="{ width: modalWidth + 'px', maxWidth: '92vw' }" :bordered="true">
    <n-form label-placement="left" label-width="80" require-mark-placement="right-hanging">
      <n-form-item :label="t('settings.backendUrl')">
        <n-input v-model:value="tempSettings.backendUrl" placeholder="http://127.0.0.1:8080" />
      </n-form-item>
      <n-form-item :label="t('settings.pollInterval')">
        <n-input-number v-model:value="tempPollInterval" :min="1000" :max="60000" :step="1000" style="width: 100%;">
          <template #suffix>ms</template>
        </n-input-number>
      </n-form-item>
    </n-form>
    <div style="text-align: center; padding: 8px 0 4px; color: var(--n-text-color-3); font-size: 12px;">
      {{ t('settings.copyright') }}
    </div>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <n-button @click="showModal = false">{{ t('settings.cancel') }}</n-button>
        <n-button type="primary" @click="handleSave">{{ t('settings.save') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSettings } from '@/stores/settings'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'
const { t } = useI18n()

const { drawerWidth: modalWidth } = useAdaptiveWidth(360, 420, 280, 32)

const { settings } = useSettings()

const showModal = ref(false)
const tempSettings = ref({ ...settings.value })
const tempPollInterval = ref(settings.value.pollInterval)

// Sync the latest settings when opening the modal
watch(showModal, (val) => {
  if (val) {
    tempSettings.value = { ...settings.value }
    tempPollInterval.value = settings.value.pollInterval
  }
})

function handleSave() {
  settings.value.backendUrl = tempSettings.value.backendUrl
  settings.value.pollInterval = tempPollInterval.value
  showModal.value = false
}

defineExpose({
  show: () => { showModal.value = true },
})
</script>
