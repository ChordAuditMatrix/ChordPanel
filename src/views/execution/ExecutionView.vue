<template>
  <main class="execution-view">
    <header class="execution-header">
      <div class="execution-heading">
        <p class="eyebrow">{{ t('execution.title') }}</p>
        <div class="execution-title-row">
          <ExecutionBackButton :label="returnButtonLabel()" @activate="handleReturn" />
          <h1 class="execution-title">
            {{ kind ? executionKindLabel(kind, t) : t('execution.title') }}
          </h1>
          <n-tag v-if="isHistoricalReplay" type="info" size="small" :bordered="false">
            {{ t('execution.replay.title') }}
          </n-tag>
          <n-tag v-else-if="jobStatus && kind !== 'challengeProof' && kind !== 'identityVerification'" :type="jobStatusTag" size="small" :bordered="false">
            {{ jobStatusLabel(jobStatus, t) }}
          </n-tag>
          <span v-else-if="state.initialLoading" class="section-status" role="status">{{ t('execution.loading') }}</span>
        </div>
      </div>
      <div class="execution-context">
        <div class="execution-context-groups">
          <section class="execution-context-group execution-context-group--job">
            <h2>{{ t('execution.jobIdLabel') }}</h2>
            <code class="execution-meta-value mono" :title="jobId ?? t('execution.notAvailable')">
              {{ jobId ?? t('execution.notAvailable') }}
            </code>
          </section>
          <section class="execution-context-group execution-context-group--time">
            <h2>{{ t('execution.timeInfo') }}</h2>
            <dl class="execution-meta-facts">
              <div>
                <dt>{{ t('execution.createdAt') }}</dt>
                <dd>{{ createdAt !== null ? formatDateTime(createdAt) : summaryPlaceholder }}</dd>
              </div>
              <div>
                <dt>{{ isHistoricalReplay ? t('execution.replay.position') : t('execution.updatedAt') }}</dt>
                <dd>{{ updatedAt !== null ? formatDateTime(updatedAt) : summaryPlaceholder }}</dd>
              </div>
              <div v-if="kind === 'maintenance'">
                <dt>{{ t('execution.maintenance.recoveryState') }}</dt>
                <dd>{{ isHistoricalReplay ? t('execution.notAvailable') : maintenanceRecoveryText }}</dd>
              </div>
            </dl>
          </section>
          <section class="execution-context-group execution-context-group--tasks">
            <h2>{{ kind === 'tagGeneration' ? t('execution.taskInfo') : t('execution.taskTraceInfo') }}</h2>
            <dl class="execution-meta-facts">
              <div>
                <dt>{{ isHistoricalReplay ? t('execution.replay.finalSnapshot') : t('execution.taskCount') }}</dt>
                <dd class="mono">{{ taskTotalLabel }}</dd>
              </div>
              <template v-if="kind !== 'tagGeneration'">
                <div>
                  <dt>{{ t('execution.observations') }}</dt>
                  <dd class="mono">{{ observationCountLabel }}</dd>
                </div>
                <div>
                  <dt>{{ t('execution.topology.confirmedPacket') }}</dt>
                  <dd class="mono">{{ confirmedPacketCountLabel }}</dd>
                </div>
                <div>
                  <dt>{{ t('execution.topology.peerCorrelation') }}</dt>
                  <dd class="mono">{{ peerCorrelationCountLabel }}</dd>
                </div>
              </template>
            </dl>
            <p v-if="kind !== 'tagGeneration'" class="execution-context-note">
              {{ isHistoricalReplay ? t('execution.replay.traceCountsNote') : t('execution.traceCountsNote') }}
            </p>
          </section>
          <section
            v-if="hasCoverageDetails"
            class="execution-context-group execution-context-group--coverage"
          >
            <h2>{{ t('execution.coverage') }}</h2>
            <ExecutionCoverageSummary
              :coverage="summary?.coverage ?? null"
              :execution-kind="kind"
              :is-replay="isHistoricalReplay"
            />
          </section>
        </div>
        <p class="execution-scope">{{ t('execution.scopeNote') }}</p>
      </div>

      <div class="execution-actions">
        <div class="execution-action-group execution-action-group--views" role="group" :aria-label="t('execution.actionGroups.views')">
          <span class="execution-action-group__label" aria-hidden="true">{{ t('execution.actionGroups.views') }}</span>
          <div class="execution-action-group__buttons">
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
        </div>
        <div class="execution-action-group execution-action-group--replay" role="group" :aria-label="t('execution.actionGroups.replay')">
          <span class="execution-action-group__label" aria-hidden="true">{{ t('execution.actionGroups.replay') }}</span>
          <div class="execution-action-group__buttons">
            <n-button
              size="small"
              :type="presentation.followLatest ? 'primary' : 'default'"
              :aria-pressed="presentation.followLatest"
              @click="handleFollowLatest"
            >
              {{ presentation.followLatest ? t('execution.replay.live') : t('execution.replay.follow') }}
            </n-button>
            <n-button
              size="small"
              :disabled="!observations.length"
              @click="presentation.isPlaying ? handleReplayPause() : handleReplayStart()"
            >
              {{ presentation.isPlaying ? t('execution.replay.pause') : t('execution.replay.start') }}
            </n-button>
          </div>
        </div>
        <div class="execution-action-group execution-action-group--data" role="group" :aria-label="t('execution.actionGroups.data')">
          <span class="execution-action-group__label" aria-hidden="true">{{ t('execution.actionGroups.data') }}</span>
          <div class="execution-action-group__buttons">
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
        </div>
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

      <section
        v-if="kind === 'challengeProof' || kind === 'identityVerification'"
        class="execution-overview-grid"
        :class="`execution-overview-grid--${kind}`"
        :aria-label="t('execution.statusSummary')"
      >
        <section class="execution-overview-card algorithm-card">
          <h2 class="execution-overview-title">{{ t('execution.algorithmSelection.cardTitle') }}</h2>
          <AlgorithmSelectionBar
            v-if="displayedAlgorithmId"
            :selection="displayedAlgorithmSelection"
            :algorithm-id="displayedAlgorithmId"
            :catalog-profile="algorithmCatalogProfile"
            :catalog-strategy="algorithmCatalogStrategy"
            unstyled
          />
          <p v-else class="execution-overview-empty">{{ t('execution.algorithmSelection.noSnapshot') }}</p>
        </section>

        <ChallengeConfidencePanel
          v-if="kind === 'challengeProof'"
          class="execution-overview-confidence"
          :execution-kind="kind"
          :job-metadata="jobDetail?.metadata ?? null"
          compact
        />

        <section class="execution-overview-card execution-status-card">
          <h2 class="execution-overview-title">{{ t('execution.statusSummary') }}</h2>
          <div class="execution-overview-status">
            <div class="execution-status-item">
              <span class="execution-status-label">{{ t('execution.confidence.verified') }}</span>
              <strong class="execution-status-value" :class="verificationStatusClass">
                {{ verificationStatusText }}
              </strong>
            </div>
            <div class="execution-status-item">
              <span class="execution-status-label">{{ t('execution.jobState') }}</span>
              <strong class="execution-status-value">
                {{ isHistoricalReplay ? t('execution.notAvailable') : jobStatus ? jobStatusLabel(jobStatus, t) : t('execution.notAvailable') }}
              </strong>
            </div>
          </div>
          <p v-if="isHistoricalReplay" class="execution-replay-note">
            {{ t('execution.replay.finalStateHidden') }}
          </p>
        </section>
      </section>
      <section v-else-if="displayedAlgorithmId" class="execution-algorithm-summary">
        <AlgorithmSelectionBar
          :selection="displayedAlgorithmSelection"
          :algorithm-id="displayedAlgorithmId"
          :catalog-profile="algorithmCatalogProfile"
          :catalog-strategy="algorithmCatalogStrategy"
        />
      </section>

      <section v-if="stageProjection.stages.length" class="execution-stage-summary">
        <h2 class="execution-stage-summary__title">{{ t('execution.stageRail.title') }}</h2>
        <ExecutionStageRail
          :execution-kind="stageProjection.kind"
          :stages="stageProjection.stages"
          :dispatch-link="identityTaskRelations.dispatchLink"
          :settlement-link="identityTaskRelations.settlementLink"
          :display-facts="executionDisplayProjection.facts.stages"
          :selected-stage-id="sequenceStageId"
          @select-stage="handleSelectStage"
        />
      </section>

      <div class="execution-layout">
        <div class="execution-left-column">
        <section class="canvas-shell" :aria-label="t('execution.viewMode')">
          <header class="canvas-heading">
            <div class="canvas-heading__title">
              <h2>
                {{ presentation.viewMode === 'topology' ? t('execution.topologyView') : t('execution.sequenceView') }}
              </h2>
              <n-tag v-if="isHistoricalReplay" type="info" size="small" :bordered="false">
                {{ t('execution.replay.title') }}
              </n-tag>
            </div>
            <span v-if="updatedAt !== null" class="canvas-updated mono">
              {{ formatDateTime(updatedAt) }}
            </span>
          </header>

          <p v-if="!isHistoricalReplay && motionCueQueue.aggregatedCount" class="motion-cue-aggregate" role="status">
            {{ t('execution.replay.coalescedCues', { count: motionCueQueue.aggregatedCount }) }}
          </p>

          <ExecutionSequenceView
            v-show="presentation.viewMode === 'sequence' && kind !== 'tagGeneration'"
            :key="jobId"
            :kind="kind"
            :stages="stageProjection.stages"
            :identity-task-relations="identityTaskRelations"
            :communication="communicationProjection"
            :selected-stage-id="sequenceStageId"
            :animation-activity-id="presentation.viewMode === 'sequence' ? animationActivityId : null"
            :loop-activity-ids="loopingActivityIds"
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
            :display-projection="executionDisplayProjection"
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
            :animation-activity-id="presentation.viewMode === 'topology' ? animationActivityId : null"
            :loop-activity-ids="loopingActivityIds"
            :role-node-ids="topologyNodeIds"
            :disabled="!jobId"
            :loading="(state.links.loading && !state.links.loaded) || (state.protocol.loading && !state.protocol.loaded)"
            :error="state.links.error || state.protocol.error ? t('execution.loadFailed') : null"
            @select-activity="handleSelectTopologyActivity"
            @manual-explore="handleManualExplore"
          />
        </section>
      <section class="execution-evidence" :aria-label="t('execution.observations')">
        <details class="execution-details">
          <summary>
            <span>{{ t('execution.rail.evidence') }}</span>
            <span class="detail-summary-meta">
              <span class="mono">{{ visibleObservations.length }}</span>
              <span>{{ t('execution.replay.title') }}</span>
            </span>
          </summary>
          <div class="details-body">
            <ExecutionStagePanel
              :stages="stageProjection.stages"
              :latest-observed-stage-id="stageProjection.latestObservedStageId"
              :observations="visibleObservations"
              :replay-observations="observations"
              :selected-stage-id="selectedStageId"
              :highlighted-stage-id="sequenceStageId"
              :selected-observation-id="selectedObservationId"
              :follow-latest="presentation.followLatest"
              :replay-observation-id="presentation.replayObservationId"
              :replay-is-playing="presentation.isPlaying"
              :playback-speed="presentation.playbackSpeed"
              :playback-tempo="presentation.playbackTempo"
              :disabled="!jobId"
              :loading="state.observations.loading && !state.observations.loaded"
              :error="state.observations.error ? t('execution.loadFailed') : null"
              :show-stage-navigator="false"
              layout="full"
              @select-stage="handleSelectStage"
              @select-observation="handleSelectObservation"
              @follow-latest="handleFollowLatest"
              @replay-pointer="handleReplayPointer"
              @playback-start="handleReplayStart"
              @playback-pause="handleReplayPause"
              @step="handleReplayStep"
              @speed-change="handleReplaySpeed"
              @tempo-change="handleReplayTempo"
              @manual-explore="handleManualExplore"
            />
          </div>
        </details>

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
            :is-replay="isHistoricalReplay"
          />
        </div>
      </details>

      <details class="execution-details">
        <summary>
          <span>{{ t('execution.tasks') }}</span>
          <span class="detail-summary-meta">
            <span v-if="isHistoricalReplay">{{ t('execution.replay.finalSnapshot') }}</span>
            <span v-else>{{ t('execution.jobState') }}: <strong>{{ sharedJobState }}</strong></span>
            <span>{{ t('execution.taskSummary') }}: <strong>{{ taskTotalLabel }}</strong></span>
            <span v-if="taskPage?.loading" role="status">{{ t('execution.loading') }}</span>
            <span v-if="taskPage?.error" class="detail-error">{{ t('execution.loadFailed') }}</span>
          </span>
        </summary>
        <div class="details-body">
          <p v-if="isHistoricalReplay" class="execution-replay-note">
            {{ t('execution.replay.finalSnapshotNote') }}
          </p>
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
        </section>
        </div>

        <aside class="stage-sidebar" :class="{ 'stage-sidebar--tag': kind === 'tagGeneration' }" :aria-label="t('execution.observations')">
          <section
            v-if="kind === 'challengeProof' || kind === 'identityVerification' || kind === 'tagGeneration'"
            class="current-stage"
            :class="`focus-${currentStage ? displayStatusForStage(currentStage.id) : 'unknown'}`"
            :aria-label="t('execution.currentStage')"
          >
            <Transition name="stage-focus" mode="out-in">
              <div :key="sequenceStageId ?? 'none'" class="current-stage-content">
                <template v-if="currentStage">
                  <div class="current-stage-heading">
                    <p class="eyebrow">{{ t('execution.currentStage') }}</p>
                    <span v-if="currentStage.hasFailureEvidence" class="current-stage-failure">
                      {{ t('execution.stages.failure') }}
                    </span>
                  </div>
                  <h2>{{ t(currentStage.labelKey) }}</h2>
                  <div class="current-stage-meta">
                    <span class="current-stage-state">
                      {{ displayStatusLabel(displayStatusForStage(currentStage.id)) }}
                    </span>
                    <span v-if="currentStage.id !== 'algorithmSelection' || currentStageObservations.length > 0">
                      {{ stageEvidenceLabel(currentStage) }}
                    </span>
                    <span>{{ currentStageObservations.length }} {{ t('execution.observations') }}</span>
                  </div>
                </template>
                <template v-else-if="kind === 'identityVerification' && (sequenceStageId === 'dispatch' || sequenceStageId === 'settlement')">
                  <div class="current-stage-heading">
                    <p class="eyebrow">{{ t('execution.currentStage') }}</p>
                  </div>
                  <h2>{{ t(sequenceStageId === 'dispatch' ? 'execution.identityTimeline.dispatchTitle' : 'execution.identityTimeline.settlementTitle') }}</h2>
                  <div class="current-stage-meta">
                    <span class="current-stage-state">
                      {{ t(sequenceStageId === 'dispatch'
                        ? identityTaskRelations.dispatchLink ? 'execution.identityTimeline.dispatchRecorded' : 'execution.stages.notObserved'
                        : identityTaskRelations.settlementLink ? 'execution.identityTimeline.settlementRecorded' : 'execution.stages.notObserved') }}
                    </span>
                    <span>{{ t('execution.identityTimeline.linkRelation') }}</span>
                  </div>
                </template>
                <p v-else class="muted">{{ t('execution.noCurrentStage') }}</p>
              </div>
            </Transition>
          </section>
          <IdentityTaskRelationDetails
            v-if="kind === 'identityVerification' && (sequenceStageId === 'dispatch' || sequenceStageId === 'settlement')"
            class="current-stage-details"
            :relation="sequenceStageId === 'dispatch' ? 'dispatch' : 'settlement'"
            :link="sequenceStageId === 'dispatch' ? identityTaskRelations.dispatchLink : identityTaskRelations.settlementLink"
            :is-replay="isHistoricalReplay"
          />
          <ExecutionStageDetailsPanel
            v-else-if="currentStage && (kind === 'challengeProof' || kind === 'identityVerification' || kind === 'tagGeneration')"
            class="current-stage-details"
            :active-job-id="jobId ?? ''"
            :kind="kind"
            :stage-id="currentStage.id"
            :stage-label="t(currentStage.labelKey)"
            :is-replay="isHistoricalReplay"
            :observations="currentStageObservations"
            :metric-rows="currentStageMetricRows"
            :users="stageUserReferences.users"
            :identity-data-owner-count="stageUserReferences.identityDataOwnerCount"
            :identity-data-owner-count-source="stageUserReferences.identityDataOwnerCountSource"
            :unlisted-identity-data-owner-count="stageUserReferences.unlistedIdentityDataOwnerCount"
            :root-hash="identityRootHashDetails"
            :part-facts="executionDisplayProjection.facts.parts"
            :focus-part-index="executionDisplayProjection.focus.stageId === currentStage.id ? executionDisplayProjection.focus.partIndex : null"
            :empty-text="currentStageEmptyText"
          />


        </aside>
      </div>


      <TaskDetailModal :task="selectedTask" :job="jobDetail" @close="closeTaskDetail" />
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TraceAlgorithmSelection, TraceObservationMetricKey, TraceSourceComponent } from '@/api/trace'
import type { TaskSummary } from '@/api/job'
import { getStrategies, type AlgorithmStrategy } from '@/api/algorithm'
import { fetchAllPages } from '@/api/pagination'
import { useTraceSession } from '@/features/execution/data/useTraceSession'
import {
  projectExecutionStages,
  projectIdentityTaskRelations,
  type ExecutionStageEvidence,
} from '@/features/execution/data/executionStages'
import { projectExecutionDisplay, projectExecutionMetricSummary, projectExecutionVerdict } from '@/features/execution/data/executionDisplayProjection'
import { matchDispatchPacketStage, matchingDispatchPacketEvidence, peerEventMatchesStage } from '@/features/execution/data/executionSequence'
import {
  executionCommunicationActivityForObservation,
  executionCommunicationActivities,
  projectExecutionCommunication,
  restrictCommunicationEvidenceToReplayPrefix,
  type ExecutionCommunicationActivity,
} from '@/features/execution/data/executionCommunication'
import {
  createMotionCueQueue,
  enqueueMotionCues,
  takeNextMotionCue,
  type MotionCue,
} from '@/features/execution/data/executionMotion'
import {
  createExecutionViewState,
  getVisibleReplayObservations,
  selectObservation as selectExecutionObservation,
  selectStage as selectExecutionStage,
  setViewMode as setExecutionViewMode,
  type PlaybackTempo,
} from '@/features/execution/data/executionViewState'
import { projectStageUserReferences, projectIdentityRootHashDetails } from '@/features/execution/data/executionStageDetails'
import { useExecutionReplay } from '@/features/execution/useExecutionReplay'
import ChallengeConfidencePanel from '@/features/execution/components/ChallengeConfidencePanel.vue'
import AlgorithmSelectionBar from '@/features/execution/components/AlgorithmSelectionBar.vue'
import ExecutionSequenceView from '@/features/execution/components/ExecutionSequenceView.vue'
import ExecutionStagePanel from '@/features/execution/components/ExecutionStagePanel.vue'
import ExecutionTopologyView from '@/features/execution/components/ExecutionTopologyView.vue'
import ExecutionStageDetailsPanel from '@/features/execution/components/ExecutionStageDetailsPanel.vue'
import ExecutionBackButton from '@/features/execution/components/ExecutionBackButton.vue'
import ExecutionCoverageSummary from '@/features/execution/components/ExecutionCoverageSummary.vue'
import IdentityTaskRelationDetails from '@/features/execution/components/IdentityTaskRelationDetails.vue'
import TagGenerationCanvas from '@/features/execution/components/TagGenerationCanvas.vue'
import TagPartMatrix from '@/features/execution/components/TagPartMatrix.vue'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import ExecutionStageRail from '@/features/execution/components/ExecutionStageRail.vue'
import { useI18n } from '@/stores/i18n'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { formatDateTime } from '@/utils/datetime'
import { jobStatusTagType } from '@/utils/jobStatus'
import {
  executionKindLabel,
  jobStatusLabel,
  maintenanceRecoveryLabel,
  taskStatusLabel,
} from '@/utils/statusLabels'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { algorithmEntitiesById, ensureAlgorithmsLoaded, usersById, ensureUsersLoaded } = useReferenceCatalog()

