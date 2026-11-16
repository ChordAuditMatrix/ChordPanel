<template>
  <main class="execution-view">
    <ExecutionViewHeader
      :job-id="jobId"
      :kind="kind"
      :is-historical-replay="isHistoricalReplay"
      :job-status="jobStatus"
      :job-status-tag="jobStatusTag"
      :initial-loading="state.initialLoading"
      :created-at-ms="createdAt"
      :updated-at-ms="updatedAt"
      :summary-placeholder="summaryPlaceholder"
      :task-total-label="taskTotalLabel"
      :observation-count-label="observationCountLabel"
      :confirmed-packet-count-label="confirmedPacketCountLabel"
      :peer-correlation-count-label="peerCorrelationCountLabel"
      :has-coverage-details="hasCoverageDetails"
      :coverage="summary?.coverage ?? null"
      :view-mode="presentation.viewMode"
      :graph-visible="graphVisible"
      :follow-latest="presentation.followLatest"
      :is-playing="presentation.isPlaying"
      :has-observations="observations.length > 0"
      :reloading="reloading"
      :resynchronizing="state.resynchronizing"
      :return-label="returnButtonLabel()"
      @return="handleReturn"
      @set-view="setExecutionView"
      @show-graph="showJobGraph"
      @follow-latest="handleFollowLatest"
      @replay-start="handleReplayStart"
      @replay-pause="handleReplayPause"
      @reload="handleReload"
      @resync="handleResync"
      @report="goToReport"
    />

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
      <n-alert v-else-if="hasResourceError" type="warning" :bordered="false">
        <div class="alert-row">
          <span>{{ t('execution.loadFailed') }}</span>
          <n-button size="tiny" :loading="reloading" @click="handleReload">{{ t('execution.retry') }}</n-button>
        </div>
      </n-alert>
      <p v-if="protocolEvidenceUnavailable && !hasResourceError" class="partial-evidence" role="status">
        {{ t('execution.partialEvidence.protocolUnavailable') }}
      </p>

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
        <p
          v-if="stageProjection.linksIncomplete || !state.protocolPaging.complete"
          class="partial-evidence"
          role="status"
        >
          <span>{{ t('execution.partialEvidence.evidenceIncomplete') }}</span>
          <n-button
            size="tiny"
            quaternary
            :loading="state.links.loading || state.protocol.loading"
            @click="handleLoadMoreEvidence"
          >
            {{ t('execution.partialEvidence.loadMore') }}
          </n-button>
        </p>
      </section>

      <div class="execution-layout">
        <div class="execution-left-column">
        <section v-show="!graphVisible" class="canvas-shell" :aria-label="t('execution.viewMode')">
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

        <section v-show="graphVisible" class="graph-shell" :aria-label="t('execution.graphView')">
          <ExecutionJobGraphPanel
            :graph="state.graph"
            :projection="graphProjection"
            :loaded-at-ms="graphLoadedAtMs"
            :refreshed-at-ms="graphRefreshedAtMs"
            @load="loadJobGraph"
            @more="loadGraphStream"
            @refresh="refreshJobGraph"
            @open-evidence="handleGraphEvidence"
          />
          <ExecutionFlowGraphPanel
            :flow-state="flowIdentity"
            @select="openRelatedJob"
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
            <span v-else class="mono">{{ state.partsPaging.total ?? parts.length }}<template v-if="state.partsPaging.hasMore"> · {{ t('execution.partialEvidence.more') }}</template></span>
            <n-button
              v-if="state.partsPaging.hasMore && !state.parts.error"
              size="tiny"
              quaternary
              :loading="state.parts.loading"
              @click.stop="handleLoadMoreParts"
            >
              {{ t('execution.partialEvidence.loadMore') }}
            </n-button>
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
            :parts-complete="state.partsPaging.complete"
            :parts-total="state.partsPaging.total"
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
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TaskSummary } from '@/api/job'
import { useTraceSession } from '@/features/execution/data/useTraceSession'
import {
  projectExecutionStages,
  projectIdentityTaskRelations,
} from '@/features/execution/data/executionStages'
import { projectExecutionDisplay, projectExecutionVerdict } from '@/features/execution/data/executionDisplayProjection'
import {
  applyMotionCueFocus,
  deriveHistoricalReplay,
  resolveDisplayStatus,
  resolveLatestProjectedStageId,
  resolveProtocolEvidenceUnavailable,
  resolveSelectedObservationId,
  resolveSequenceStageId,
  resolveTopologySelectedActivityId,
  shouldLoopStageMotion,
} from '@/features/execution/data/executionPageGuards'
import {
  hasTagSnapshotProgress,
  projectAlgorithmSelectionPage,
  projectStageMetricFacts,
  projectTopologyRoleNodeIds,
  resolveStageDataEmptyState,
  type StageMetricFact,
} from '@/features/execution/data/executionViewPage'
import { matchDispatchPacketStage, matchingDispatchPacketEvidence, peerEventMatchesStage } from '@/features/execution/data/executionSequence'
import {
  executionCommunicationActivities,
  projectExecutionCommunication,
  restrictCommunicationEvidenceToReplayPrefix,
} from '@/features/execution/data/executionCommunication'
import {
  createExecutionViewState,
  getVisibleReplayObservations,
  selectObservation as selectExecutionObservation,
  selectStage as selectExecutionStage,
  setViewMode as setExecutionViewMode,
  type PlaybackTempo,
} from '@/features/execution/data/executionViewState'
import { projectStageUserReferences, projectIdentityRootHashDetails } from '@/features/execution/data/executionStageDetails'
import { useExecutionAlgorithmCatalog } from '@/features/execution/useExecutionAlgorithmCatalog'
import { useExecutionJobGraph, useGraphDeepLink } from '@/features/execution/useExecutionJobGraph'
import { isGraphViewRequested } from '@/features/execution/data/graphAvailability'
import { useExecutionMotionCues } from '@/features/execution/useExecutionMotionCues'
import { useExecutionReplay } from '@/features/execution/useExecutionReplay'
import ChallengeConfidencePanel from '@/features/execution/components/ChallengeConfidencePanel.vue'
import AlgorithmSelectionBar from '@/features/execution/components/AlgorithmSelectionBar.vue'
import ExecutionSequenceView from '@/features/execution/components/ExecutionSequenceView.vue'
import ExecutionStagePanel from '@/features/execution/components/ExecutionStagePanel.vue'
import ExecutionTopologyView from '@/features/execution/components/ExecutionTopologyView.vue'
import ExecutionStageDetailsPanel from '@/features/execution/components/ExecutionStageDetailsPanel.vue'
import ExecutionViewHeader from '@/features/execution/components/ExecutionViewHeader.vue'
import ExecutionJobGraphPanel from '@/features/execution/components/ExecutionJobGraphPanel.vue'
import ExecutionFlowGraphPanel from '@/features/execution/components/ExecutionFlowGraphPanel.vue'
import IdentityTaskRelationDetails from '@/features/execution/components/IdentityTaskRelationDetails.vue'
import TagGenerationCanvas from '@/features/execution/components/TagGenerationCanvas.vue'
import TagPartMatrix from '@/features/execution/components/TagPartMatrix.vue'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import ExecutionStageRail from '@/features/execution/components/ExecutionStageRail.vue'
import { useI18n } from '@/stores/i18n'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { formatDateTime } from '@/utils/datetime'
import { jobStatusTagType } from '@/utils/jobStatus'
import { executionRoute } from '@/utils/jobRoutes'
import { jobStatusLabel, taskStatusLabel } from '@/utils/statusLabels'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { usersById, ensureUsersLoaded } = useReferenceCatalog()


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

