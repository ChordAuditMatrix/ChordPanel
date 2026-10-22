<template>
  <main class="execution-view">
    <header class="execution-header">
      <div class="execution-heading">
        <p class="eyebrow">{{ t('execution.title') }}</p>
        <h1 class="execution-title">
          {{ kind ? executionKindLabel(kind, t) : t('execution.title') }}
        </h1>
        <div class="execution-identity">
          <span class="job-id mono">{{ jobId ?? t('execution.notAvailable') }}</span>
          <span v-if="ownerLabel" class="identity-separator" aria-hidden="true">·</span>
          <span v-if="ownerLabel" class="owner-label">{{ ownerLabel }}</span>
          <span v-if="state.initialLoading" class="section-status" role="status">{{ t('execution.loading') }}</span>
        </div>
      </div>

      <div class="execution-actions">
        <div class="view-toggle" role="group" :aria-label="t('execution.viewMode')">
          <n-button
            size="small"
            :type="presentation.viewMode === 'sequence' ? 'primary' : 'default'"
            :aria-pressed="presentation.viewMode === 'sequence'"
            @click="setExecutionView('sequence')"
          >
            {{ t('execution.sequenceView') }}
          </n-button>
          <n-button
            size="small"
            :type="presentation.viewMode === 'topology' ? 'primary' : 'default'"
            :aria-pressed="presentation.viewMode === 'topology'"
            @click="setExecutionView('topology')"
          >
            {{ t('execution.topologyView') }}
          </n-button>
        </div>
        <n-button size="small" :loading="reloading" :disabled="!jobId" @click="handleReload">
          {{ t('execution.reload') }}
        </n-button>
        <n-button
          size="small"
          :loading="state.resynchronizing"
          :disabled="!jobId || state.initialLoading"
          @click="handleResync"
        >
          {{ t('execution.resync') }}
        </n-button>
        <n-button size="small" type="primary" ghost :disabled="!jobId" @click="goToReport">
          {{ t('execution.openReport') }}
        </n-button>
      </div>
    </header>

    <n-alert v-if="!jobId" type="warning" :bordered="false">
      {{ t('execution.notAvailable') }}
    </n-alert>

    <template v-else>
      <n-alert v-if="state.summary.error" type="error" :bordered="false">
        <div class="alert-row">
          <span>{{ t('execution.loadFailed') }}</span>
          <n-button size="tiny" :loading="reloading" @click="handleReload">{{ t('execution.retry') }}</n-button>
        </div>
      </n-alert>

      <section class="execution-context" :aria-label="t('execution.title')">
        <dl class="execution-metrics">
          <div class="execution-metric">
            <dt>{{ t('execution.status') }}</dt>
            <dd>
              <n-tag v-if="jobStatus" :type="jobStatusTag" size="small" :bordered="false">
                {{ jobStatusLabel(jobStatus, t) }}
              </n-tag>
              <span v-else class="muted">{{ summaryPlaceholder }}</span>
            </dd>
          </div>
          <div class="execution-metric">
            <dt>{{ t('execution.createdAt') }}</dt>
            <dd>{{ createdAt !== null ? formatDateTime(createdAt) : summaryPlaceholder }}</dd>
          </div>
          <div class="execution-metric">
            <dt>{{ t('execution.updatedAt') }}</dt>
            <dd>{{ updatedAt !== null ? formatDateTime(updatedAt) : summaryPlaceholder }}</dd>
          </div>
          <div class="execution-metric">
            <dt>{{ t('execution.taskSummary') }}</dt>
            <dd class="mono">{{ taskTotalLabel }}</dd>
          </div>
          <div v-if="kind === 'maintenance'" class="execution-metric">
            <dt>{{ t('execution.maintenance.recoveryState') }}</dt>
            <dd>{{ maintenanceRecoveryText }}</dd>
          </div>
        </dl>

        <details v-if="summary" class="coverage-disclosure">
          <summary>
            <span>{{ t('execution.coverage') }}</span>
            <span class="coverage-summary">
              <span v-for="row in coverageRows" :key="row.key" class="coverage-summary-item">
                {{ row.label }}:
                {{ row.coverage ? coverageStateLabel(row.coverage, t) : t('execution.notAvailable') }}
              </span>
            </span>
          </summary>
          <dl class="coverage-grid">
            <div v-for="row in coverageRows" :key="row.key">
              <dt>{{ row.label }}</dt>
              <dd>
                <n-tag v-if="row.coverage" :type="coverageTagType(row.coverage)" size="small" :bordered="false">
                  {{ coverageStateLabel(row.coverage, t) }}
                </n-tag>
                <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
              </dd>
            </div>
          </dl>
          <ul v-if="summary.coverage.reasons.length" class="reason-list" :aria-label="t('execution.coverage')">
            <li v-for="reason in summary.coverage.reasons" :key="reason">
              <n-tag size="small" :bordered="true">{{ coverageReasonLabel(reason, t) }}</n-tag>
            </li>
          </ul>
        </details>
        <p v-else class="context-unavailable muted">{{ summaryPlaceholder }}</p>
      </section>

      <section v-if="kind === 'challengeProof'" class="confidence-shell">
        <ChallengeConfidencePanel
          :execution-kind="kind"
          :job-metadata="jobDetail?.metadata ?? null"
          :verified="verified"
          :job-status="jobStatus"
          :coverage="summary?.coverage.workerStages ?? null"
          compact
        />
      </section>

      <div class="execution-layout">
        <section class="canvas-shell" :aria-label="t('execution.viewMode')">
          <header class="canvas-heading">
            <h2>
              {{ presentation.viewMode === 'topology' ? t('execution.topologyView') : t('execution.sequenceView') }}
            </h2>
            <span v-if="summary?.observedAtMs !== null && summary?.observedAtMs !== undefined" class="canvas-updated mono">
              {{ formatDateTime(summary.observedAtMs) }}
            </span>
          </header>

          <ol
            v-if="stageProjection.stages.length"
            class="stage-strip"
            :aria-label="t('execution.stages.title')"
          >
            <li v-for="stage in stageProjection.stages" :key="stage.id">
              <button
                type="button"
                class="strip-step"
                :class="{
                  current: stage.id === sequenceStageId,
                  observed: stage.status === 'observed',
                  failed: stage.hasFailureEvidence,
                }"
                :aria-pressed="stage.id === sequenceStageId"
                @click="handleSelectStage(stage.id)"
              >
                <span class="strip-index mono">{{ stage.index + 1 }}</span>
                <span class="strip-label">{{ t(stage.labelKey) }}</span>
              </button>
            </li>
          </ol>

          <ExecutionSequenceView
            v-show="presentation.viewMode === 'sequence' && kind !== 'tagGeneration'"
            :key="jobId"
            :kind="kind"
            :stages="stageProjection.stages"
            :communication="communicationProjection"
            :selected-stage-id="sequenceStageId"
            :animation-activity-id="animationActivityId"
            :loading="state.observations.loading && !state.observations.loaded"
            :error="state.observations.error || state.links.error || state.protocol.error ? t('execution.loadFailed') : null"
            @select-stage="handleSelectStage"
            @manual-explore="handleManualExplore"
          />

          <TagGenerationCanvas
            v-show="presentation.viewMode === 'sequence' && kind === 'tagGeneration'"
            :key="`${jobId}-tag-canvas`"
            :stages="stageProjection.stages"
            :parts="parts"
            :summary="summary ?? null"
            :selected-stage-id="sequenceStageId"
            :tasks="tasks"
            :loading="state.parts.loading && !state.parts.loaded"
            :error="state.parts.error ? t('execution.loadFailed') : null"
            @select-stage="handleSelectStage"
            @manual-explore="handleManualExplore"
          />

          <ExecutionTopologyView
            v-show="presentation.viewMode === 'topology'"
            :key="`${jobId}-topology`"
            :projection="communicationProjection"
            :selected-activity-id="topologySelectedActivityId"
            :animation-activity-id="animationActivityId"
            :role-node-ids="topologyNodeIds"
            :disabled="!jobId"
            :loading="(state.links.loading && !state.links.loaded) || (state.protocol.loading && !state.protocol.loaded)"
            :error="state.links.error || state.protocol.error ? t('execution.loadFailed') : null"
            @select-activity="handleSelectTopologyActivity"
            @manual-explore="handleManualExplore"
          />
        </section>

        <aside class="worklog-shell" :aria-label="t('execution.observations')">
          <section class="current-stage">
            <div class="current-stage-heading">
              <p class="eyebrow">{{ t('execution.currentStage') }}</p>
              <span v-if="currentStage?.hasFailureEvidence" class="current-stage-failure">
                {{ t('execution.stages.failure') }}
              </span>
            </div>
            <h2 v-if="currentStage">{{ t(currentStage.labelKey) }}</h2>
            <p v-else class="muted">{{ t('execution.noCurrentStage') }}</p>
            <div v-if="currentStage" class="current-stage-meta">
              <span>{{ stageEvidenceLabel(currentStage) }}</span>
              <span>{{ t('execution.observations') }}: {{ currentStage.evidence.length }}</span>
            </div>
          </section>

          <ExecutionStagePanel
            :stages="stageProjection.stages"
            :latest-observed-stage-id="stageProjection.latestObservedStageId"
            :observations="observations"
            :selected-stage-id="selectedStageId"
            :highlighted-stage-id="sequenceStageId"
            :selected-observation-id="selectedObservationId"
            :follow-latest="presentation.followLatest"
            :replay-observation-id="presentation.replayObservationId"
            :replay-is-playing="presentation.isPlaying"
            :playback-speed="presentation.playbackSpeed"
            :disabled="!jobId"
            :loading="state.observations.loading && !state.observations.loaded"
            :error="state.observations.error ? t('execution.loadFailed') : null"
            :show-stage-navigator="presentation.viewMode === 'topology'"
            layout="sidebar"
            @select-stage="handleSelectStage"
            @select-observation="handleSelectObservation"
            @follow-latest="handleFollowLatest"
            @replay-pointer="handleReplayPointer"
            @playback-start="handleReplayStart"
            @playback-pause="handleReplayPause"
            @step="handleReplayStep"
            @speed-change="handleReplaySpeed"
            @manual-explore="handleManualExplore"
          />
        </aside>
      </div>

      <details v-if="kind === 'tagGeneration'" class="execution-details">
        <summary>
          <span>{{ t('execution.tagGeneration.title') }} · {{ t('execution.parts') }}</span>
          <span class="detail-summary-meta">
            <span v-if="state.parts.loading" role="status">{{ t('execution.loading') }}</span>
            <span v-else-if="state.parts.error" class="detail-error">{{ t('execution.loadFailed') }}</span>
            <span v-else class="mono">{{ parts.length }}</span>
          </span>
        </summary>
        <div class="details-body">
          <n-alert v-if="state.parts.error" type="error" :bordered="false" class="section-alert">
            <div class="alert-row">
              <span>{{ t('execution.loadFailed') }}</span>
              <n-button size="tiny" :loading="reloading" @click="handleReload">{{ t('execution.retry') }}</n-button>
            </div>
          </n-alert>
          <div v-if="state.parts.loading && !state.parts.loaded" class="state-block" role="status">
            <n-spin size="small" />
            <span>{{ t('execution.loading') }}</span>
          </div>
          <TagPartMatrix
            v-if="state.parts.loaded"
            :parts="parts"
            :summary="summary ?? null"
            :tasks="tasks"
            :page-coverage="state.partsPageCoverage"
            :window-loading="state.partsWindowLoading"
            :window-errors="state.partsWindowErrors"
            :load-part-windows="session.loadPartWindows"
          />
        </div>
      </details>

      <details class="execution-details">
        <summary>
          <span>{{ t('execution.tasks') }}</span>
          <span class="detail-summary-meta">
            <span>{{ t('execution.jobState') }}: <strong>{{ sharedJobState }}</strong></span>
            <span>{{ t('execution.taskSummary') }}: <strong>{{ taskTotalLabel }}</strong></span>
            <span v-if="taskPage?.loading" role="status">{{ t('execution.loading') }}</span>
            <span v-if="taskPage?.error" class="detail-error">{{ t('execution.loadFailed') }}</span>
          </span>
        </summary>
        <div class="details-body">
          <n-alert v-if="jobDetailFailed" type="warning" :bordered="false" class="section-alert">
            {{ t('execution.loadFailed') }}
          </n-alert>
          <n-alert v-if="taskPage?.error" type="error" :bordered="false" class="section-alert">
            <div class="alert-row">
              <span>{{ t('execution.loadFailed') }}</span>
              <n-button size="tiny" @click="handleTaskRetry">{{ t('execution.retry') }}</n-button>
            </div>
          </n-alert>
          <p v-if="taskPage && !taskPage.loading && !taskPage.error && !tasks.length" class="muted">
            {{ t('execution.noTasks') }}
          </p>
          <ul v-else-if="tasks.length" class="task-list">
            <li v-for="task in tasks" :key="task.taskId" class="task-row">
              <button
                type="button"
                class="task-id task-detail-button mono"
                :aria-label="t('job.taskDetail', { id: task.taskId })"
                @click="openTaskDetail(task)"
              >{{ task.taskId }}</button>
              <n-tag :type="jobStatusTagType(task.status)" size="small" :bordered="false">
                {{ taskStatusLabel(task.status, t) }}
              </n-tag>
              <span class="task-type">{{ task.taskType }}</span>
            </li>
          </ul>
          <div v-if="taskPage && taskPage.total > taskPage.pageSize" class="pagination">
            <n-pagination
              :page="taskPage.page"
              :page-size="taskPage.pageSize"
              :item-count="taskPage.total"
              :page-slot="5"
              @update:page="handleTaskPageChange"
            />
          </div>
        </div>
      </details>

      <TaskDetailModal :task="selectedTask" :job="jobDetail" @close="closeTaskDetail" />
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TraceCoverageState, TraceSourceComponent } from '@/api/trace'
import type { TaskSummary } from '@/api/job'
import { useTraceSession } from '@/features/execution/data/useTraceSession'
import { projectExecutionStages } from '@/features/execution/data/executionStages'
import { matchesChallengeDispatchPacket } from '@/features/execution/data/executionSequence'
import {
  executionCommunicationActivityForObservation,
  executionCommunicationActivities,
  projectExecutionCommunication,
  type ExecutionCommunicationActivity,
} from '@/features/execution/data/executionCommunication'
import {
  createExecutionViewState,
  selectObservation as selectExecutionObservation,
  selectStage as selectExecutionStage,
  setViewMode as setExecutionViewMode,
} from '@/features/execution/data/executionViewState'
import { useExecutionReplay } from '@/features/execution/useExecutionReplay'
import ChallengeConfidencePanel from '@/features/execution/components/ChallengeConfidencePanel.vue'
import ExecutionSequenceView from '@/features/execution/components/ExecutionSequenceView.vue'
import ExecutionStagePanel from '@/features/execution/components/ExecutionStagePanel.vue'
import ExecutionTopologyView from '@/features/execution/components/ExecutionTopologyView.vue'
import TagGenerationCanvas from '@/features/execution/components/TagGenerationCanvas.vue'
import TagPartMatrix from '@/features/execution/components/TagPartMatrix.vue'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import { useI18n } from '@/stores/i18n'
import { formatDateTime } from '@/utils/datetime'
import { jobStatusTagType } from '@/utils/jobStatus'
import {
  coverageReasonLabel,
  coverageStateLabel,
  executionKindLabel,
  jobStatusLabel,
  maintenanceRecoveryLabel,
  taskStatusLabel,
} from '@/utils/statusLabels'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