function hasPreviousRoute(): boolean {
  const back = window.history.state?.back
  return typeof back === 'string' && back.length > 0
}

function returnButtonLabel(): string {
  return t(hasPreviousRoute() ? 'execution.backPrevious' : 'execution.backToJobs')
}

function handleReturn(): void {
  if (hasPreviousRoute()) {
    router.back()
    return
  }
  void router.replace({ name: 'jobs' })
}

/** Follow `route.params.jobId` reactively so in-place navigation reloads the session. */
const jobId = computed<string | null>(() => {
  const value = route.params.jobId
  const id = Array.isArray(value) ? value[0] : value
  return typeof id === 'string' && id.length > 0 ? id : null
})

const session = useTraceSession(jobId, { pollingProfile: 'adaptive' })
const { state, tasks, taskPage, jobDetail, jobDetailFailed } = session
const selectedTask = ref<TaskSummary | null>(null)

/** Trace facts come from the session summary; the shared Job snapshot stays authoritative for status. */
const summary = computed(() => state.summary.data)
const observations = computed(() => state.observations.data ?? [])
const parts = computed(() => state.parts.data ?? [])
const storageNodeId = computed(() => {
  const metadataNodeId = jobDetail.value?.metadata?.storageNodeId
  if (typeof metadataNodeId === 'string' && metadataNodeId.trim() !== '') return metadataNodeId.trim()
  const summaryNodeId = summary.value?.references.storageNodeId
  return typeof summaryNodeId === 'string' && summaryNodeId.trim() !== ''
    ? summaryNodeId.trim()
    : null
})
const sharedJob = computed(() => (session.job.value?.snapshotLoaded ? session.job.value : null))
const jobStatus = computed(() => sharedJob.value?.status ?? summary.value?.job.status ?? null)
const jobStatusTag = computed(() => jobStatusTagType(jobStatus.value))
const kind = computed(() => summary.value?.executionKind ?? null)
const createdAt = computed(() => summary.value?.job.createdAtMs ?? sharedJob.value?.createdAtMs ?? null)
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
const motionCueQueue = ref(createMotionCueQueue())
const activeMotionCue = ref<MotionCue | null>(null)
const isHistoricalReplay = computed(() =>
  !presentation.value.followLatest && presentation.value.replayObservationId !== null,
)
const visibleObservations = computed(() =>
  isHistoricalReplay.value
    ? getVisibleReplayObservations(presentation.value, observations.value)
    : observations.value,
)
const updatedAt = computed(() => {
  if (!isHistoricalReplay.value) return summary.value?.observedAtMs ?? null
  const history = visibleObservations.value
  return history.length > 0 ? history[history.length - 1].recordedAtMs : null
})
const stageProjection = computed(() => projectExecutionStages(kind.value, visibleObservations.value, {
  summary: summary.value ?? null,
  links: state.links.data ?? [],
}))
const algorithmSelectionEvidence = computed(() => {
  let latest: typeof visibleObservations.value[number] | null = null
  for (const observation of visibleObservations.value) {
    if (observation.eventType !== 'AlgorithmSelectionResolved') continue
    if (
      !latest
      || observation.recordedAtMs > latest.recordedAtMs
      || (observation.recordedAtMs === latest.recordedAtMs
        && observation.observationId > latest.observationId)
    ) latest = observation
  }
  return latest
})
const hasAlgorithmSelectionObservation = computed(() => algorithmSelectionEvidence.value !== null)
const algorithmSelectionSnapshot = computed(() =>
  isHistoricalReplay.value && !hasAlgorithmSelectionObservation.value
    ? null
    : summary.value?.algorithmSelection ?? null,
)
const algorithmSelectionObservation = computed(() => {
  const evidence = algorithmSelectionEvidence.value
  if (!evidence) return null
  const quality = evidence.source.quality
  return {
    algorithmId: evidence.refs.algorithmId,
    qualityLabel: quality === 'observed'
      ? t('execution.sourceQuality.observed')
      : quality === 'reconstructed'
        ? t('execution.stages.reconstructed')
        : t('execution.stages.qualityUnknown'),
  }
})
const algorithmSelectionId = computed(() =>
  algorithmSelectionSnapshot.value?.algorithmId
    ?? algorithmSelectionObservation.value?.algorithmId
    ?? (!isHistoricalReplay.value ? summary.value?.references.algorithmId : null)
    ?? null,
)
const identityAlgorithmEvidence = computed(() => {
  if (kind.value !== 'identityVerification') return null
  let latest: ExecutionStageEvidence | null = null
  for (const stage of stageProjection.value.stages) {
    if (stage.id !== 'algorithmResolved' && stage.id !== 'signaturesAggregated') continue
    for (const evidence of stage.evidence) {
      if (
        !latest
        || evidence.recordedAtMs > latest.recordedAtMs
        || (evidence.recordedAtMs === latest.recordedAtMs
          && evidence.observationId > latest.observationId)
      ) latest = evidence
    }
  }
  return latest
})
const identityAlgorithmId = computed(() => {
  const algorithmId = identityAlgorithmEvidence.value?.refs.algorithmId
  return typeof algorithmId === 'string' && algorithmId.trim() !== '' ? algorithmId.trim() : null
})
const identityAlgorithmSelection = computed<TraceAlgorithmSelection | null>(() => {
  const evidence = identityAlgorithmEvidence.value
  const algorithmId = identityAlgorithmId.value
  if (!evidence || !algorithmId) return null
  const summarySelection = algorithmSelectionSnapshot.value?.algorithmId === algorithmId
    ? algorithmSelectionSnapshot.value
    : null
  return {
    mode: summarySelection?.mode ?? null,
    algorithmId,
    algorithmName: summarySelection?.algorithmName ?? null,
    algorithmType: evidence.refs.algorithmType ?? summarySelection?.algorithmType ?? null,
    purpose: 'Identity',
    profileVersion: summarySelection?.profileVersion ?? null,
    strategyVersion: summarySelection?.strategyVersion ?? null,
    strategyKind: summarySelection?.strategyKind ?? null,
    capabilitiesMask: null,
    capabilities: null,
    stateMaintenanceParty: null,
    selectedAtMs: summarySelection?.selectedAtMs ?? null,
  }
})
const displayedAlgorithmSelection = computed(() =>
  identityAlgorithmSelection.value ?? algorithmSelectionSnapshot.value,
)
const displayedAlgorithmId = computed(() =>
  identityAlgorithmSelection.value?.algorithmId ?? algorithmSelectionId.value,
)
const algorithmCatalogProfile = computed(() => {
  const algorithmId = displayedAlgorithmId.value
  const profile = algorithmId ? algorithmEntitiesById.value.get(algorithmId) : null
  return profile?.algorithmId === algorithmId ? profile : null
})
const strategyDirectory = ref<AlgorithmStrategy[] | null>(null)
let strategyDirectoryFlight: Promise<void> | null = null

