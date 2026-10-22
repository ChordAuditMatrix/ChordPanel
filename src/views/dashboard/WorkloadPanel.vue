<template>
  <n-card size="small" :bordered="true" class="overview-card apple-card-hover">
    <template #header>
      <div class="panel-heading">
        <span class="card-title">{{ t('dashboard.taskOverview') }}</span>
        <span class="heading-meta">
          <span v-if="totalJobs !== undefined" class="job-count">{{ recentJobs.length }} / {{ totalJobs }}</span>
          <router-link to="/jobs">{{ t('dashboard.viewJobs') }} <span aria-hidden="true">↗</span></router-link>
        </span>
      </div>
    </template>

    <ul v-if="recentJobs.length" class="job-list">
      <li
        v-for="job in recentJobs"
        :key="job.jobId"
        class="job-item"
        :class="{ 'is-selected': job.jobId === selectedJobId }"
      >
        <button
          type="button"
          class="job-select"
          :aria-pressed="job.jobId === selectedJobId"
          @click="emit('select-job', job.jobId)"
        >
          <span class="job-top">
            <span class="job-state">{{ jobStateLabel(job) }}</span>
            <span class="job-type">{{ jobTypeLabel(job.jobType, t) }}</span>
          </span>
          <span class="job-meta">
            <span class="job-id mono">{{ job.jobId }}</span>
            <span v-if="ownerLabel(job)" class="job-owner">{{ ownerLabel(job) }}</span>
          </span>
        </button>
        <router-link
          class="job-open"
          :to="executionPath(job.jobId)"
          :aria-label="t('job.openExecution')"
          :title="t('job.openExecution')"
        ><span aria-hidden="true">→</span></router-link>
      </li>
    </ul>
    <p v-if="jobsError && recentJobs.length" class="quiet-state is-error" role="status">
      {{ t('dashboard.recentJobsStale') }}
    </p>
    <p v-else-if="!recentJobs.length && jobsLoading" class="quiet-state" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="!recentJobs.length && jobsError" class="quiet-state is-error" role="status">{{ t('common.requestFailed') }}</p>
    <p v-else-if="!recentJobs.length" class="quiet-state">{{ t('common.noData') }}</p>

    <dl class="workload-meta">
      <div class="meta-item">
        <dt>{{ t('dashboard.queueDepth') }}</dt>
        <dd :class="{ 'is-error': statusError }">
          <template v-if="statusError && queueDepth === undefined">{{ t('common.requestFailed') }}</template>
          <template v-else-if="statusLoading && queueDepth === undefined">{{ t('common.loading') }}</template>
          <template v-else>{{ displayValue(queueDepth) }}</template>
        </dd>
      </div>
      <div class="meta-item">
        <dt>{{ t('dashboard.totalRejected') }}</dt>
        <dd :class="{ 'is-error': statusError }">
          <template v-if="statusError && totalRejected === undefined">{{ t('common.requestFailed') }}</template>
          <template v-else-if="statusLoading && totalRejected === undefined">{{ t('common.loading') }}</template>
          <template v-else>{{ displayValue(totalRejected) }}</template>
        </dd>
      </div>
    </dl>

    <section v-if="challenge" class="challenge-summary" :aria-label="t('execution.confidence.title')">
      <div class="challenge-head">
        <span class="challenge-title">{{ t('execution.confidence.title') }}</span>
        <router-link class="challenge-link" :to="executionPath(challenge.jobId)">
          {{ t('job.openExecution') }}<span aria-hidden="true"> →</span>
        </router-link>
      </div>
      <div class="challenge-fact">
        <span>{{ t('execution.confidence.target') }}</span><strong class="mono">{{ challenge.target }}</strong>
      </div>
      <div class="challenge-fact">
        <span>{{ t('execution.confidence.theoretical') }}</span><strong class="mono">{{ challenge.theoretical }}</strong>
      </div>
      <p class="challenge-note">
        {{ t('execution.confidence.assumedCorruptionRatio') }} <span class="mono">{{ challenge.ratio }}</span>
      </p>
      <p class="challenge-note is-muted">{{ t('execution.confidence.assumption') }}</p>
    </section>
  </n-card>
</template>

<script setup lang="ts">
import { useI18n } from '@/stores/i18n'
import { isJobRecovering } from '@/stores/jobTracking'
import { jobStatusLabel, maintenanceRecoveryLabel } from '@/utils/statusLabels'
import { jobTypeLabel } from '@/utils/jobType'
import type { JobSummary } from '@/api/job'