/** Follow `route.params.jobId` reactively so in-place navigation reloads the session. */
const jobId = computed<string | null>(() => {
  const value = route.params.jobId
  const id = Array.isArray(value) ? value[0] : value
  return typeof id === 'string' && id.length > 0 ? id : null
})

const session = useTraceSession(jobId)
const { state, tasks, taskPage, jobDetail, jobDetailFailed } = session
const selectedTask = ref<TaskSummary | null>(null)

/** Trace facts come from the session summary; the shared Job snapshot stays authoritative for status. */
const summary = computed(() => state.summary.data)
const observations = computed(() => state.observations.data ?? [])
const parts = computed(() => state.parts.data ?? [])
const sharedJob = computed(() => (session.job.value?.snapshotLoaded ? session.job.value : null))
const jobStatus = computed(() => sharedJob.value?.status ?? summary.value?.job.status ?? null)
const jobStatusTag = computed(() => jobStatusTagType(jobStatus.value))
const kind = computed(() => summary.value?.executionKind ?? null)
const owner = computed(() => summary.value?.references.owner ?? sharedJob.value?.dataOwner ?? null)
const ownerLabel = computed(() => identityLabel(owner.value))
const createdAt = computed(() => summary.value?.job.createdAtMs ?? sharedJob.value?.createdAtMs ?? null)
const updatedAt = computed(() => summary.value?.observedAtMs ?? null)
const maintenanceRecoveryState = computed(() => {
  const detailState = jobDetail.value?.maintenanceRecovery
  if (typeof detailState === 'string') return detailState
  return sharedJob.value?.maintenanceRecovery ?? null
})
const maintenanceRecoveryText = computed(() => {
  if (maintenanceRecoveryState.value === null && session.jobDetailLoading.value) {
    return t('execution.loading')
  }
  return maintenanceRecoveryLabel(maintenanceRecoveryState.value, t)
})