/**
 * Trace resources refresh in the background. Their failures stay visible in the
 * page's inline alerts and retry paths; they must not open the app-wide error
 * modal and block a view whose recorded evidence is still readable.
 */
const session = useTraceSession(jobId, { pollingProfile: 'adaptive', silent: true })
const { state, tasks, taskPage, jobDetail, jobDetailFailed } = session
const selectedTask = ref<TaskSummary | null>(null)

/** Trace facts come from the session summary; the shared Job snapshot stays authoritative for status. */
const summary = computed(() => state.summary.data)
const observations = computed(() => state.observations.data ?? [])
const parts = computed(() => state.parts.data ?? [])

/**
 * Graph views are an explicit, on-demand entry: no graph page is read until the
 * user opens this view, and the flow identity comes from the Job's own durable
 * `flowId` rather than a hand-written value.
 */
const {
  graphVisible,
  graphProjection,
  flowIdentity,
  graphLoadedAtMs,
  graphRefreshedAtMs,
  loadJobGraph,
  showJobGraph,
  loadGraphStream,
  refreshJobGraph,
  openRelatedJob,
  resetJobGraph,
} = useExecutionJobGraph({
  jobId,
  jobDetail,
  jobDetailLoading: session.jobDetailLoading,
  jobDetailFailed,
  graph: state.graph,
  session: {
    loadGraphFirstPage: session.loadGraphFirstPage,
    loadGraphMore: session.loadGraphMore,
    refreshGraph: session.refreshGraph,
  },
  openRelatedJob: relatedJobId => void router.push(executionRoute(relatedJobId)),
})

