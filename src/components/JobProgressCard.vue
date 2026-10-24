<template>
  <n-popover
    v-model:show="popoverShown"
    trigger="click"
    placement="left"
    :width="440"
    :show-arrow="false"
    :content-style="{ padding: '0' }"
    :style="{ padding: '0', background: 'transparent', boxShadow: 'none', borderRadius: '8px' }"
    :scrollable="true"
    :overlay-style="{ maxWidth: '90vw', maxHeight: '70vh' }"
  >
    <template #trigger>
      <n-card size="small" :bordered="true" class="job-card">
        <template #header>
          <div class="job-header">
            <n-tag
              :type="recovering || isCancelledJob(job) ? 'warning' : jobStatusTagType(job.status)"
              size="small"
              :bordered="false"
            >
              {{ recovering ? t('job.statusRecovering') : jobStatusLabel(job.status, t) }}
            </n-tag>
            <div class="job-heading">
              <span class="job-name" :title="businessName">{{ businessName }}</span>
              <span class="job-id" :title="job.jobId">{{ shortJobId }}</span>
            </div>
            <n-button
              v-if="terminal || !recovering"
              size="tiny"
              quaternary
              type="error"
              :title="t('jobProgress.remove')"
              @click.stop="$emit('remove', job.jobId)"
            >×</n-button>
          </div>
        </template>
        <div class="job-info">
          <span>{{ t('jobProgress.createdAt') }}: {{ formatDateTime(job.createdAtMs) }}</span>
          <span v-if="job.totalDurationMs">{{ t('jobProgress.duration') }}: {{ job.totalDurationMs }}ms</span>
          <span v-if="job.initiator" class="job-owner">
            {{ t('job.initiator') }}: {{ formatUserIdentity(job.initiator) }}
          </span>
        </div>
        <div v-if="errorLabel" class="job-error">
          <n-tag :type="isCancelledJob(job) ? 'warning' : 'error'" size="small" :bordered="false" :title="job.errorCode">{{ errorLabel }}</n-tag>
          <span v-if="job.errorCode" class="job-error-code">{{ job.errorCode }}</span>
        </div>
        <div v-if="job.history?.length" class="job-steps">
          <div
            v-for="(entry, idx) in job.history"
            :key="idx"
            class="step-item"
            :class="{ active: entry.status === job.status, done: idx < currentHistoryIndex }"
          >
            <span class="step-dot" :class="'dot-' + jobStatusTagType(entry.status)"></span>
            <span class="step-label">{{ jobStatusLabel(entry.status, t) }}</span>
            <span class="step-time">{{ formatDateTime(entry.switchedAtMs) }}</span>
          </div>
        </div>
        <div v-if="job.statusMessage" class="job-msg">
          <JobStatusMessage :message="job.statusMessage" />
        </div>
        <div class="job-links" @click.stop>
          <n-button text size="tiny" type="primary" :aria-label="t('job.workbench.action.execution')" :title="t('job.workbench.action.executionHelp')" @click="requestExecution">
            {{ t('job.workbench.action.execution') }}
          </n-button>
          <n-button text size="tiny" type="primary" :aria-label="t('job.workbench.action.report')" :title="t('job.workbench.action.reportHelp')" @click="requestReport">
            {{ t('job.workbench.action.report') }}
          </n-button>
          <n-button text size="tiny" type="primary" :aria-label="t('job.workbench.action.details')" :title="t('job.workbench.action.detailsHelp')" @click="requestJobCenter">
            {{ t('job.workbench.action.details') }}
          </n-button>
        </div>
      </n-card>
    </template>
    <div class="popover-wrap">
      <JobDetailPanel
        :job-id="job.jobId"
        :job-snapshot="job"
        :visible="popoverVisible"
        compact
        hide-actions
        @task-click="(task, detail) => $emit('task-click', task, detail)"
      />
    </div>
  </n-popover>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { JobDetail, TaskSummary } from '@/api/job'
import type { TrackedJob } from '@/stores/jobTracking'
import { formatDateTime } from '@/utils/datetime'
import { jobStatusTagType } from '@/utils/jobStatus'
import { jobStatusLabel } from '@/utils/statusLabels'
import {
  isCancelledJob,
  jobErrorLabel,
  jobOperation,
  jobOperationLabel,
  jobTypeBusinessLabel,
} from '@/utils/jobBusiness'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { useI18n } from '@/stores/i18n'
import JobDetailPanel from '@/components/JobDetailPanel.vue'
import JobStatusMessage from '@/components/JobStatusMessage.vue'

