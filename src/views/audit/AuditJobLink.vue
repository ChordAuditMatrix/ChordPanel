<template>
  <div class="audit-job">
    <span class="audit-job__label">{{ t('audit.workbench.operations.jobLabel') }}</span>
    <code class="audit-job__id" :title="jobId">{{ jobId }}</code>
    <n-button size="tiny" quaternary :aria-label="t('audit.workbench.operations.copyJobId')" @click="handleCopy">
      <template #icon><n-icon :component="copied ? CheckmarkOutline : CopyOutline" size="13" /></template>
      {{ copied ? t('common.copied') : t('common.copy') }}
    </n-button>
    <n-tag v-if="statusText" size="small" :bordered="false" :type="tagType">{{ statusText }}</n-tag>
    <span v-else class="audit-job__pending">{{ t('audit.workbench.operations.jobLoading') }}</span>
    <router-link class="audit-job__open" :to="executionPath">
      {{ t('audit.workbench.operations.openExecution') }}<span aria-hidden="true"> →</span>
    </router-link>
    <span v-if="loadFailed" class="audit-job__error" role="status">{{ t('audit.workbench.operations.jobUnavailable') }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NIcon, NTag } from 'naive-ui'
import { CheckmarkOutline, CopyOutline } from '@vicons/ionicons5'
import { subscribeJob, trackJob, useJobTracking } from '@/stores/jobTracking'
import { useI18n } from '@/stores/i18n'
import { jobStatusLabel } from '@/utils/statusLabels'
import { jobStatusTagType } from '@/utils/jobStatus'

const props = withDefaults(defineProps<{ jobId: string; track?: boolean }>(), { track: false })
const { t } = useI18n()
const { snapshots } = useJobTracking()
const copied = ref(false)
let releaseSubscription: (() => void) | null = null

const snapshot = computed(() => snapshots[props.jobId])
const statusText = computed(() => {
  const job = snapshot.value
  if (!job || !job.snapshotLoaded) return ''
  return jobStatusLabel(job.status, t)
})
const tagType = computed(() => jobStatusTagType(snapshot.value?.status))
const loadFailed = computed(() => Boolean(snapshot.value?.detailLoadFailed && !snapshot.value?.detailLoaded))
const executionPath = computed(() => `/executions/${encodeURIComponent(props.jobId)}`)

watch(() => props.jobId, jobId => {
  releaseSubscription?.()
  releaseSubscription = null
  if (!jobId) return
  if (props.track) trackJob(jobId, 'Audit')
  releaseSubscription = subscribeJob(jobId)
}, { immediate: true })

onBeforeUnmount(() => {
  releaseSubscription?.()
  releaseSubscription = null
})

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(props.jobId)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    copied.value = false
  }
}
</script>

<style scoped>
.audit-job {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-3);
  min-width: 0;
  padding: var(--apple-space-2) 0;
  font-size: 12px;
}
.audit-job__label {
  color: var(--apple-gray-4);
}
.audit-job__id {
  min-width: 0;
  max-width: 28ch;
  overflow: hidden;
  color: var(--apple-gray-1);
  font-family: var(--apple-font-mono);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audit-job__pending {
  color: var(--apple-gray-4);
}
.audit-job__error {
  color: var(--apple-red);
}
.audit-job__open {
  color: var(--apple-blue);
  font-weight: 600;
  text-decoration: none;
}
.audit-job__open:hover,
.audit-job__open:focus-visible {
  color: var(--apple-blue-hover);
}
</style>