const presentation = ref(createExecutionViewState())
const stageProjection = computed(() => projectExecutionStages(kind.value, observations.value))
const sequenceStageId = computed(() =>
  presentation.value.followLatest
    ? stageProjection.value.latestObservedStageId
    : presentation.value.selectedStageId,
)
const currentStage = computed(() =>
  stageProjection.value.stages.find(stage => stage.id === sequenceStageId.value) ?? null,
)

function stageEvidenceLabel(stage: NonNullable<typeof currentStage.value>): string {
  if (stage.status === 'notObserved') return t('execution.stages.notObserved')
  if (stage.evidence.some(evidence => evidence.source.quality === 'observed')) {
    return t('execution.sourceQuality.observed')
  }
  if (stage.evidence.some(evidence => evidence.source.quality === 'reconstructed')) {
    return t('execution.stages.reconstructed')
  }
  return t('execution.stages.qualityUnknown')
}

const selectedStageId = computed(() =>
  presentation.value.followLatest ? null : presentation.value.selectedStageId,
)
const selectedObservationId = computed(() => {
  if (presentation.value.followLatest) return observations.value[observations.value.length - 1]?.observationId ?? null
  if (presentation.value.isPlaying) return presentation.value.replayObservationId
  return presentation.value.selectedObservationId
})
const replay = useExecutionReplay(observations, presentation)
const selectedActivityId = ref<string | null>(null)
const animationActivityId = ref<string | null>(null)
const liveActivityId = ref<string | null>(null)