function ensureStrategyDirectoryLoaded(): Promise<void> {
  if (strategyDirectory.value !== null) return Promise.resolve()
  if (strategyDirectoryFlight) return strategyDirectoryFlight
  let flight: Promise<void>
  flight = fetchAllPages(params => getStrategies(params), 1000)
    .then(items => {
      strategyDirectory.value = items
    })
    .catch(() => {
      strategyDirectory.value = []
    })
    .finally(() => {
      if (strategyDirectoryFlight === flight) strategyDirectoryFlight = null
    })
  strategyDirectoryFlight = flight
  return flight
}

const algorithmCatalogStrategy = computed(() => {
  const profile = algorithmCatalogProfile.value
  const catalog = strategyDirectory.value
  const algorithmId = displayedAlgorithmId.value
  const selection = displayedAlgorithmSelection.value
  if (!algorithmId || !catalog || (selection?.algorithmId && selection.algorithmId !== algorithmId)) return null
  const expectedType = selection?.algorithmType?.trim() || profile?.algorithmType
  const expectedPurpose = selection?.purpose?.trim() || profile?.purpose
  if (!expectedType || !expectedPurpose) return null
  if (profile && (profile.algorithmType !== expectedType || profile.purpose !== expectedPurpose)) return null
  const matches = catalog.filter(strategy =>
    strategy.algorithmType === expectedType && strategy.purpose === expectedPurpose,
  )
  return matches.length === 1 ? matches[0] : null
})

