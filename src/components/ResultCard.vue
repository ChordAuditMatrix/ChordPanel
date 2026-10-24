<template>
  <n-card v-if="result || error || jobId" size="small" :bordered="true" :style="{ maxWidth, marginTop: '12px' }">
    <template #header>
      <div class="result-header">
        <span>{{ resolvedTitle }}</span>
        <n-button v-if="result" size="tiny" type="primary" ghost @click="handleCopy">
          <template #icon><n-icon :component="copied ? CheckmarkOutline : CopyOutline" size="14" /></template>
          {{ copied ? t('common.copied') : t('common.copy') }}
        </n-button>
      </div>
    </template>
    <n-result v-if="error" status="error" :title="resolvedErrorTitle" :description="error" />
    <div v-else class="result-card__content">
      <JsonKeyValue v-if="typeof displayResult === 'object' && displayResult !== null" :data="displayResult" :format-value="resolvedFormatValue" />
      <n-code v-else :code="formatted" language="json" />
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NIcon } from 'naive-ui'
import { CopyOutline, CheckmarkOutline } from '@vicons/ionicons5'
import { useI18n } from '@/stores/i18n'
import JsonKeyValue, { type JsonValueFormatter } from '@/components/JsonKeyValue.vue'
import { parseJobStatusMessage } from '@/api/job'
import { isJobRecovering, useJobTracking } from '@/stores/jobTracking'
import { hasAuditTableReference } from '@/utils/auditTableReferences'
import { hasAlgorithmIdReference } from '@/utils/algorithmReferences'
import { useReferenceCatalog } from '@/stores/referenceCatalog'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  result: unknown
  error?: string
  title?: string
  errorTitle?: string
  maxWidth?: string
  formatValue?: JsonValueFormatter
  jobId?: string | null
}>(), {
  maxWidth: '100%',
  jobId: null,
})
const { snapshots } = useJobTracking()
const resultJobId = computed(() => {
  if (props.jobId) return props.jobId
  const result = props.result
  if (result && typeof result === 'object' && 'jobId' in result && typeof result.jobId === 'string') return result.jobId
  return null
})
const jobSnapshot = computed(() => {
  const snapshot = resultJobId.value ? snapshots[resultJobId.value] : null
  return snapshot?.snapshotLoaded ? snapshot : null
})
const { ensureLoaded, ensureAuditTablesLoaded, formatValue: catalogFormatValue } = useReferenceCatalog()
const resolvedFormatValue = computed(() => props.formatValue ?? catalogFormatValue)
const displayResult = computed(() => {
  const result = props.result
  const job = jobSnapshot.value
  if (!job) return normalizeResultMessages(result)
  const snapshot = result && typeof result === 'object' && !Array.isArray(result)
    ? result as Record<string, unknown>
    : {}
  return normalizeResultMessages({
    ...snapshot,
    status: isJobRecovering(job) ? t('job.statusRecovering') : job.status,
    detail: job.statusMessage ?? snapshot.detail ?? snapshot.statusMessage,
  })
})
watch(displayResult, value => {
  if (!props.error && hasAuditTableReference(value)) void ensureAuditTablesLoaded()
  if (!props.error && hasAlgorithmIdReference(value)) void ensureLoaded()
}, { immediate: true })

function normalizeResultMessages(value: unknown, key = ''): unknown {
  if ((key === 'detail' || key === 'statusMessage') && typeof value === 'string') return parseJobStatusMessage(value) ?? value
  if (Array.isArray(value)) {
    let normalized: unknown[] | null = null
    value.forEach((item, index) => {
      const result = normalizeResultMessages(item)
      if (result !== item) {
        normalized ??= value.slice(0, index)
      }
      normalized?.push(result)
    })
    return normalized ?? value
  }
  if (!value || typeof value !== 'object') return value
  let normalized: Record<string, unknown> | null = null
  for (const [childKey, childValue] of Object.entries(value)) {
    const result = normalizeResultMessages(childValue, childKey)
    if (result !== childValue) {
      normalized ??= { ...value }
      normalized[childKey] = result
    }
  }
  return normalized ?? value
}

const copied = ref(false)

const resolvedTitle = computed(() => props.title || t('common.result'))
const resolvedErrorTitle = computed(() => props.errorTitle || t('common.operationFailed'))

const formatted = computed(() => {
  try { return JSON.stringify(displayResult.value, null, 2) } catch { return String(displayResult.value) }
})

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(formatted.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* ignore */ }
}
</script>

<style scoped>
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.result-card__content {
  max-height: min(52vh, 480px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
}
</style>
