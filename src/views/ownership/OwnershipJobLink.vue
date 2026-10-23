<template>
  <div class="ownership-job">
    <span class="ownership-job__label">{{ label || t('ownership.workbench.job') }}</span>
    <code class="ownership-job__id" :title="jobId">{{ jobId }}</code>
    <n-button size="tiny" quaternary :aria-label="t('ownership.workbench.copyJobId')" @click="handleCopy">
      <template #icon><n-icon :component="copied ? CheckmarkOutline : CopyOutline" size="13" /></template>
      {{ copied ? t('common.copied') : t('common.copy') }}
    </n-button>
    <n-tag v-if="statusText" size="small" :bordered="false" :type="tagType">{{ statusText }}</n-tag>
    <span v-else class="ownership-job__pending">{{ t('ownership.workbench.jobLoading') }}</span>
    <router-link class="ownership-job__open" :to="executionPath">
      {{ t('ownership.workbench.openJob') }}<span aria-hidden="true"> →</span>
    </router-link>
    <span v-if="loadFailed" class="ownership-job__error" role="status">{{ t('ownership.workbench.jobUnavailable') }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NIcon, NTag } from 'naive-ui'
import { CopyOutline, CheckmarkOutline } from '@vicons/ionicons5'
import { isJobRecovering, subscribeJob, trackJob, useJobTracking } from '@/stores/jobTracking'
import { jobStatusLabel } from '@/utils/statusLabels'
import { jobStatusTagType } from '@/utils/jobStatus'
import { useI18n } from '@/stores/i18n'
import { copyText, ownershipJobPath } from './ownershipWorkbench'

const props = withDefaults(defineProps<{ jobId: string; label?: string; track?: boolean }>(), {
  label: '',
  track: false,
})
const { t } = useI18n()
const { snapshots } = useJobTracking()
const copied = ref(false)
let releaseSubscription: (() => void) | null = null

const snapshot = computed(() => snapshots[props.jobId])
const recovering = computed(() => isJobRecovering(snapshot.value))
const statusText = computed(() => {
  const job = snapshot.value
  if (!job || !job.snapshotLoaded) return ''
  return recovering.value ? t('job.statusRecovering') : jobStatusLabel(job.status, t)
})
const tagType = computed(() => recovering.value ? 'warning' : jobStatusTagType(snapshot.value?.status))
const loadFailed = computed(() => Boolean(snapshot.value?.detailLoadFailed && !snapshot.value?.detailLoaded))
const executionPath = computed(() => ownershipJobPath(props.jobId))

watch(() => props.jobId, jobId => {
  releaseSubscription?.()
  releaseSubscription = null
  if (!jobId) return
  if (props.track) trackJob(jobId, 'Ownership')
  releaseSubscription = subscribeJob(jobId)
}, { immediate: true })

onBeforeUnmount(() => {
  releaseSubscription?.()
  releaseSubscription = null
})

async function handleCopy() {
  if (await copyText(props.jobId)) {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}
</script>

<style scoped>
.ownership-job {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-3);
  min-width: 0;
  padding: var(--apple-space-2) 0;
  font-size: 12px;
}
.ownership-job__label {
  color: var(--apple-gray-4);
}
.ownership-job__id {
  min-width: 0;
  max-width: 28ch;
  overflow: hidden;
  color: var(--apple-gray-1);
  font-family: var(--apple-font-mono);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ownership-job__pending {
  color: var(--apple-gray-4);
}
.ownership-job__error {
  color: var(--apple-red);
}
.ownership-job__open {
  color: var(--apple-blue);
  font-weight: 600;
  text-decoration: none;
}
.ownership-job__open:hover,
.ownership-job__open:focus-visible {
  color: var(--apple-blue-hover);
}
</style>