watch([
  displayedAlgorithmId,
  () => displayedAlgorithmSelection.value?.algorithmName,
  () => displayedAlgorithmSelection.value?.algorithmType,
  () => displayedAlgorithmSelection.value?.purpose,
  () => displayedAlgorithmSelection.value?.strategyKind,
  () => displayedAlgorithmSelection.value?.capabilities,
], ([algorithmId, snapshotName, snapshotType, snapshotPurpose, snapshotStrategyKind, snapshotCapabilities]) => {
  if (
    algorithmId
    && (
      !snapshotName?.trim()
      || !snapshotType?.trim()
      || !snapshotPurpose?.trim()
      || !snapshotStrategyKind?.trim()
      || (snapshotCapabilities === null && snapshotPurpose !== 'Identity')
    )
  ) {
    void ensureAlgorithmsLoaded()
  }
}, { immediate: true })

watch([
  displayedAlgorithmId,
  algorithmCatalogProfile,
  () => displayedAlgorithmSelection.value?.strategyKind,
  () => displayedAlgorithmSelection.value?.algorithmType,
  () => displayedAlgorithmSelection.value?.purpose,
  () => displayedAlgorithmSelection.value?.capabilities,
], ([algorithmId, profile, snapshotStrategyKind, snapshotType, snapshotPurpose, snapshotCapabilities]) => {
  const type = snapshotType?.trim() || profile?.algorithmType
  const purpose = snapshotPurpose?.trim() || profile?.purpose
  if (
    algorithmId
    && type
    && purpose
    && (
      !snapshotStrategyKind?.trim()
      || (snapshotCapabilities === null && purpose !== 'Identity')
    )
  ) {
    void ensureStrategyDirectoryLoaded()
  }
}, { immediate: true })
const latestProjectedStageId = computed(() => {
  const facts = executionDisplayProjection.value.facts.stages
  for (let index = facts.length - 1; index >= 0; index -= 1) {
    if (facts[index].status !== 'unknown') return facts[index].stageId
  }
  return null
})
const sequenceStageId = computed(() =>
  presentation.value.followLatest
    ? (
      activeMotionCue.value?.stageId
      ?? executionDisplayProjection.value.focus.stageId
      ?? stageProjection.value.latestObservedStageId
      ?? latestProjectedStageId.value
    )
    : presentation.value.selectedStageId,
)
const currentStage = computed(() =>
  stageProjection.value.stages.find(stage => stage.id === sequenceStageId.value) ?? null,
)