const props = defineProps<{
  job: TrackedJob
  recovering: boolean
  terminal: boolean
  popoverVisible: boolean
}>()

const emit = defineEmits<{
  remove: [jobId: string]
  'popover-visibility': [jobId: string, shown: boolean]
  'task-click': [task: TaskSummary, job: JobDetail | null]
  'open-execution': [jobId: string]
  'open-report': [jobId: string]
  'open-job-center': [jobId: string]
}>()
const { t } = useI18n()
const { formatUserIdentity } = useReferenceCatalog()
const currentHistoryIndex = computed(() => props.job.history?.findIndex(entry => entry.status === props.job.status) ?? 0)
const popoverShown = computed({
  get: () => props.popoverVisible,
  set: (shown: boolean) => emit('popover-visibility', props.job.jobId, shown),
})
const operation = computed(() => jobOperation(props.job.metadata))
const operationLabel = computed(() => jobOperationLabel(operation.value, t))
const businessName = computed(() => {
  if (operationLabel.value) return operationLabel.value
  return jobTypeBusinessLabel(props.job.jobType, t, props.job.detailLoaded === true)
})
const shortJobId = computed(() => props.job.jobId.length > 14 ? `${props.job.jobId.slice(0, 12)}…` : props.job.jobId)
const errorLabel = computed(() => jobErrorLabel(props.job.errorCode, t))
function requestExecution() {
  popoverShown.value = false
  emit('open-execution', props.job.jobId)
}

function requestReport() {
  popoverShown.value = false
  emit('open-report', props.job.jobId)
}
function requestJobCenter() {
  popoverShown.value = false
  emit('open-job-center', props.job.jobId)
}

</script>

<style scoped>
.job-header {
  display: flex;
  align-items: center;
  gap: var(--apple-space-2);
  min-width: 0;
}

.job-heading {
  display: flex;
  align-items: baseline;
  gap: var(--apple-space-2);
  min-width: 0;
  flex: 1;
}

.job-name {
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 640;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.job-id {
  margin-left: auto;
  color: var(--apple-gray-3);
  font: 11px var(--apple-font-mono, monospace);
  flex: 0 0 auto;
}

.job-info {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-bottom: var(--apple-space-2);
  color: var(--apple-gray-3);
  font-size: 12px;
}

.job-owner {
  overflow-wrap: anywhere;
}

.job-error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  margin-bottom: var(--apple-space-2);
}

.job-error-code {
  color: var(--apple-gray-3);
  font-family: var(--apple-font-mono, monospace);
  font-size: 11px;
}

.job-card {
  margin-bottom: var(--apple-space-3);
  cursor: pointer;
  transition:
    transform var(--apple-dur-fast) var(--apple-spring),
    border-color var(--apple-dur-fast) var(--apple-ease-out),
    box-shadow var(--apple-dur-fast) var(--apple-ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .job-card:hover {
    transform: translateY(-1px);
    border-color: var(--apple-blue);
    box-shadow: var(--apple-shadow-sm);
  }
}

.job-card:active {
  transform: scale(0.98);
}

.job-steps {
  display: flex;
  max-height: min(24vh, 160px);
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: var(--apple-space-2);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
  font-size: 11px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.45;
}

.step-item.active {
  opacity: 1;
  font-weight: 600;
}

.step-item.done {
  opacity: 0.7;
}

.step-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
}

.dot-info {
  background: var(--apple-blue);
}

.dot-success {
  background: var(--apple-green);
}

.dot-error {
  background: var(--apple-red);
}

.dot-warning {
  background: var(--apple-orange);
}

.dot-default {
  background: var(--apple-gray-3);
}

.step-time {
  margin-left: 4px;
  opacity: 0.5;
}

.job-msg {
  max-height: min(36vh, 240px);
  margin-top: var(--apple-space-2);
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--apple-space-2) var(--apple-space-3);
  border-radius: var(--apple-radius-sm);
  background: var(--apple-bg);
  font-size: 12px;
  overflow-wrap: anywhere;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
}

.job-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-4);
  margin-top: var(--apple-space-3);
  padding-top: var(--apple-space-2);
  border-top: 1px solid var(--apple-border);
}

.popover-wrap {
  height: min(420px, 60vh);
  overflow-y: auto;
  padding: var(--apple-space-3);
  border: 0;
  border-radius: var(--apple-radius-lg);
  box-shadow: none;
}

@media (prefers-reduced-motion: reduce) {
  .job-card {
    transition: none;
  }
}
</style>