let observationsHydrated = false
const seenObservationIds = new Set<string>()
const pendingActivityObservationIds = new Set<string>()
const communicationProjection = computed(() => projectExecutionCommunication({
  activeJobId: jobId.value ?? '',
  links: state.links.data ?? [],
  observations: observations.value,
  protocolEvents: state.protocol.data ?? [],
}))
const communicationActivities = computed(() =>
  executionCommunicationActivities(communicationProjection.value),
)
const topologyNodeIds = computed<Partial<Record<TraceSourceComponent, string | null>>>(() => {
  const peer = communicationProjection.value.peerCorrelations[0]
  const packet = communicationProjection.value.confirmedPackets[0]
  return {
    Admin: packet?.fromNodeId ?? null,
    Audit: metadataNodeId('auditNodeId') ?? peer?.originNodeId ?? null,
    Storage: metadataNodeId('storageNodeId') ?? peer?.nodeId ?? null,
  }
})

watch(
  [
    jobId,
    () => state.observations.loaded,
    () => state.observations.data,
    communicationActivities,
    () => presentation.value.followLatest,
  ],
  ([activeJobId, loaded, items], [previousJobId]) => {
    if (activeJobId !== previousJobId) {
      observationsHydrated = false
      seenObservationIds.clear()
      pendingActivityObservationIds.clear()
      selectedActivityId.value = null
      animationActivityId.value = null
      liveActivityId.value = null
      return
    }
    if (!activeJobId || !loaded) return
    const currentItems = items ?? []
    if (!observationsHydrated) {
      for (const observation of currentItems) seenObservationIds.add(observation.observationId)
      observationsHydrated = true
      const latest = currentItems[currentItems.length - 1]
      liveActivityId.value = activityForObservation(latest?.observationId ?? null)?.activityId ?? null
      return
    }

    for (const observation of currentItems) {
      if (seenObservationIds.has(observation.observationId)) continue
      seenObservationIds.add(observation.observationId)
      pendingActivityObservationIds.add(observation.observationId)
    }
    if (!presentation.value.followLatest) {
      pendingActivityObservationIds.clear()
      return
    }
    if (pendingActivityObservationIds.size === 0) {
      const latest = currentItems[currentItems.length - 1]
      liveActivityId.value = activityForObservation(latest?.observationId ?? null)?.activityId ?? null
      return
    }

    while (pendingActivityObservationIds.size > 200) {
      const oldestId = pendingActivityObservationIds.values().next().value
      if (oldestId === undefined) break
      pendingActivityObservationIds.delete(oldestId)
    }
    const pendingIds = [...pendingActivityObservationIds]
    for (let index = pendingIds.length - 1; index >= 0; index -= 1) {
      const activity = activityForObservation(pendingIds[index])
      if (!activity) continue
      liveActivityId.value = activity.activityId
      animationActivityId.value = activity.activityId
      pendingActivityObservationIds.clear()
      break
    }
  },
  { flush: 'post' },
)