function stageEvidenceLabel(stage: NonNullable<typeof currentStage.value>): string {
  const latest = stage.evidence[stage.evidence.length - 1]
  if (!latest) {
    const source = executionDisplayProjection.value.facts.stages.find(fact => fact.stageId === stage.id)?.source
    if (source === 'summary') return t('execution.stageDetails.sources.traceSummary')
    if (source === 'part') return t('execution.stageDetails.sources.partSnapshot')
    if (source === 'task') return t('execution.stageDetails.sources.taskResult')
    return t('execution.stages.notObserved')
  }
  if (latest.source.quality === 'observed') return t('execution.sourceQuality.observed')
  if (latest.source.quality === 'reconstructed') return t('execution.stages.reconstructed')
  return t('execution.stages.qualityUnknown')
}

const displayStageFactById = computed(() =>
  new Map(executionDisplayProjection.value.facts.stages.map(fact => [fact.stageId, fact])),
)

function displayStatusForStage(stageId: string): string {
  return displayStageFactById.value.get(stageId)?.status ?? 'unknown'
}

function displayStatusLabel(status: string): string {
  if (status === 'active') return t('execution.rail.statusActive')
  if (status === 'completed') return t('execution.rail.statusCompleted')
  if (status === 'failed') return t('execution.rail.statusFailed')
  if (status === 'snapshot') return t('execution.stages.snapshotAvailable')
  if (status === 'observed') return t('execution.stages.observed')
  if (status === 'unknown') return t('execution.notAvailable')
  return t('execution.stages.notObserved')
}

const currentStageObservations = computed(() => {
  const stage = currentStage.value
  if (!stage) return visibleObservations.value
  const evidenceIds = new Set(stage.evidence.map(evidence => evidence.observationId))
  return visibleObservations.value.filter(observation => evidenceIds.has(observation.observationId))
})

const stageUserReferences = computed(() => projectStageUserReferences({
  activeJobId: jobId.value ?? '',
  kind: kind.value,
  stageId: currentStage.value?.id ?? null,
  mode: isHistoricalReplay.value ? 'replay' : 'live',
  observations: currentStageObservations.value,
  summary: summary.value ?? null,
  jobSnapshot: sharedJob.value,
  jobDetail: jobDetail.value ?? null,
  tasks: tasks.value,
  userNamesById: usersById.value,
}))

watch(stageUserReferences, projection => {
  if (projection.users.some(user => user.userName === null)) void ensureUsersLoaded()
}, { immediate: true })

const identityRootHashDetails = computed(() => projectIdentityRootHashDetails({
  activeJobId: jobId.value ?? '',
  kind: kind.value,
  stageId: currentStage.value?.id ?? null,
  mode: isHistoricalReplay.value ? 'replay' : 'live',
  observations: currentStageObservations.value,
  summary: summary.value ?? null,
  jobDetail: jobDetail.value ?? null,
}))

const currentStageMetricRows = computed(() => {
  const latestByKey = new Map<string, {
    key: string
    label: string
    value: string
    recordedAtMs: number
    eventLabel: string
    sourceLabel: string
  }>()
  for (const observation of currentStageObservations.value) {
    for (const [key, value] of Object.entries(observation.metrics)) {
      if (typeof value !== 'string' || value === '') continue
      const metric = projectExecutionMetricSummary(
        kind.value,
        observation.eventType,
        key as TraceObservationMetricKey,
        value,
      )
      if (!metric || metric.kind === 'verifiedCount') continue
      const eventLabel = businessEventLabel(observation)
      const sourceLabel = observationSourceLabel(observation)
      if (metric.kind === 'rootHashPresence') {
        latestByKey.set(key, {
          key,
          label: t('execution.businessMetrics.rootHashPresence'),
          value: t(metric.present ? 'execution.businessMetrics.present' : 'execution.businessMetrics.notPresent'),
          recordedAtMs: observation.recordedAtMs,
          eventLabel,
          sourceLabel,
        })
        continue
      }
      const labelKey = key === 'ownerCount' && kind.value === 'identityVerification'
        ? 'execution.activityMetrics.identityDataOwnerCount'
        : `execution.activityMetrics.${key}`
      const translated = t(labelKey)
      latestByKey.set(key, {
        key,
        label: translated === labelKey ? key : translated,
        value: metric.value,
        recordedAtMs: observation.recordedAtMs,
        eventLabel,
        sourceLabel,
      })
    }
  }
  return [...latestByKey.values()]
    .sort((left, right) => right.recordedAtMs - left.recordedAtMs || left.key.localeCompare(right.key))
})

const currentStageEmptyText = computed(() => {
  if (
    currentStage.value?.id === 'algorithmSelection'
    && algorithmSelectionSnapshot.value
  ) {
    return t('execution.algorithmSelection.summaryStageNote')
  }
  const progress = summary.value?.progress
  const hasTagSnapshotProgress = progress !== undefined && [
    progress.plannedPartCount,
    progress.completedPartCount,
    progress.plannedBlockCount,
    progress.generatedBlockCount,
    progress.storageAccountedTagCount,
    progress.persistedCount,
    progress.duplicateCount,
    progress.replacedCount,
  ].some(value => value !== null)
  if (
    kind.value === 'tagGeneration'
    && (currentStage.value?.id === 'generation' || currentStage.value?.id === 'storage')
    && currentStageObservations.value.length === 0
    && (parts.value.length > 0 || hasTagSnapshotProgress)
  ) {
    return t('execution.stageDetails.metricsUnavailable')
  }
  if (currentStageObservations.value.some(observation => Object.keys(observation.metrics).length > 0)) {
    return t('execution.stageData.metricsInEvidence')
  }
  return currentStageObservations.value.length
    ? t('execution.stageData.noMetrics')
    : t('execution.stageData.noEvidence')
})


function businessEventLabel(observation: (typeof visibleObservations.value)[number]): string {
  const key = `execution.activities.${observation.eventType}`
  const translated = t(key)
  const base = translated === key ? observation.eventType : translated
  const scope: string[] = []
  if (observation.refs.partIndex !== null) {
    scope.push(`${t('execution.tagGeneration.part')} ${observation.refs.partIndex}`)
  }
  if (observation.refs.windowIndex !== null) {
    scope.push(`${t('execution.tagGeneration.window')} ${observation.refs.windowIndex}`)
  }
  return scope.length ? `${base} · ${scope.join(' / ')}` : base
}

