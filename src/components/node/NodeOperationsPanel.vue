<template>
  <section class="operations-panel">
    <n-divider title-placement="left">{{ t('node.operations') }}</n-divider>
    <div class="action-row">
      <n-button
        :type="draining ? 'warning' : 'default'"
        :loading="loading"
        :disabled="!guard.canDrain"
        @click="emit('drain')"
      >
        {{ draining ? t('node.drainingNode') : t('node.drainNode') }}
      </n-button>
      <n-button
        type="success"
        :loading="loading"
        :disabled="!guard.canResume"
        @click="emit('resume')"
      >{{ t('node.resumeNode') }}</n-button>
      <n-button type="primary" @click="emit('protocol-events')">{{ t('node.protocolEvents') }}</n-button>
    </div>
    <p v-if="guard.stateUnknown" class="operation-note">{{ t('node.workbench.operations.stateUnknown') }}</p>
    <p class="operation-note">{{ t('node.workbench.operations.asyncNote') }}</p>
    <p v-if="noticeText" class="operation-notice" :class="{ 'is-failed': noticeFailed }" role="status">
      {{ noticeText }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/stores/i18n'
import { nodeOperationGuard, type NodeOperationNotice } from './nodeWorkbenchModel'
import type { NodeDetail } from './types'

const NOTICE_KEYS: Record<NodeOperationNotice, string> = {
  drainRequested: 'node.workbench.operations.drainRequested',
  resumeRequested: 'node.workbench.operations.resumeRequested',
  drainFailed: 'node.workbench.operations.drainFailed',
  resumeFailed: 'node.workbench.operations.resumeFailed',
}

const props = defineProps<{ node: NodeDetail; loading: boolean; notice?: NodeOperationNotice | null }>()
const emit = defineEmits<{
  (event: 'drain'): void
  (event: 'resume'): void
  (event: 'protocol-events'): void
}>()
const { t } = useI18n()

const draining = computed(() => props.node.runtimeState?.state === 'BusyDraining')
const guard = computed(() => nodeOperationGuard(props.node))
const noticeText = computed(() => props.notice ? t(NOTICE_KEYS[props.notice]) : '')
const noticeFailed = computed(() => typeof props.notice === 'string' && props.notice.endsWith('Failed'))
</script>

<style scoped>
.operations-panel :deep(.n-divider) { margin-block: 18px 12px; }
.action-row { display: flex; flex-wrap: wrap; gap: 10px; }
.action-row :deep(.n-button) { flex: 1 1 140px; }
.operation-note {
  margin: 10px 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.55;
}
.operation-notice {
  margin: 10px 0 0;
  padding: 8px 10px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  color: var(--apple-gray-2);
  font-size: 12px;
  line-height: 1.5;
}
.operation-notice.is-failed {
  border-color: var(--apple-red);
  color: var(--apple-red);
}
</style>