const topologySelectedActivityId = computed(() => {
  if (presentation.value.followLatest) return liveActivityId.value
  if (presentation.value.isPlaying) {
    return activityForObservation(selectedObservationId.value)?.activityId ?? null
  }
  return selectedActivityId.value
})

const verified = computed(() => {
  const traceValue = summary.value?.references.verified
  if (traceValue === true || traceValue === false) return traceValue
  const metadataValue = jobDetail.value?.metadata?.verified
  if (metadataValue === true || metadataValue === false) return metadataValue
  if (metadataValue === 'true') return true
  if (metadataValue === 'false') return false
  return null
})

watch(jobId, (nextId, previousId) => {
  if (nextId === previousId) return
  replay.pause()
  presentation.value = createExecutionViewState()
  selectedActivityId.value = null
  selectedTask.value = null
  animationActivityId.value = null
  liveActivityId.value = null
  observationsHydrated = false
  seenObservationIds.clear()
  pendingActivityObservationIds.clear()
}, { flush: 'sync' })
watch(() => presentation.value.replayObservationId, (observationId, previousId) => {
  const current = presentation.value
  if (!observationId || current.followLatest || current.selectedObservationId === observationId) return
  if (!current.isPlaying && current.selectedObservationId !== previousId) return
  presentation.value = {
    ...current,
    selectedObservationId: observationId,
    selectedStageId: stageIdForObservation(observationId),
  }
  selectedActivityId.value = activityForObservation(observationId)?.activityId ?? null
  animationActivityId.value = selectedActivityId.value
})

const summaryLoading = computed(
  () => state.summary.loading || (state.initialLoading && !state.summary.loaded && !state.summary.error),
)
const summaryPlaceholder = computed(() => (summaryLoading.value ? t('execution.loading') : t('execution.notAvailable')))

