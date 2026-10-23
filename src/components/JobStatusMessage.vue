<template>
  <div v-if="compact && message" class="status-message-compact">
    <span class="status-message-summary">{{ summarizeJobStatusMessage(message) }}</span>
    <details class="status-message-full" @click.stop>
      <summary>{{ t('job.workbench.statusMessageFull') }}</summary>
      <pre>{{ message }}</pre>
    </details>
  </div>
  <div v-else>
    <JsonKeyValue v-if="structuredMessage !== null" :data="structuredMessage" :format-value="formatValue" />
    <n-code v-else-if="code && message" :code="message" />
    <span v-else>{{ message }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { NCode } from 'naive-ui'
import { parseJobStatusMessage } from '@/api/job'
import JsonKeyValue from '@/components/JsonKeyValue.vue'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { useI18n } from '@/stores/i18n'
import { hasAuditTableReference } from '@/utils/auditTableReferences'
import { summarizeJobStatusMessage } from '@/views/job/jobCenter'

const props = withDefaults(defineProps<{ message?: string; code?: boolean; compact?: boolean }>(), { code: false, compact: false })
const { t } = useI18n()
const { ensureAuditTablesLoaded, formatValue } = useReferenceCatalog()
const structuredMessage = computed(() => parseJobStatusMessage(props.message))
watch(structuredMessage, value => {
  if (hasAuditTableReference(value)) void ensureAuditTablesLoaded()
}, { immediate: true })
</script>

<style scoped>
.status-message-summary {
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.status-message-full pre {
  max-height: 16rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