function observationSourceLabel(observation: (typeof visibleObservations.value)[number]): string {
  const component = observation.source.component ?? t('execution.notAvailable')
  const node = observation.source.nodeId
  return node ? `${component} · ${node}` : component
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
const visibleCommunicationEvidence = computed(() => {
  const links = state.links.data ?? []
  const protocolEvents = state.protocol.data ?? []
  return isHistoricalReplay.value
    ? restrictCommunicationEvidenceToReplayPrefix(
      jobId.value ?? '',
      visibleObservations.value,
      links,
      protocolEvents,
    )
    : { links, protocolEvents }
})
const identityTaskRelations = computed(() => kind.value === 'identityVerification'
  ? projectIdentityTaskRelations(jobId.value ?? '', stageProjection.value.stages, state.links.data ?? [])
  : { dispatchLink: null, settlementLink: null })
const communicationObservations = computed(() => {
  if (kind.value !== 'identityVerification') return visibleObservations.value
  const validObservationIds = new Set(
    stageProjection.value.stages.flatMap(stage => stage.evidence.map(evidence => evidence.observationId)),
  )
  return visibleObservations.value.filter(observation => validObservationIds.has(observation.observationId))
})
const communicationProjection = computed(() => projectExecutionCommunication({
  activeJobId: jobId.value ?? '',
  links: visibleCommunicationEvidence.value.links,
  observations: communicationObservations.value,
  protocolEvents: visibleCommunicationEvidence.value.protocolEvents,
}))
const communicationActivities = computed(() =>
  executionCommunicationActivities(communicationProjection.value),
)
/**
 * Edge motion loops while the Job is still executing and the user stays on a
 * stage. Completed Jobs never loop; the motion marks the inspected stage, not
 * a new fact or a measured duration.
 */
const loopingActivityIds = computed<string[]>(() => {
  if (isHistoricalReplay.value || jobStatus.value !== 'Running') return []
  const stageIds = new Set(
    executionDisplayProjection.value.facts.stages
      .filter(fact => fact.status === 'active')
      .map(fact => fact.stageId),
  )
  if (stageIds.size === 0) return []
  const ids = new Set<string>()
  for (const stage of stageProjection.value.stages) {
    if (!stageIds.has(stage.id)) continue
    for (const packet of communicationProjection.value.confirmedPackets) {
      if (matchDispatchPacketStage([stage], packet) === stage.id) ids.add(packet.activityId)
    }
    for (const peer of communicationProjection.value.peerCorrelations) {
      if (peer.direction && peerEventMatchesStage(stage.id, peer.direction.eventType)) {
        ids.add(peer.activityId)
      }
    }
    for (const local of communicationProjection.value.localStages) {
      if (stage.evidence.some(evidence => evidence.observationId === local.observationId)) {
        ids.add(local.activityId)
      }
    }
  }
  return [...ids]
})
const executionDisplayProjection = computed(() => {
  const projection = projectExecutionDisplay({
    activeJobId: jobId.value ?? '',
    kind: kind.value,
    stages: stageProjection.value.stages,
    observations: visibleObservations.value,
    summary: summary.value ?? null,
    storageNodeId: storageNodeId.value,
    parts: parts.value,
    tasks: tasks.value,
    communication: communicationProjection.value,
    mode: isHistoricalReplay.value ? 'replay' : 'live',
  })
  const cue = presentation.value.followLatest ? activeMotionCue.value : null
  if (!cue?.stageId) return projection
  return {
    ...projection,
    focus: {
      stageId: cue.stageId,
      observationId: cue.observationId,
      partIndex: cue.partIndex,
      windowIndex: cue.windowIndex,
      source: cue.kind === 'failure' ? 'failure' as const : 'observation' as const,
    },
  }
})

let motionCueTimer: number | null = null

function stopMotionCueTimer(): void {
  if (motionCueTimer !== null) window.clearTimeout(motionCueTimer)
  motionCueTimer = null
}

function resetMotionCueState(): void {
  stopMotionCueTimer()
  motionCueQueue.value = createMotionCueQueue()
  activeMotionCue.value = null
  animationActivityId.value = null
  liveActivityId.value = null
}

function scheduleActiveMotionCueEnd(): void {
  if (
    !activeMotionCue.value
    || motionCueTimer !== null
    || document.visibilityState === 'hidden'
  ) return
  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  motionCueTimer = window.setTimeout(() => {
    motionCueTimer = null
    activeMotionCue.value = null
    animationActivityId.value = null
    if (presentation.value.followLatest) presentNextMotionCue()
  }, reducedMotion ? 240 : 1_400)
}

function presentNextMotionCue(): void {
  if (!presentation.value.followLatest || document.visibilityState === 'hidden') return
  if (activeMotionCue.value) {
    animationActivityId.value = activeMotionCue.value.activityId
    liveActivityId.value = activeMotionCue.value.activityId
    scheduleActiveMotionCueEnd()
    return
  }
  const next = takeNextMotionCue(motionCueQueue.value)
  motionCueQueue.value = next.queue
  if (!next.cue) {
    animationActivityId.value = null
    liveActivityId.value = null
    return
  }
  activeMotionCue.value = next.cue
  animationActivityId.value = next.cue.activityId
  liveActivityId.value = next.cue.activityId
  scheduleActiveMotionCueEnd()
}

function handlePageVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    replay.pause()
    stopMotionCueTimer()
    animationActivityId.value = null
    return
  }
  presentNextMotionCue()
}
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
      resetMotionCueState()
      selectedActivityId.value = null
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

    const incoming: string[] = []
    for (const observation of currentItems) {
      if (seenObservationIds.has(observation.observationId)) continue
      seenObservationIds.add(observation.observationId)
      incoming.push(observation.observationId)
    }
    if (!presentation.value.followLatest) return
    if (incoming.length === 0) {
      if (!activeMotionCue.value) {
        const latest = currentItems[currentItems.length - 1]
        liveActivityId.value = activityForObservation(latest?.observationId ?? null)?.activityId ?? null
      }
      return
    }

    const incomingIds = new Set(incoming)
    const cues = executionDisplayProjection.value.cues.filter(cue => incomingIds.has(cue.observationId))
    motionCueQueue.value = enqueueMotionCues(motionCueQueue.value, cues)
    presentNextMotionCue()
  },
  { flush: 'post' },
)

onMounted(() => document.addEventListener('visibilitychange', handlePageVisibilityChange))
onUnmounted(() => {
  stopMotionCueTimer()
  document.removeEventListener('visibilitychange', handlePageVisibilityChange)
})

const topologySelectedActivityId = computed(() => {
  if (presentation.value.followLatest) return liveActivityId.value
  if (presentation.value.isPlaying) {
    return activityForObservation(selectedObservationId.value)?.activityId ?? null
  }
  return selectedActivityId.value
})

const verified = computed(() => {
  if (isHistoricalReplay.value) return null
  const traceValue = projectExecutionVerdict({
    activeJobId: jobId.value ?? '',
    mode: 'live',
    summary: summary.value ?? null,
  })
  if (traceValue !== null) return traceValue
  if (kind.value === 'identityVerification') return null
  const metadataValue = jobDetail.value?.metadata?.verified
  if (metadataValue === true || metadataValue === false) return metadataValue
  if (metadataValue === 'true') return true
  if (metadataValue === 'false') return false
  return null
})
const verificationStatusText = computed(() => {
  if (verified.value === true) return t('execution.confidence.verifiedTrue')
  if (verified.value === false) return t('execution.confidence.verifiedFalse')
  return t('execution.confidence.verifiedUnknown')
})
const verificationStatusClass = computed(() =>
  verified.value === true ? 'is-success'
    : verified.value === false ? 'is-failure'
      : 'is-unknown',
)