const sharedJobState = computed(() => {
  if (sharedJob.value) return jobStatusLabel(sharedJob.value.status, t)
  if (session.jobDetailLoading.value) return t('execution.loading')
  return t('execution.notAvailable')
})

const taskTotalLabel = computed(() => {
  const page = taskPage.value
  if (!page || page.error) return t('execution.notAvailable')
  if (page.loading && page.total === 0 && tasks.value.length === 0) return t('execution.loading')
  return String(page.total)
})

/** Coverage is displayed from the summary; no completeness is inferred from loaded rows. */
const coverageRows = computed(() => {
  const coverage = summary.value?.coverage
  if (!coverage) return []
  return [
    { key: 'job', label: t('execution.coverageScopes.job'), coverage: coverage.job },
    { key: 'tasks', label: t('execution.coverageScopes.tasks'), coverage: coverage.tasks },
    { key: 'parts', label: t('execution.coverageScopes.parts'), coverage: coverage.parts },
    { key: 'protocol', label: t('execution.coverageScopes.protocol'), coverage: coverage.protocol },
    { key: 'workerStages', label: t('execution.coverageScopes.workerStages'), coverage: coverage.workerStages },
  ]
})

const hasResourceError = computed(() =>
  Boolean(
    state.summary.error ||
      state.observations.error ||
      state.parts.error ||
      state.links.error ||
      state.protocol.error,
  ),
)

const reloading = ref(false)

function identityLabel(identity: { userId?: string | null; userName?: string | null } | null | undefined): string {
  if (!identity) return ''
  const id = identity.userId?.trim() ?? ''
  const name = identity.userName?.trim() ?? ''
  if (id && name) return `${id} (${name})`
  return id || name
}


function coverageTagType(value: TraceCoverageState | null): 'default' | 'success' | 'warning' | 'error' {
  if (value === 'complete') return 'success'
  if (value === 'partial') return 'warning'
  if (value === 'unavailable' || value === 'expired') return 'error'
  return 'default'
}
function activityForObservation(observationId: string | null): ExecutionCommunicationActivity | null {
  const observation = observations.value.find(item => item.observationId === observationId)
  return executionCommunicationActivityForObservation(observation, communicationActivities.value)
}

function setExecutionView(mode: 'sequence' | 'topology') {
  presentation.value = setExecutionViewMode(presentation.value, mode)
}

function handleSelectTopologyActivity(activityId: string | null) {
  if (!activityId) {
    selectedActivityId.value = null
    animationActivityId.value = null
    return
  }
  const activity = communicationActivities.value.find(item => item.activityId === activityId)
  if (!activity) return

  selectedActivityId.value = activityId
  animationActivityId.value = activityId
  replay.pause()
  presentation.value = selectExecutionStage(presentation.value, presentation.value.selectedStageId)

  if (activity.kind === 'localStage') {
    handleSelectObservation(activity.observationId, stageIdForObservation(activity.observationId))
    return
  }
  if (activity.kind === 'peerCorrelation') {
    if (activity.direction) {
      handleSelectObservation(
        activity.direction.observationId,
        stageIdForObservation(activity.direction.observationId),
      )
    }
    return
  }

  const dispatchStage = stageProjection.value.stages.find(stage =>
    matchesChallengeDispatchPacket(stage, activity),
  )
  const dispatchEvidence = dispatchStage?.evidence.find(evidence =>
    matchesChallengeDispatchPacket({ id: 'dispatch', evidence: [evidence] }, activity),
  )
  if (dispatchStage && dispatchEvidence) {
    handleSelectObservation(dispatchEvidence.observationId, dispatchStage.id)
  }
}

function metadataNodeId(key: string): string | null {
  const value = jobDetail.value?.metadata?.[key]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}


function stageIdForObservation(observationId: string): string | null {
  return stageProjection.value.stages.find(stage =>
    stage.evidence.some(evidence => evidence.observationId === observationId),
  )?.id ?? null
}

function handleSelectStage(stageId: string | null) {
  replay.pause()
  selectedActivityId.value = null
  animationActivityId.value = null
  presentation.value = selectExecutionStage(presentation.value, stageId)
}

function handleSelectObservation(observationId: string, stageId: string | null) {
  replay.pause()
  presentation.value = selectExecutionObservation(presentation.value, observationId, stageId)
  selectedActivityId.value = activityForObservation(observationId)?.activityId ?? null
  animationActivityId.value = selectedActivityId.value
}

function handleFollowLatest() {
  replay.followLatest()
  animationActivityId.value = null
}

function handleManualExplore() {
  replay.pause()
  presentation.value = selectExecutionStage(presentation.value, presentation.value.selectedStageId)
}