withDefaults(defineProps<{
  jobsLoading: boolean
  statusLoading: boolean
  jobsError: boolean
  statusError: boolean
  totalJobs?: number
  queueDepth?: number
  totalRejected?: number
  recentJobs: JobSummary[]
  selectedJobId: string | null
  /**
   * Only present when the selected Job is a ChallengeProof with parsable
   * persisted metadata; never a placeholder percentage.
   */
  challenge?: { jobId: string; target: string; theoretical: string; ratio: string } | null
}>(), {
  challenge: null,
})

const emit = defineEmits<{ (event: 'select-job', jobId: string): void }>()
const { t } = useI18n()
function executionPath(jobId: string): string {
  return `/executions/${encodeURIComponent(jobId)}`
}
function jobStateLabel(job: JobSummary): string {
  if (isJobRecovering(job)) return t('job.statusRecovering')
  if (job.maintenanceRecovery) return maintenanceRecoveryLabel(job.maintenanceRecovery, t)
  return jobStatusLabel(job.status, t)
}
function ownerLabel(job: JobSummary): string {
  return job.initiator?.userName ?? job.dataOwner?.userName ?? ''
}
function displayValue(value?: number): string {
  return Number.isFinite(value) ? String(value) : '—'
}
</script>

<style scoped>
.overview-card { height: 100%; }
.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.card-title { color: var(--apple-gray-1); font-size: 13px; font-weight: 650; }
.heading-meta { display: inline-flex; align-items: baseline; gap: 10px; min-width: 0; }
.job-count { color: var(--apple-gray-4); font-size: 11px; font-variant-numeric: tabular-nums; }
.panel-heading a { color: var(--apple-blue); font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.panel-heading a:hover { color: var(--apple-blue-hover); }
.mono { font-family: var(--apple-font-mono); }

.job-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.job-item {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--apple-gray-6);
  border-radius: 10px;
  background: var(--apple-card);
  transition: border-color var(--apple-dur-fast) var(--apple-ease-out), background-color var(--apple-dur-fast) var(--apple-ease-out);
}
.job-item:hover { border-color: var(--apple-gray-5); }
.job-item.is-selected { border-color: var(--apple-blue); background: color-mix(in srgb, var(--apple-blue) 6%, var(--apple-card)); }
.job-select {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 9px 4px 9px 11px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--apple-gray-2);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.job-select:focus-visible { outline: 2px solid var(--apple-blue); outline-offset: 1px; }
.job-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
.job-state {
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--apple-blue) 12%, transparent);
  color: var(--apple-blue);
  font-size: 10px;
  font-weight: 600;
}
.job-type { overflow: hidden; color: var(--apple-gray-1); font-size: 12.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.job-meta { display: flex; align-items: baseline; gap: 8px; min-width: 0; color: var(--apple-gray-4); font-size: 10.5px; }
.job-id { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.job-owner { flex: none; }
.job-open {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-right: 6px;
  border-radius: 8px;
  color: var(--apple-blue);
  font-size: 13px;
  text-decoration: none;
}
.job-open:hover, .job-open:focus-visible { background: color-mix(in srgb, var(--apple-blue) 12%, transparent); color: var(--apple-blue-hover); }

.quiet-state { margin: 0; color: var(--apple-gray-3); font-size: 12px; }
.quiet-state.is-error { color: var(--apple-red); }

.workload-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 22px;
  margin: 16px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--apple-gray-6);
}
.meta-item { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.meta-item dt { color: var(--apple-gray-4); font-size: 11px; }
.meta-item dd { margin: 0; color: var(--apple-gray-1); font-size: 12px; font-variant-numeric: tabular-nums; font-weight: 600; }
.meta-item dd.is-error { color: var(--apple-red); font-weight: 500; }

.challenge-summary { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--apple-gray-6); }
.challenge-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.challenge-title { color: var(--apple-gray-2); font-size: 12px; font-weight: 650; }
.challenge-link { color: var(--apple-blue); font-size: 11px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.challenge-link:hover, .challenge-link:focus-visible { color: var(--apple-blue-hover); }
.challenge-fact { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-top: 6px; color: var(--apple-gray-3); font-size: 11px; }
.challenge-fact strong { color: var(--apple-gray-1); font-size: 12px; font-variant-numeric: tabular-nums; }
.challenge-note { margin: 6px 0 0; color: var(--apple-gray-4); font-size: 10.5px; }
.challenge-note.is-muted { color: var(--apple-gray-4); opacity: 0.85; }
</style>