watch(jobId, (nextId, previousId) => {
  if (nextId === previousId) return
  replay.pause()
  presentation.value = createExecutionViewState()
  selectedActivityId.value = null
  selectedTask.value = null
  resetMotionCueState()
  observationsHydrated = false
  seenObservationIds.clear()
}, { flush: 'sync' })
watch(() => presentation.value.replayObservationId, (observationId) => {
  const current = presentation.value
  if (!observationId || current.followLatest) return
  const selectedStageId = stageIdForObservation(observationId)
  if (
    current.selectedObservationId === observationId
    && current.selectedStageId === selectedStageId
  ) return
  presentation.value = {
    ...current,
    selectedObservationId: observationId,
    selectedStageId,
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

const hasVisibleReplayPrefix = computed(() =>
  !isHistoricalReplay.value || visibleObservations.value.length > 0,
)
const observationCountLabel = computed(() =>
  state.observations.loaded && hasVisibleReplayPrefix.value
    ? String(visibleObservations.value.length)
    : t('execution.notAvailable'),
)
const confirmedPacketCountLabel = computed(() =>
  state.observations.loaded
    && state.links.loaded
    && state.protocol.loaded
    && hasVisibleReplayPrefix.value
    ? String(communicationProjection.value.confirmedPackets.length)
    : t('execution.notAvailable'),
)
const peerCorrelationCountLabel = computed(() =>
  state.observations.loaded && state.links.loaded && hasVisibleReplayPrefix.value
    ? String(communicationProjection.value.peerCorrelations.length)
    : t('execution.notAvailable'),
)
const hasCoverageDetails = computed(() => {
  const coverage = summary.value?.coverage
  return Boolean(
    coverage && (
      coverage.job !== null
      || coverage.tasks !== null
      || coverage.parts !== null
      || coverage.protocol !== null
      || coverage.workerStages !== null
      || coverage.reasons.length > 0
    ),
  )
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



function activityForObservation(observationId: string | null): ExecutionCommunicationActivity | null {
  const observation = visibleObservations.value.find(item => item.observationId === observationId)
  return executionCommunicationActivityForObservation(observation, communicationActivities.value)
}

function setExecutionView(mode: 'sequence' | 'topology') {
  presentation.value = setExecutionViewMode(presentation.value, mode)
}

function handleSelectTopologyActivity(activityId: string | null) {
  if (!activityId) {
    selectedActivityId.value = null
    resetMotionCueState()
    return
  }
  const activity = communicationActivities.value.find(item => item.activityId === activityId)
  if (!activity) return

  replay.pause()
  resetMotionCueState()
  presentation.value = selectExecutionStage(presentation.value, presentation.value.selectedStageId)

  if (activity.kind === 'localStage') {
    selectObservationState(activity.observationId, stageIdForObservation(activity.observationId))
  } else if (activity.kind === 'peerCorrelation') {
    if (activity.direction) {
      selectObservationState(
        activity.direction.observationId,
        stageIdForObservation(activity.direction.observationId),
      )
    }
  } else {
    const dispatchStageId = matchDispatchPacketStage(stageProjection.value.stages, activity)
    const dispatchStage = dispatchStageId === null
      ? null
      : stageProjection.value.stages.find(stage => stage.id === dispatchStageId) ?? null
    const dispatchEvidence = dispatchStage
      ? matchingDispatchPacketEvidence(dispatchStage, activity)
      : null
    if (dispatchStage && dispatchEvidence) {
      selectObservationState(dispatchEvidence.observationId, dispatchStage.id)
    }
  }

  // The selected activity owns the animation even when no observation carries
  // the packet identity; nested selection must not clear it.
  selectedActivityId.value = activityId
  animationActivityId.value = activityId
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
  resetMotionCueState()
  selectedActivityId.value = null
  presentation.value = selectExecutionStage(presentation.value, stageId)
}

function selectObservationState(observationId: string, stageId: string | null): void {
  replay.pause()
  resetMotionCueState()
  presentation.value = selectExecutionObservation(presentation.value, observationId, stageId)
}

function handleSelectObservation(observationId: string, stageId: string | null) {
  selectObservationState(observationId, stageId)
  selectedActivityId.value = activityForObservation(observationId)?.activityId ?? null
  animationActivityId.value = selectedActivityId.value
}

function handleFollowLatest() {
  resetMotionCueState()
  replay.followLatest()
}

function handleManualExplore() {
  replay.pause()
  resetMotionCueState()
  presentation.value = selectExecutionStage(presentation.value, presentation.value.selectedStageId)
}

function handleReplayPointer(observationId: string | null) {
  replay.seek(observationId)
  resetMotionCueState()
  if (observationId) {
    handleSelectObservation(observationId, stageIdForObservation(observationId))
  }
}

function handleReplayStart() {
  resetMotionCueState()
  replay.play()
}

function handleReplayPause() {
  replay.pause()
}

function handleReplayStep(delta: -1 | 1) {
  resetMotionCueState()
  replay.step(delta)
  const observationId = presentation.value.replayObservationId
  if (observationId) {
    handleSelectObservation(observationId, stageIdForObservation(observationId))
  }
}

function handleReplaySpeed(speed: number) {
  replay.changeSpeed(speed)
}
function handleReplayTempo(tempo: PlaybackTempo) {
  replay.changeTempo(tempo)
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


.eyebrow {
  color: var(--apple-gray-3);
  font-size: 12px;
}


.execution-actions {
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.execution-action-group {
  box-sizing: border-box;
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--apple-gray-1) 4%, var(--apple-bg));
}

.execution-action-group__label {
  flex: 0 0 auto;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

.execution-action-group__buttons {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
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
  max-height: min(48vh, 480px);
  flex-direction: column;
  margin: 0;
  padding: 0 4px 0 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
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


.execution-header .execution-actions {
  grid-area: actions;
  align-self: start;
  justify-content: flex-end;
}


.execution-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px 20px;
  margin: 0;
  padding: 11px 14px;
  background: color-mix(in srgb, var(--apple-gray-1) 4%, var(--apple-card));
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.execution-metric {
  min-width: 0;
}

.execution-metric dt,
.coverage-grid dt {
  margin-bottom: 3px;
  color: var(--apple-gray-3);
  font-size: 10px;
  letter-spacing: 0.02em;
}

.execution-metric dd,
.coverage-grid dd {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.execution-metric dd {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}


.algorithm-bar {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--apple-gray-1) 4%, var(--apple-card));
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.algorithm-bar-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px 16px;
  flex-wrap: wrap;
}

.algorithm-kicker {
  color: var(--apple-gray-3);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.03em;
}


.algorithm-bar-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 18px;
  flex-wrap: wrap;
}

.algorithm-name-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 10px;
  min-width: 0;
}

.algorithm-name {
  color: var(--apple-gray-1);
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}

.algorithm-chip {
  padding: 1px 7px;
  color: var(--apple-blue);
  font-size: 10px;
  font-weight: 600;
  border: 1px solid color-mix(in srgb, var(--apple-blue) 45%, var(--apple-border));
  border-radius: 999px;
}

.algorithm-purpose,
.algorithm-quality {
  color: var(--apple-gray-3);
  font-size: 11px;
}

.algorithm-quality::before {
  content: '·';
  margin-right: 6px;
  color: var(--apple-gray-5);
}

.algorithm-id {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  padding: 3px 8px;
  color: var(--apple-gray-2);
  font: inherit;
  font-size: 10px;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: 6px;
  cursor: pointer;
}

.algorithm-id code {
  overflow: hidden;
  font-family: var(--apple-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.algorithm-id-action {
  flex: none;
  color: var(--apple-blue);
}

.algorithm-id:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.algorithm-meta {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 0;
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.5;
}

.algorithm-meta > span + span::before {
  content: '·';
  margin: 0 7px;
  color: var(--apple-gray-5);
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

.canvas-shell,
.stage-sidebar {
  min-width: 0;
  padding: 14px;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
}

.execution-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 380px);
  align-items: start;
  gap: 14px;
  min-width: 0;
}


.canvas-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--apple-border);
}

.canvas-heading__title {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.canvas-heading h2 {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 15px;
  font-weight: 600;
}
.canvas-heading__title :deep(.n-tag) {
  flex: none;
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
.motion-cue-aggregate {
  margin: 0 0 10px;
  color: var(--apple-gray-3);
  font-size: 10px;
}
.execution-replay-note {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.45;
}


.canvas-updated {
  color: var(--apple-gray-3);
  white-space: nowrap;
}

.stage-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.current-stage {
  min-width: 0;
  padding: 12px;
  background: color-mix(in srgb, var(--apple-gray-1) 4%, var(--apple-card));
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
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
  margin: 6px 0 0;
  color: var(--apple-gray-1);
  font-size: 19px;
  line-height: 1.3;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.current-stage > p {
  margin: 5px 0 0;
  font-size: 12px;
}

.current-stage-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
  color: var(--apple-gray-3);
  font-size: 10px;
}

.current-stage-meta > span {
  padding: 2px 8px;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: 999px;
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

  .canvas-shell,
  .stage-sidebar {
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

/* ── Job header: one hierarchy, no KPI card wall ── */
.execution-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "heading actions"
    "context context";
  align-items: start;
  gap: 12px 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--apple-border);
}

.execution-heading {
  grid-area: heading;
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.execution-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
}

.execution-title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 26px;
  font-weight: 680;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.execution-context {
  grid-area: context;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.execution-context-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 8px;
  min-width: 0;
}

.execution-context-group {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--apple-gray-1) 3%, var(--apple-bg));
}

.execution-context-group > h2 {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  font-weight: 600;
}
.execution-context-group--job code {
  overflow-wrap: anywhere;
  color: var(--apple-gray-1);
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

.execution-meta-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr));
  gap: 8px 12px;
  margin: 0;
}

.execution-meta-facts > div { min-width: 0; }
.execution-meta-facts dt { color: var(--apple-gray-4); font-size: 10px; }
.execution-meta-facts dd { margin: 2px 0 0; overflow-wrap: anywhere; color: var(--apple-gray-2); font-size: 12px; }
.execution-context-group--tasks dd { font-variant-numeric: tabular-nums; font-weight: 600; }
.execution-context-note {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 10px;
  line-height: 1.45;
}

.execution-coverage-primary {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--apple-blue) 16%, var(--apple-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--apple-blue) 4%, var(--apple-card));
}