function handleReplayPointer(observationId: string | null) {
  replay.seek(observationId)
  if (observationId) {
    handleSelectObservation(observationId, stageIdForObservation(observationId))
  } else {
    animationActivityId.value = null
  }
}

function handleReplayStart() {
  replay.play()
}

function handleReplayPause() {
  replay.pause()
}

function handleReplayStep(delta: -1 | 1) {
  replay.step(delta)
  const observationId = presentation.value.replayObservationId
  if (observationId) {
    handleSelectObservation(observationId, stageIdForObservation(observationId))
  }
}

function handleReplaySpeed(speed: number) {
  replay.changeSpeed(speed)
}

/** Reread every failed resource; otherwise refresh the live summary/observation tail. */
async function handleReload() {
  if (reloading.value) return
  reloading.value = true
  try {
    if (state.initialLoaded && !hasResourceError.value) {
      await session.poll()
    } else {
      await session.reload()
    }
  } finally {
    reloading.value = false
  }
}

async function handleResync() {
  await session.resyncObservations()
}

function handleTaskRetry() {
  void session.retryTaskPage()
}

function handleTaskPageChange(page: number) {
  session.setTaskPage(page)
}
function openTaskDetail(task: TaskSummary): void {
  selectedTask.value = task
}
function closeTaskDetail(): void {
  selectedTask.value = null
}

function goToReport() {
  const id = jobId.value
  if (!id) return
  void router.push({ name: 'executionReport', params: { jobId: id } })
}
</script>

<style scoped>
 .execution-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: none;
  min-width: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.execution-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.execution-identity {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.eyebrow {
  color: var(--apple-gray-3);
  font-size: 12px;
}

.job-id {
  color: var(--apple-gray-1);
  font-size: 14px;
  word-break: break-all;
}

.execution-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.view-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.panel {
  min-width: 0;
  padding: 16px;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.panel-title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 14px;
  font-weight: 600;
}

.panel-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.panel-meta strong {
  color: var(--apple-gray-2);
  font-weight: 500;
}

.panel-empty {
  margin: 0;
  font-size: 13px;
}

.section-status {
  color: var(--apple-gray-3);
  font-size: 12px;
}

.count {
  color: var(--apple-gray-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.fact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px 20px;
  margin: 0;
}

.fact {
  min-width: 0;
}

.fact dt {
  margin-bottom: 4px;
  color: var(--apple-gray-3);
  font-size: 11px;
}

.fact dd {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  word-break: break-word;
}

.mono {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

.muted {
  color: var(--apple-gray-3);
}

.nowrap {
  white-space: nowrap;
}

.reason-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.section-alert {
  margin-bottom: 12px;
}

.alert-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.state-block {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.task-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 0;
  border-bottom: 1px solid var(--apple-border);
}

.task-row:last-child {
  border-bottom: none;
}

.task-id {
  color: var(--apple-gray-1);
  word-break: break-all;
}

.task-type {
  margin-left: auto;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.task-detail-button {
  padding: 0;
  font: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.task-detail-button:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
  border-radius: 2px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.table-scroll {
  max-height: 560px;
  overflow: auto;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.table-scroll:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.data-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  color: var(--apple-gray-3);
  background: var(--apple-card);
  border-bottom: 1px solid var(--apple-border);
  white-space: nowrap;
}

.data-table td {
  padding: 8px 12px;
  vertical-align: top;
  color: var(--apple-gray-2);
  border-bottom: 1px solid var(--apple-border);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.event-type {
  color: var(--apple-gray-1);
  word-break: break-word;
}

@media (max-width: 640px) {
  .execution-view {
    gap: 12px;
  }

  .panel {
    padding: 12px;
  }

  .execution-toolbar {
    align-items: stretch;
  }

  .execution-actions {
    justify-content: flex-end;
  }

  .pagination {
    justify-content: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .table-scroll {
    scroll-behavior: auto;
  }
}
 .execution-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--apple-border);
}

.execution-heading {
  min-width: 0;
}

.execution-heading .eyebrow {
  margin: 0 0 4px;
}

.execution-title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 24px;
  line-height: 1.2;
  font-weight: 650;
}

.execution-header .execution-identity {
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-top: 8px;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.execution-header .job-id {
  font-size: 12px;
}

.identity-separator {
  color: var(--apple-gray-4);
}

.owner-label {
  overflow-wrap: anywhere;
}

.execution-header .execution-actions {
  justify-content: flex-end;
}

.execution-context {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.execution-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 10px 18px;
  margin: 0;
  padding: 0 0 10px;
  border-bottom: 1px solid var(--apple-border);
}

.execution-metric {
  min-width: 0;
}

.execution-metric dt,
.coverage-grid dt {
  margin-bottom: 3px;
  color: var(--apple-gray-3);
  font-size: 11px;
}

.execution-metric dd,
.coverage-grid dd {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.coverage-disclosure {
  min-width: 0;
}

.coverage-disclosure > summary,
.execution-details > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 9px 0;
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  list-style: none;
}

.coverage-disclosure > summary::-webkit-details-marker,
.execution-details > summary::-webkit-details-marker {
  display: none;
}

.coverage-disclosure > summary::after,
.execution-details > summary::after {
  content: '';
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-right: 1.5px solid var(--apple-gray-3);
  border-bottom: 1.5px solid var(--apple-gray-3);
  transform: rotate(45deg);
}

.coverage-disclosure[open] > summary::after,
.execution-details[open] > summary::after {
  transform: rotate(225deg);
}

.coverage-disclosure > summary:focus-visible,
.execution-details > summary:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.coverage-summary,
.detail-summary-meta {
  display: flex;
  align-items: center;
  gap: 6px 12px;
  flex-wrap: wrap;
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 400;
}

.coverage-summary-item {
  white-space: nowrap;
}

.coverage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px 16px;
  margin: 4px 0 0;
  padding: 10px 0 0;
  border-top: 1px solid var(--apple-border);
}

.reason-list {
  margin-top: 10px;
}

.context-unavailable {
  margin: 0;
  font-size: 12px;
}

.confidence-shell,
.canvas-shell,
.worklog-shell {
  min-width: 0;
  padding: 14px;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
}

.confidence-shell {
  overflow: hidden;
}

.execution-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 380px);
  align-items: start;
  gap: 14px;
  min-width: 0;
}

.canvas-shell {
  min-height: 440px;
}

.canvas-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--apple-border);
}

