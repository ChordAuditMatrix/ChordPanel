<template>
  <section class="operations-panel">
    <n-divider title-placement="left">{{ t('node.operations') }}</n-divider>
    <div class="action-row">
      <n-button
        :type="node.runtimeState?.state === 'BusyDraining' ? 'warning' : 'default'"
        :loading="loading"
        :disabled="node.runtimeState?.state === 'BusyDraining'"
        @click="emit('drain')"
      >
        {{ node.runtimeState?.state === 'BusyDraining' ? t('node.drainingNode') : t('node.drainNode') }}
      </n-button>
      <n-button
        type="success"
        :loading="loading"
        :disabled="node.runtimeState?.state !== 'BusyDraining'"
        @click="emit('resume')"
      >{{ t('node.resumeNode') }}</n-button>
      <n-button type="primary" @click="emit('protocol-events')">{{ t('node.protocolEvents') }}</n-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { NodeDetail } from './types'
import { useI18n } from '@/stores/i18n'

defineProps<{ node: NodeDetail; loading: boolean }>()
const emit = defineEmits<{
  (event: 'drain'): void
  (event: 'resume'): void
  (event: 'protocol-events'): void
}>()
const { t } = useI18n()
</script>

<style scoped>
.operations-panel :deep(.n-divider) { margin-block: 18px 12px; }
.action-row { display: flex; flex-wrap: wrap; gap: 10px; }
.action-row :deep(.n-button) { flex: 1 1 140px; }
</style>