.execution-coverage-primary > span,
.execution-coverage-item > span {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--apple-gray-2);
  font-size: 11px;
}

.execution-coverage-primary > span { font-weight: 600; }

.execution-coverage-secondary {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.execution-coverage-item {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  padding: 4px 7px;
  border: 1px solid var(--apple-border);
  border-radius: 7px;
  background: var(--apple-card);
}

.execution-coverage-item :deep(.n-tag) { flex: none; font-size: 10px; }

.execution-coverage-empty {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 11px;
}

.execution-coverage-reasons { margin-top: 2px; }

.execution-coverage-reasons > summary {
  color: var(--apple-gray-4);
  font-size: 10px;
  cursor: pointer;
  list-style: none;
}

.execution-coverage-reasons > summary::-webkit-details-marker { display: none; }
.execution-coverage-reasons > summary::after { content: '⌄'; margin-left: 6px; }
.execution-coverage-reasons[open] > summary::after { content: '⌃'; }
.execution-coverage-reasons ul {
  margin: 6px 0 0;
  padding-left: 16px;
  color: var(--apple-gray-3);
  font-size: 10px;
}


.execution-scope {
  max-width: 76ch;
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 10px;
  line-height: 1.55;
}

.execution-stage-summary {
  min-width: 0;
}

.execution-stage-summary__title {
  margin: 0 0 4px;
  color: var(--apple-gray-1);
  font-size: 15px;
  font-weight: 600;
}

/* ── Canvas + flat rail ── */
.execution-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 16px;
  align-items: start;
}
.execution-left-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
}
.canvas-shell {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.stage-sidebar {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
}


 .current-stage {
  --stage-accent: var(--apple-gray-4);
  min-width: 0;
  padding: 12px 13px;
  background: color-mix(in srgb, var(--stage-accent) 4%, var(--apple-card));
  border: 1px solid var(--apple-border);
  border-left: 3px solid var(--stage-accent);
  border-radius: var(--apple-radius-lg);
}

.current-stage.focus-active { --stage-accent: var(--apple-blue); }
.current-stage.focus-completed { --stage-accent: var(--apple-green); }
.current-stage.focus-failed { --stage-accent: var(--apple-red); }
.current-stage.focus-observed { --stage-accent: var(--apple-purple); }
 .current-stage.focus-snapshot { --stage-accent: var(--apple-purple); }
.current-stage-content { min-width: 0; }

.current-stage-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.current-stage h2 {
  margin: 7px 0 0;
  color: var(--apple-gray-1);
  font-size: 21px;
  font-weight: 680;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.current-stage-meta {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 0;
  margin-top: 8px;
  color: var(--apple-gray-3);
  font-size: 10px;
}

.current-stage-meta > span + span {
  margin-left: 9px;
  padding-left: 9px;
  border-left: 1px solid var(--apple-border);
}

.current-stage-state { color: var(--stage-accent); font-weight: 650; }
.current-stage-failure { color: var(--apple-red); font-size: 10px; font-weight: 650; }

.current-stage-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(82px, 1fr));
  gap: 8px 12px;
  margin: 10px 0 0;
  padding-top: 9px;
  border-top: 1px solid var(--apple-border);
}

.current-stage-metrics > div { min-width: 0; }
.current-stage-metrics dt { color: var(--apple-gray-3); font-size: 9px; line-height: 1.3; }
.current-stage-metrics dd {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  color: var(--apple-gray-1);
  font-size: 17px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.current-stage-empty { margin: 9px 0 0; font-size: 10px; }

.stage-focus-enter-active {
  transition: opacity 220ms var(--apple-ease-out), transform 220ms var(--apple-ease-out);
}

.stage-focus-leave-active {
  transition: opacity 140ms var(--apple-ease-out), transform 140ms var(--apple-ease-out);
}

.stage-focus-enter-from { opacity: 0; transform: translateY(5px); }
.stage-focus-leave-to { opacity: 0; transform: translateY(-3px); }




.execution-evidence {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 8px;
}

@media (max-width: 1180px) {
  .execution-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto;
    height: auto;
  }
  .canvas-shell {
    height: auto;
    overflow: visible;
  }
  .stage-sidebar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 18px;
    height: auto;
    min-height: auto;
    overflow: visible;
  }
  .current-stage-details { flex: none; min-height: auto; overflow: visible; }
  .current-stage,
  .current-stage-details { grid-column: 1 / -1; }
  .stage-sidebar--tag { display: block; }
}
@media (max-width: 1120px) {
  .execution-header {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "heading" "context" "actions";
  }

  .execution-header .execution-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 760px) {
  .execution-header {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "heading" "context" "actions";
    gap: 12px;
  }
  .execution-title { font-size: 21px; }
  .execution-actions { width: 100%; flex-direction: column; align-items: stretch; }
  .execution-action-group { width: 100%; justify-content: space-between; }
  .execution-action-group__label { flex-basis: 76px; }
  .execution-action-group__buttons { flex: 1 1 0; }
  .stage-sidebar { grid-template-columns: minmax(0, 1fr); }
}

@media (prefers-reduced-motion: reduce) {
  .stage-focus-enter-active,
  .stage-focus-leave-active {
    transition-duration: 120ms;
  }
  .stage-focus-enter-from,
  .stage-focus-leave-to {
    transform: none;
  }
}
.execution-overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: var(--apple-space-3);
  min-width: 0;
}

.execution-overview-grid--challengeProof {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.execution-overview-card,
.execution-overview-confidence {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
}

.execution-overview-card {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
}

.execution-overview-confidence :deep(.panel-title) {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.execution-overview-title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.execution-overview-empty {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.45;
}

.execution-overview-status {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.execution-status-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.execution-status-item + .execution-status-item {
  margin-left: 0;
  padding-top: 10px;
  border-top: 1px solid var(--apple-border);
  border-left: 0;
}

.execution-status-label { color: var(--apple-gray-3); font-size: 10px; }
.execution-status-value { color: var(--apple-gray-1); font-size: 13px; font-weight: 650; overflow-wrap: anywhere; }
.execution-status-value.is-success { color: var(--apple-green); }
.execution-status-value.is-failure { color: var(--apple-red); }
.execution-status-value.is-unknown { color: var(--apple-gray-3); }

.execution-algorithm-summary {
  min-width: 0;
}

@media screen and (max-width: 900px) {
  .execution-overview-grid.execution-overview-grid--challengeProof,
  .execution-overview-grid.execution-overview-grid--identityVerification {
    grid-template-columns: minmax(0, 1fr);
    grid-auto-flow: row;
  }

}
</style>