.canvas-heading h2 {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 15px;
  font-weight: 600;
}

.stage-strip {
  display: flex;
  gap: 4px;
  margin: 0 0 12px;
  padding: 0 0 6px;
  overflow-x: auto;
  list-style: none;
  scrollbar-width: thin;
}

.stage-strip li {
  flex: 0 0 auto;
}

.strip-step {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  max-width: 190px;
  padding: 4px 7px;
  font: inherit;
  font-size: 10.5px;
  color: var(--apple-gray-3);
  text-align: left;
  white-space: nowrap;
  background: transparent;
  border: 1px solid var(--apple-border);
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background-color 120ms ease;
}

.strip-step .strip-index {
  color: var(--apple-gray-4);
  font-size: 10px;
}

.strip-step .strip-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.strip-step.observed {
  color: var(--apple-gray-1);
}

.strip-step.current {
  color: var(--apple-blue);
  border-color: color-mix(in srgb, var(--apple-blue) 65%, var(--apple-border));
  background: color-mix(in srgb, var(--apple-blue) 7%, var(--apple-card));
}

.strip-step.failed {
  border-color: var(--apple-red);
}

.strip-step:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.canvas-updated {
  color: var(--apple-gray-3);
  white-space: nowrap;
}

.worklog-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.current-stage {
  min-width: 0;
  padding: 0 0 12px;
  border-bottom: 1px solid var(--apple-border);
}

.current-stage-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.current-stage .eyebrow {
  margin: 0;
}

.current-stage h2 {
  margin: 5px 0 0;
  color: var(--apple-gray-1);
  font-size: 16px;
  line-height: 1.35;
  font-weight: 600;
}

.current-stage > p {
  margin: 5px 0 0;
  font-size: 12px;
}

.current-stage-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 8px;
  color: var(--apple-gray-3);
  font-size: 11px;
}

.current-stage-failure,
.detail-error {
  color: var(--apple-red);
  font-size: 11px;
}

.execution-stage-panel.is-sidebar {
  gap: 14px;
}

.execution-details {
  min-width: 0;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
}

.execution-details > summary {
  padding: 11px 14px;
}

.execution-details[open] > summary {
  border-bottom: 1px solid var(--apple-border);
}

.details-body {
  min-width: 0;
  padding: 12px 14px;
}

@media (max-width: 1120px) {
  .execution-layout {
    grid-template-columns: minmax(0, 1fr) minmax(300px, 340px);
  }
}

@media (max-width: 920px) {
  .execution-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .execution-view {
    gap: 12px;
  }

  .execution-header {
    flex-direction: column;
    gap: 12px;
  }

  .execution-header .execution-actions {
    justify-content: flex-start;
  }

  .execution-title {
    font-size: 21px;
  }

  .confidence-shell,
  .canvas-shell,
  .worklog-shell {
    padding: 11px;
  }

  .execution-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .coverage-disclosure > summary,
  .execution-details > summary {
    align-items: flex-start;
  }

  .coverage-summary,
  .detail-summary-meta {
    justify-content: flex-start;
  }

  .coverage-summary-item {
    white-space: normal;
  }

  .details-body {
    padding: 10px;
  }

  .pagination {
    justify-content: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .table-scroll {
    scroll-behavior: auto;
  }
}

</style>