function handleGraphEvidence(target: string, key: string): void {
  if (target !== 'task') return
  const node = graphProjection.value.nodes.find(candidate =>
    candidate.kind === 'task' && `task:${candidate.task.referenceIndex}` === key)
  if (!node || node.kind !== 'task' || !node.task.taskId) return
  const task = tasks.value.find(candidate => candidate.taskId === node.task.taskId)
  if (task) openTaskDetail(task)
}

/**
 * `?graph=1` is the QA demo deep link. It is a page display choice, not a graph
 * request parameter; the fixture server ignores it, and the graph is still read
 * only through its own bounded route.
 */
const graphRequested = computed(() => isGraphViewRequested(route.query))
useGraphDeepLink({ jobId, requested: graphRequested, showGraph: showJobGraph })

function handleLoadMoreParts(): void {
  void session.loadMoreParts()
}

function handleLoadMoreEvidence(): void {
  void session.loadMoreLinks()
  void session.loadMoreProtocol()
}

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
const presentation = ref(createExecutionViewState())
const isHistoricalReplay = computed(() => deriveHistoricalReplay(presentation.value))
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
  linksComplete: state.linksPaging.complete,
}))
const algorithmSelectionPage = computed(() => projectAlgorithmSelectionPage({
  isHistoricalReplay: isHistoricalReplay.value,
  summary: summary.value ?? null,
  observations: visibleObservations.value,
  stages: stageProjection.value.stages,
}))
const algorithmSelectionSnapshot = computed(() => algorithmSelectionPage.value.snapshotSelection)
const displayedAlgorithmSelection = computed(() => algorithmSelectionPage.value.displayedSelection)
const displayedAlgorithmId = computed(() => algorithmSelectionPage.value.displayedAlgorithmId)
const { algorithmCatalogProfile, algorithmCatalogStrategy } = useExecutionAlgorithmCatalog({
  displayedAlgorithmId,
  displayedAlgorithmSelection,
})
const latestProjectedStageId = computed(() =>
  resolveLatestProjectedStageId(executionDisplayProjection.value.facts.stages),
)
const sequenceStageId = computed(() =>
  resolveSequenceStageId({
    followLatest: presentation.value.followLatest,
    selectedStageId: presentation.value.selectedStageId,
    activeCueStageId: activeMotionCue.value?.stageId ?? null,
    focusStageId: executionDisplayProjection.value.focus.stageId,
    latestObservedStageId: stageProjection.value.latestObservedStageId,
    latestProjectedStageId: latestProjectedStageId.value,
  }),
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

function displayStatusForStage(stageId: string): string {
  return resolveDisplayStatus(executionDisplayProjection.value.facts.stages, stageId)
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

const currentStageMetricRows = computed(() =>
  projectStageMetricFacts(kind.value, currentStageObservations.value).map(fact => {
    const eventLabel = businessEventLabel(fact)
    const sourceLabel = observationSourceLabel(fact)
    if (fact.rootHashPresent !== null) {
      return {
        key: fact.key,
        label: t('execution.businessMetrics.rootHashPresence'),
        value: t(fact.rootHashPresent
          ? 'execution.businessMetrics.present'
          : 'execution.businessMetrics.notPresent'),
        recordedAtMs: fact.recordedAtMs,
        eventLabel,
        sourceLabel,
      }
    }
    const labelKey = fact.key === 'ownerCount' && kind.value === 'identityVerification'
      ? 'execution.activityMetrics.identityDataOwnerCount'
      : `execution.activityMetrics.${fact.key}`
    const translated = t(labelKey)
    return {
      key: fact.key,
      label: translated === labelKey ? fact.key : translated,
      value: fact.value ?? '',
      recordedAtMs: fact.recordedAtMs,
      eventLabel,
      sourceLabel,
    }
  }),
)

const currentStageEmptyText = computed(() => {
  const emptyState = resolveStageDataEmptyState({
    kind: kind.value,
    stageId: currentStage.value?.id ?? null,
    observationCount: currentStageObservations.value.length,
    hasMetricValues: currentStageObservations.value.some(
      observation => Object.keys(observation.metrics).length > 0,
    ),
    hasAlgorithmSelectionSnapshot: algorithmSelectionSnapshot.value !== null,
    partCount: state.partsPaging.total ?? parts.value.length,
    hasTagSnapshotProgress: hasTagSnapshotProgress(summary.value?.progress),
  })
  if (emptyState === 'algorithmSelectionSummary') return t('execution.algorithmSelection.summaryStageNote')
  if (emptyState === 'metricsUnavailable') return t('execution.stageDetails.metricsUnavailable')
  if (emptyState === 'metricsInEvidence') return t('execution.stageData.metricsInEvidence')
  if (emptyState === 'noMetrics') return t('execution.stageData.noMetrics')
  return t('execution.stageData.noEvidence')
})


function businessEventLabel(fact: StageMetricFact): string {
  const key = `execution.activities.${fact.eventType}`
  const translated = t(key)
  const base = translated === key ? fact.eventType : translated
  const scope: string[] = []
  if (fact.partIndex !== null) {
    scope.push(`${t('execution.tagGeneration.part')} ${fact.partIndex}`)
  }
  if (fact.windowIndex !== null) {
    scope.push(`${t('execution.tagGeneration.window')} ${fact.windowIndex}`)
  }
  return scope.length ? `${base} · ${scope.join(' / ')}` : base
}

function observationSourceLabel(fact: StageMetricFact): string {
  const component = fact.sourceComponent ?? t('execution.notAvailable')
  const node = fact.sourceNodeId
  return node ? `${component} · ${node}` : component
}

const selectedStageId = computed(() =>
  presentation.value.followLatest ? null : presentation.value.selectedStageId,
)
const selectedObservationId = computed(() => resolveSelectedObservationId({
  followLatest: presentation.value.followLatest,
  isPlaying: presentation.value.isPlaying,
  replayObservationId: presentation.value.replayObservationId,
  selectedObservationId: presentation.value.selectedObservationId,
  latestObservationId: observations.value[observations.value.length - 1]?.observationId ?? null,
}))
const replay = useExecutionReplay(observations, presentation)
const selectedActivityId = ref<string | null>(null)

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
/**
 * A page that loaded successfully can still say its protocol records are
 * unavailable. A later poll failure is shown by the page's resource-error path
 * and must not erase that known coverage; the packet count stays unknown and
 * the page warns that any drawn packet lines may be incomplete.
 */
const protocolEvidenceUnavailable = computed(() => resolveProtocolEvidenceUnavailable({
  loaded: state.protocol.loaded,
  requestError: state.protocol.error,
  summaryCoverage: summary.value?.coverage?.protocol,
  pageCoverage: state.protocolPageCoverage.map(page => page.coverage),
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
  if (!shouldLoopStageMotion(isHistoricalReplay.value, jobStatus.value)) return []
  const stageIds = new Set(
    baseExecutionDisplayProjection.value.facts.stages
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
const baseExecutionDisplayProjection = computed(() => projectExecutionDisplay({
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
}))

const {
  motionCueQueue,
  activeMotionCue,
  animationActivityId,
  liveActivityId,
  activityForObservation,
  resetMotionCueState,
  resetForJobChange,
} = useExecutionMotionCues({
  jobId,
  observations,
  observationsLoaded: computed(() => state.observations.loaded),
  followLatest: computed(() => presentation.value.followLatest),
  cues: computed(() => baseExecutionDisplayProjection.value.cues),
  activities: communicationActivities,
  onHidden: () => replay.pause(),
})

/**
 * A cue borrows the focus only while the page follows live facts. Every stage,
 * metric and source stays owned by the base projection underneath.
 */
const executionDisplayProjection = computed(() =>
  applyMotionCueFocus(
    baseExecutionDisplayProjection.value,
    activeMotionCue.value,
    presentation.value.followLatest,
  ),
)

const topologyNodeIds = computed(() => projectTopologyRoleNodeIds({
  confirmedPackets: communicationProjection.value.confirmedPackets,
  peerCorrelations: communicationProjection.value.peerCorrelations,
  auditNodeId: metadataNodeId('auditNodeId'),
  storageNodeId: metadataNodeId('storageNodeId'),
}))

const topologySelectedActivityId = computed(() => resolveTopologySelectedActivityId({
  followLatest: presentation.value.followLatest,
  isPlaying: presentation.value.isPlaying,
  liveActivityId: liveActivityId.value,
  replayActivityId: activityForObservation(selectedObservationId.value)?.activityId ?? null,
  selectedActivityId: selectedActivityId.value,
}))

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
  resetJobGraph()
  replay.pause()
  presentation.value = createExecutionViewState()
  selectedActivityId.value = null
  selectedTask.value = null
  resetForJobChange()
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
const confirmedPacketCountLabel = computed(() => {
  if (protocolEvidenceUnavailable.value) return t('execution.notAvailable')
  return state.observations.loaded
    && state.links.loaded
    && state.linksPaging.complete
    && state.protocol.loaded
    && state.protocolPaging.complete
    && hasVisibleReplayPrefix.value
    ? String(communicationProjection.value.confirmedPackets.length)
    : t('execution.notAvailable')
})
const peerCorrelationCountLabel = computed(() =>
  state.observations.loaded
    && state.links.loaded
    && state.linksPaging.complete
    && hasVisibleReplayPrefix.value
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

function setExecutionView(mode: 'sequence' | 'topology') {
  graphVisible.value = false
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

.graph-shell {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.graph-shell__note {
  margin: 0;
  padding: 10px 12px;
  border: 1px dashed var(--apple-border);
  border-radius: 8px;
  color: var(--apple-gray-3);
  font-size: 11px;
}

.partial-evidence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 0 0;
  padding: 6px 9px;
  border: 1px dashed color-mix(in srgb, var(--apple-orange, #f0a020) 40%, var(--apple-border));
  border-radius: 7px;
  color: var(--apple-gray-2);
  font-size: 11px;
  line-height: 1.5;
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
