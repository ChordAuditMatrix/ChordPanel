<template>
  <n-popover raw trigger="click" placement="left" :width="440" :style="{ padding: '0' }" :scrollable="true" :overlay-style="{ maxWidth: '90vw', maxHeight: '70vh' }" @update:show="$emit('popover-visibility', job.jobId, $event)">
    <template #trigger>
      <n-card size="small" :bordered="true" class="job-card">
        <template #header>
          <div class="job-header">
            <n-tag :type="recovering ? 'warning' : jobStatusTagType(job.status)" size="small" :bordered="false">{{ recovering ? t('job.statusRecovering') : job.status }}</n-tag>
            <span class="job-type">{{ job.jobType }}</span>
            <span class="job-id">{{ job.jobId.substring(0, 8) }}...</span>
            <n-button v-if="terminal || !recovering" size="tiny" quaternary type="error" @click.stop="$emit('remove', job.jobId)" :title="t('jobProgress.remove')">×</n-button>
          </div>
        </template>
        <div class="job-info">
          <span>{{ t('jobProgress.createdAt') }}: {{ formatDateTime(job.createdAtMs) }}</span>
          <span v-if="job.totalDurationMs">{{ t('jobProgress.duration') }}: {{ job.totalDurationMs }}ms</span>
        </div>
        <div v-if="job.history?.length" class="job-steps">
          <div v-for="(entry, idx) in job.history" :key="idx" class="step-item" :class="{ active: entry.status === job.status, done: idx < currentHistoryIndex }">
            <span class="step-dot" :class="'dot-' + jobStatusTagType(entry.status)"></span>
            <span class="step-label">{{ entry.status }}</span>
            <span class="step-time">{{ formatDateTime(entry.switchedAtMs) }}</span>
          </div>
        </div>
        <div v-if="job.statusMessage" class="job-msg">
          <JobStatusMessage :message="job.statusMessage" />
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
import { useI18n } from '@/stores/i18n'
import JobDetailPanel from '@/components/JobDetailPanel.vue'
import JobStatusMessage from '@/components/JobStatusMessage.vue'

const props = defineProps<{
  job: TrackedJob
  recovering: boolean
  terminal: boolean
  popoverVisible: boolean
}>()

defineEmits<{
  remove: [jobId: string]
  'popover-visibility': [jobId: string, shown: boolean]
  'task-click': [task: TaskSummary, job: JobDetail | null]
}>()

const { t } = useI18n()
const currentHistoryIndex = computed(() => props.job.history?.findIndex(entry => entry.status === props.job.status) ?? 0)
</script>

<style scoped>
.job-header { display: flex; align-items: center; gap: 8px; }
.job-type { font-weight: 600; font-size: 13px; }
.job-id { margin-left: auto; color: var(--apple-gray-3, #6E6E73); font: 11px var(--apple-font-mono, monospace); }
.job-info { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-bottom: 8px; color: var(--apple-gray-3, #6E6E73); font-size: 12px; }
.job-card { margin-bottom: 12px; cursor: pointer; transition: transform var(--apple-dur-fast, 160ms) var(--apple-spring), border-color var(--apple-dur-fast, 160ms) var(--apple-ease-out), box-shadow var(--apple-dur-fast, 160ms) var(--apple-ease-out); }
@media (hover: hover) and (pointer: fine) {
  .job-card:hover { transform: translateY(-1px); border-color: var(--apple-blue); box-shadow: var(--apple-shadow-sm); }
}
.job-card:active { transform: scale(0.98); }
.job-steps { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 11px; }
.step-item { display: flex; align-items: center; gap: 4px; opacity: .45; }
.step-item.active { opacity: 1; font-weight: 600; }
.step-item.done { opacity: .7; }
.step-dot { display: inline-block; width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; }
.dot-info { background: var(--apple-blue, #0071E3); }
.dot-success { background: var(--apple-green, #34C759); }
.dot-error { background: var(--apple-red, #FF3B30); }
.dot-warning { background: var(--apple-orange, #FF9500); }
.dot-default { background: var(--apple-gray-3, #8E8E93); }
.step-time { margin-left: 4px; opacity: .5; }
.job-msg { margin-top: 8px; padding: 8px 10px; border-radius: var(--apple-radius-sm); background: var(--apple-bg); font-size: 12px; overflow-wrap: anywhere; }
.popover-wrap { height: min(420px, 60vh); overflow-y: auto; padding: 12px; border: 1px solid var(--apple-gray-6); border-radius: var(--apple-radius-lg); box-shadow: var(--apple-shadow-md); }
@media (prefers-reduced-motion: reduce) { .job-card { transition: none; } }
</style>
