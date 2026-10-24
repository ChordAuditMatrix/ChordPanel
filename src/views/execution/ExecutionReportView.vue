<template>
  <div class="execution-view report-view">
    <header class="report-header">
      <ExecutionBackButton :label="returnButtonLabel()" @activate="goBack" />
      <div class="report-heading">
        <h1 class="report-title">{{ t('execution.reportTitle') }}</h1>
        <p class="report-description">{{ t('execution.reportDescription') }}</p>
        <div class="report-job">
          <span>{{ t('execution.jobIdLabel') }}</span>
          <code>{{ jobId ?? t('execution.notAvailable') }}</code>
        </div>
      </div>
      <div class="execution-actions">
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
          </div>
        </div>
      </div>
    </header>
    <n-alert v-if="!jobId" type="warning" :bordered="false">
      {{ t('execution.notAvailable') }}
    </n-alert>

    <template v-else>
      <section class="report-hero" :aria-label="t('execution.reportTitle')">
        <div class="hero-lead">
          <span v-if="jobStatus" class="hero-status-label">{{ jobStatusLabel(jobStatus, t) }}</span>
          <span v-else class="hero-status-label muted">{{ summaryPlaceholder }}</span>
          <span v-if="kind" class="hero-kind">{{ executionKindLabel(kind, t) }}</span>
          <span v-if="state.initialLoading" class="section-status" role="status">{{ t('execution.loading') }}</span>
        </div>
        <div v-if="kind === 'challengeProof' || kind === 'identityVerification'" class="hero-result">
          <span class="hero-result-label">{{ t('execution.confidence.verified') }}</span>
          <span class="hero-result-value" :class="verifiedToneClass">{{ verifiedText }}</span>
        </div>
      </section>
      <section v-if="kind === 'tagGeneration'" class="panel work-volume" :aria-label="t('execution.reportWorkVolume')">
        <h2 class="panel-title">{{ t('execution.reportWorkVolume') }}</h2>
        <dl class="workload-grid">
          <div v-for="item in tagWorkloadItems" :key="item.key" class="workload">
            <dt>{{ item.label }}</dt>
            <dd class="mono">
              <span v-if="item.value !== null">{{ item.value }}</span>
              <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="panel" aria-labelledby="report-facts-heading">
        <div class="panel-head">
          <h2 id="report-facts-heading" class="panel-title">{{ t('execution.title') }}</h2>
          <span v-if="state.initialLoading" class="section-status" role="status">{{ t('execution.loading') }}</span>
        </div>

        <n-alert v-if="state.summary.error" type="error" :bordered="false" class="section-alert">
          <div class="alert-row">
            <span>{{ t('execution.loadFailed') }}</span>
            <n-button size="tiny" :loading="reloading" @click="handleReload">{{ t('execution.retry') }}</n-button>
          </div>
        </n-alert>

        <dl class="fact-grid">
          <div class="fact">
            <dt>{{ t('execution.jobId') }}</dt>
            <dd class="mono">{{ jobId }}</dd>
          </div>
          <div class="fact">
            <dt>{{ t('execution.kind') }}</dt>
            <dd>
              <span v-if="kind" class="mono">{{ executionKindLabel(kind, t) }}</span>
              <span v-else class="muted">{{ summaryPlaceholder }}</span>
            </dd>
          </div>
          <div class="fact">
            <dt>{{ t('execution.owner') }}</dt>
            <dd>{{ ownerLabel || summaryPlaceholder }}</dd>
          </div>
          <div class="fact">
            <dt>{{ t('execution.createdAt') }}</dt>
            <dd class="nowrap">{{ createdAt !== null ? formatDateTime(createdAt) : summaryPlaceholder }}</dd>
          </div>
          <div class="fact">
            <dt>{{ t('execution.updatedAt') }}</dt>
            <dd class="nowrap">{{ updatedAt !== null ? formatDateTime(updatedAt) : summaryPlaceholder }}</dd>
          </div>
          <div class="fact">
            <dt>{{ t('execution.startedAt') }}</dt>
            <dd class="nowrap">{{ startedAt !== null ? formatDateTime(startedAt) : summaryPlaceholder }}</dd>
          </div>
          <div class="fact">
            <dt>{{ t('execution.endedAt') }}</dt>
            <dd class="nowrap">{{ endedAt !== null ? formatDateTime(endedAt) : summaryPlaceholder }}</dd>
          </div>
          <div class="fact">
            <dt>{{ t('execution.totalDurationMs') }}</dt>
            <dd class="mono">{{ totalDurationMs !== null ? totalDurationMs : summaryPlaceholder }}</dd>
          </div>
          <div v-if="kind === 'maintenance'" class="fact">
            <dt>{{ t('execution.maintenance.recoveryState') }}</dt>
            <dd>{{ maintenanceRecoveryText }}</dd>
          </div>
        </dl>
        <div v-if="reportAlgorithm.selection" class="algorithm-fact">
          <h3 class="panel-title">{{ t('execution.algorithmSelection.title') }}</h3>
          <dl class="fact-grid">
            <div class="fact">
              <dt>{{ t('execution.algorithmSelection.algorithmName') }}</dt>
              <dd>{{ reportAlgorithmName }}</dd>
            </div>
            <div class="fact">
              <dt>{{ t('execution.algorithmSelection.algorithmType') }}</dt>
              <dd>{{ reportAlgorithmType }}</dd>
            </div>
            <div class="fact">
              <dt>{{ t('execution.algorithmSelection.algorithmId') }}</dt>
              <dd class="mono report-algorithm-id">{{ reportAlgorithm.selection.algorithmId }}</dd>
            </div>
            <div class="fact">
              <dt>{{ t('execution.algorithmSelection.purpose') }}</dt>
              <dd>{{ reportAlgorithm.selection.purpose || summaryPlaceholder }}</dd>
            </div>
          </dl>
        </div>

        <h3 class="panel-title record-count-title">{{ t('execution.recordCounts') }}</h3>
        <dl class="workload-grid">
          <div v-for="item in workloadItems" :key="item.key" class="workload">
            <dt>{{ item.label }}</dt>
            <dd class="mono">{{ item.value }}</dd>
          </div>
        </dl>

      </section>

      <section v-if="kind === 'challengeProof'" class="panel confidence-panel" :aria-label="t('execution.confidence.title')">
        <ChallengeConfidencePanel
          :execution-kind="kind"
          :job-metadata="jobDetail?.metadata ?? null"
        />
      </section>

      <section
        v-if="!summary || hasCoverageDetails"
        class="panel"
        aria-labelledby="report-coverage-heading"
      >
        <div class="panel-head">
          <h2 id="report-coverage-heading" class="panel-title">{{ t('execution.coverage') }}</h2>
        </div>

        <p v-if="!summary" class="muted panel-empty">{{ summaryPlaceholder }}</p>
        <ExecutionCoverageSummary
          v-else
          :coverage="summary.coverage"
          :execution-kind="kind"
        />
      </section>

      <section
        v-if="kind === 'challengeProof'"
        class="panel report-path"
        :aria-label="t('execution.reportPath')"
      >
        <div class="panel-head">
          <h2 class="panel-title">{{ t('execution.reportPath') }}</h2>
          <span class="panel-meta">
            {{ t('execution.stages.latestObserved') }}:
            <strong v-if="latestObservedStage">{{ t(latestObservedStage.labelKey) }}</strong>
            <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
          </span>
        </div>
        <ExecutionSequenceView
          :kind="kind"
          :stages="stageProjection.stages"
          :communication="communicationProjection"
          :selected-stage-id="stageProjection.latestObservedStageId"
          :animation-activity-id="null"
          :loading="state.observations.loading && !state.observations.loaded"
          :error="state.observations.error || state.links.error || state.protocol.error ? t('execution.loadFailed') : null"
          :interactive="false"
        />
      </section>

      <section v-else class="panel" aria-labelledby="report-stages-heading">
        <div class="panel-head">
          <h2 id="report-stages-heading" class="panel-title">{{ t('execution.stages.title') }}</h2>
          <div class="panel-meta">
            <span>
              {{ t('execution.stages.latestObserved') }}:
              <strong v-if="latestObservedStage">{{ t(latestObservedStage.labelKey) }}</strong>
              <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
            </span>
            <span v-if="state.observations.loading" class="section-status" role="status">{{ t('execution.loading') }}</span>
          </div>
        </div>

        <p v-if="state.observations.error" class="muted panel-empty">{{ t('execution.loadFailed') }}</p>
        <p v-else-if="!stageProjection.stages.length" class="muted panel-empty">{{ t('execution.stages.empty') }}</p>
        <ol v-else class="stage-list">
          <li v-for="stage in stageProjection.stages" :key="stage.id" class="stage-item">
            <span class="stage-index mono">{{ stage.index + 1 }}</span>
            <span class="stage-label">{{ t(stage.labelKey) }}</span>
            <n-tag size="small" :bordered="false" :type="stageTagType(stage)">
              {{ stageTagLabel(stage) }}
            </n-tag>
            <n-tag v-if="stage.hasFailureEvidence" size="small" :bordered="false" type="error">
              {{ t('execution.stages.failure') }}
            </n-tag>
            <span v-if="stage.evidence.length" class="stage-evidence mono" :title="t('execution.observations')">
              {{ stage.evidence.length }}
            </span>
          </li>
        </ol>
      </section>


      <details class="evidence-group">
        <summary class="evidence-summary">
          <span class="evidence-title">{{ t('execution.tasks') }}</span>
          <span class="evidence-meta">
            <span>{{ t('execution.jobState') }}: <strong>{{ sharedJobState }}</strong></span>
            <span>{{ t('execution.taskSummary') }}: <strong>{{ taskTotalLabel }}</strong></span>
            <span v-if="taskPage?.loading" class="section-status" role="status">{{ t('execution.loading') }}</span>
            <span v-if="taskPage?.error" class="evidence-error">{{ t('execution.loadFailed') }}</span>
          </span>
        </summary>

        <div class="evidence-body">
          <n-alert v-if="jobDetailFailed" type="warning" :bordered="false" class="section-alert">
            {{ t('execution.loadFailed') }}
          </n-alert>

          <n-alert v-if="taskPage?.error" type="error" :bordered="false" class="section-alert">
            <div class="alert-row">
              <span>{{ t('execution.loadFailed') }}</span>
              <n-button size="tiny" @click="handleTaskRetry">{{ t('execution.retry') }}</n-button>
            </div>
          </n-alert>

          <ul v-if="tasks.length" class="task-list">
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
              <span class="task-times">
                <span>{{ t('execution.startedAt') }}: {{ taskTimestamp(task.startedAtMs) }}</span>
                <span>{{ t('execution.endedAt') }}: {{ taskTimestamp(task.completedAtMs) }}</span>
                <span>
                  {{ t('execution.taskDurationMs') }}:
                  {{ taskDurationMs(task) ?? t('execution.notAvailable') }}
                </span>
              </span>
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

      <details class="evidence-group">
        <summary class="evidence-summary">
          <span class="evidence-title">{{ t('execution.observations') }}</span>
          <span class="evidence-meta">
            <span v-if="observationsCount !== null" class="count">{{ observationsCount }}</span>
            <span v-if="state.observations.loading" class="section-status" role="status">{{ t('execution.loading') }}</span>
            <span v-if="state.observations.error" class="evidence-error">{{ t('execution.loadFailed') }}</span>
            <span v-if="state.cursorConsistency" class="section-status">
              {{ t('execution.cursorConsistency') }}:
              {{ t(`execution.cursorConsistencyState.${state.cursorConsistency}`) }}
            </span>
          </span>
        </summary>

        <div class="evidence-body">
          <n-alert v-if="state.observations.error" type="error" :bordered="false" class="section-alert">
            <div class="alert-row">
              <span>{{ t('execution.loadFailed') }}</span>
              <n-button size="tiny" :loading="state.resynchronizing" @click="handleResync">
                {{ t('execution.retry') }}
              </n-button>
            </div>
          </n-alert>

          <div v-else-if="!state.observations.loaded && state.observations.loading" class="state-block" role="status">
            <n-spin size="small" />
            <span>{{ t('execution.loading') }}</span>
          </div>
          <n-empty
            v-else-if="state.observations.loaded && observations.length === 0"
            :description="t('execution.noObservations')"
            size="small"
          />
          <div
            v-else-if="observations.length"
            class="table-scroll"
            tabindex="0"
            role="group"
            :aria-label="t('execution.observations')"
          >
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">{{ t('execution.activities.title') }}</th>
                  <th scope="col">{{ t('execution.eventType') }}</th>
                  <th scope="col">{{ t('execution.source') }}</th>
                  <th scope="col">{{ t('execution.phase') }}</th>
                  <th scope="col">{{ t('execution.recordedAt') }}</th>
                  <th scope="col">{{ t('execution.eventTime') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="observation in visibleObservations" :key="observation.observationId">
                  <td>{{ observationActivityLabel(observation) }}</td>
                  <td class="event-type mono">{{ observation.eventType }}</td>
                  <td>{{ sourceLabel(observation.source) }}</td>
                  <td>
                    <span v-if="observation.phase" class="mono">{{ t(`execution.phases.${observation.phase}`) }}</span>
                    <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
                  </td>
                  <td class="nowrap">{{ formatDateTime(observation.recordedAtMs) }}</td>
                  <td class="nowrap">
                    <span v-if="observation.eventTimeMs !== null">{{ formatDateTime(observation.eventTimeMs) }}</span>
                    <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            v-if="!state.observations.error && observations.length > REPORT_PAGE_SIZE"
            class="pagination"
            role="group"
            :aria-label="t('execution.pagination.navigation')"
          >
            <n-pagination
              :page="observationPage"
              :page-size="REPORT_PAGE_SIZE"
              :item-count="observations.length"
              :page-slot="5"
              @update:page="observationPage = $event"
            />
          </div>
        </div>
      </details>
      <details class="evidence-group">
        <summary class="evidence-summary">
          <span class="evidence-title">{{ t('execution.parts') }}</span>
          <span class="evidence-meta">
            <span v-if="partsCount !== null" class="count">{{ partsCount }}</span>
            <span v-if="state.parts.loading" class="section-status" role="status">{{ t('execution.loading') }}</span>
            <span v-if="state.parts.error" class="evidence-error">{{ t('execution.loadFailed') }}</span>
          </span>
        </summary>

        <div class="evidence-body">
          <template v-if="kind === 'tagGeneration'">
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
              :key="jobId ?? 'no-job'"
              :parts="parts"
              :summary="summary"
              :tasks="tasks"
              :page-coverage="state.partsPageCoverage"
              :window-loading="state.partsWindowLoading"
              :window-errors="state.partsWindowErrors"
              :load-part-windows="session.loadPartWindows"
            />
          </template>
          <template v-else>
            <n-alert v-if="state.parts.error" type="error" :bordered="false" class="section-alert">
              <div class="alert-row">
                <span>{{ t('execution.loadFailed') }}</span>
                <n-button size="tiny" :loading="reloading" @click="handleReload">{{ t('execution.retry') }}</n-button>
              </div>
            </n-alert>

            <div v-else-if="state.parts.loading && !state.parts.loaded" class="state-block" role="status">
              <n-spin size="small" />
              <span>{{ t('execution.loading') }}</span>
            </div>
            <n-empty
              v-else-if="state.parts.loaded && parts.length === 0"
              :description="t('execution.tagGeneration.noParts')"
              size="small"
            />
            <div
              v-else-if="state.parts.loaded"
              class="table-scroll"
              tabindex="0"
              role="group"
              :aria-label="t('execution.parts')"
            >
              <table class="data-table">
                <thead>
                  <tr>
                    <th scope="col">{{ t('execution.tagGeneration.part') }} / {{ t('execution.tagGeneration.attempt') }}</th>
                    <th scope="col">{{ t('execution.status') }}</th>
                    <th scope="col">{{ t('execution.tagGeneration.plannedBlocks') }}</th>
                    <th scope="col">{{ t('execution.tagGeneration.generatedBlocks') }}</th>
                    <th scope="col">{{ t('execution.tagGeneration.storageAccountedTags') }}</th>
                    <th scope="col">{{ t('execution.updatedAt') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="part in visibleParts" :key="`${part.partIndex}:${part.attempt ?? ''}`">
                    <td class="mono nowrap">
                      {{ part.partIndex }}<span v-if="part.attempt !== null" class="muted"> / {{ part.attempt }}</span>
                    </td>
                    <td>
                      <n-tag v-if="part.status" :type="jobStatusTagType(part.status)" size="small" :bordered="false">
                        {{ tracePartStatusLabel(part.status, t) }}
                      </n-tag>
                      <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
                    </td>
                    <td class="mono">{{ part.plannedBlockCount }}</td>
                    <td class="mono">
                      <span v-if="part.generatedBlockCount !== null">{{ part.generatedBlockCount }}</span>
                      <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
                    </td>
                    <td class="mono">
                      <span v-if="part.storageAccountedTagCount !== null">{{ part.storageAccountedTagCount }}</span>
                      <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
                    </td>
                    <td class="nowrap">
                      <span v-if="part.updatedAtMs !== null">{{ formatDateTime(part.updatedAtMs) }}</span>
                      <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              v-if="!state.parts.error && parts.length > REPORT_PAGE_SIZE"
              class="pagination"
              role="group"
              :aria-label="t('execution.pagination.navigation')"
            >
              <n-pagination
                :page="partPage"
                :page-size="REPORT_PAGE_SIZE"
                :item-count="parts.length"
                :page-slot="5"
                @update:page="partPage = $event"
              />
            </div>
          </template>
        </div>
      </details>
      <details class="evidence-group">
        <summary class="evidence-summary">
          <span class="evidence-title">{{ t('execution.links') }}</span>
          <span class="evidence-meta">
            <span v-if="linksCount !== null" class="count">{{ linksCount }}</span>
            <span v-if="state.links.loading" class="section-status" role="status">{{ t('execution.loading') }}</span>
            <span v-if="state.links.error" class="evidence-error">{{ t('execution.loadFailed') }}</span>
          </span>
        </summary>

        <div class="evidence-body">
          <n-alert v-if="state.links.error" type="error" :bordered="false" class="section-alert">
            <div class="alert-row">
              <span>{{ t('execution.loadFailed') }}</span>
              <n-button size="tiny" :loading="reloading" @click="handleReload">{{ t('execution.retry') }}</n-button>
            </div>
          </n-alert>

          <div v-else-if="state.links.loading && !state.links.loaded" class="state-block" role="status">
            <n-spin size="small" />
            <span>{{ t('execution.loading') }}</span>
          </div>
          <div
            v-else-if="state.links.loaded"
            class="table-scroll"
            tabindex="0"
            role="group"
            :aria-label="t('execution.links')"
          >
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">{{ t('execution.linkFields.linkKey') }}</th>
                  <th scope="col">{{ t('execution.linkFields.linkKind') }}</th>
                  <th scope="col">{{ t('execution.linkFields.matchBasis') }}</th>
                  <th scope="col">{{ t('execution.linkFields.confidence') }}</th>
                  <th scope="col">{{ t('execution.linkFields.sourceQuality') }}</th>
                  <th scope="col">{{ t('execution.linkFields.taskId') }}</th>
                  <th scope="col">{{ t('execution.linkFields.nodeId') }}</th>
                  <th scope="col">{{ t('execution.linkFields.originNodeId') }}</th>
                  <th scope="col">{{ t('execution.linkFields.requestId') }}</th>
                  <th scope="col">{{ t('execution.linkFields.dispatchPacketId') }}</th>
                  <th scope="col">{{ t('execution.linkFields.correlationId') }}</th>
                  <th scope="col">{{ t('execution.linkFields.peerConversationId') }}</th>
                  <th scope="col">{{ t('execution.linkFields.operationId') }}</th>
                  <th scope="col">{{ t('execution.linkFields.relatedJobId') }}</th>
                  <th scope="col">{{ t('execution.linkFields.attempt') }}</th>
                  <th scope="col">{{ t('execution.linkFields.observedAtMs') }}</th>
                  <th scope="col">{{ t('execution.linkFields.sourceRef') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="link in visibleLinks" :key="link.linkKey">
                  <td class="mono">{{ link.linkKey }}</td>
                  <td class="mono">{{ link.linkKind ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ link.matchBasis ?? t('execution.notAvailable') }}</td>
                  <td class="mono">
                    {{ link.confidence ? t(`execution.evidenceConfidence.${link.confidence}`) : t('execution.notAvailable') }}
                  </td>
                  <td class="mono">
                    {{ link.sourceQuality ? t(`execution.sourceQuality.${link.sourceQuality}`) : t('execution.notAvailable') }}
                  </td>
                  <td class="mono">{{ link.taskId ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ link.nodeId ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ link.originNodeId ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ link.requestId ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ link.dispatchPacketId ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ link.correlationId ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ link.peerConversationId ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ link.operationId ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ link.relatedJobId ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ link.attempt ?? t('execution.notAvailable') }}</td>
                  <td class="nowrap">
                    {{ link.observedAtMs !== null ? formatDateTime(link.observedAtMs) : t('execution.notAvailable') }}
                  </td>
                  <td class="mono source-ref">{{ link.sourceRef }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            v-if="!state.links.error && links.length > REPORT_PAGE_SIZE"
            class="pagination"
            role="group"
            :aria-label="t('execution.pagination.navigation')"
          >
            <n-pagination
              :page="linkPage"
              :page-size="REPORT_PAGE_SIZE"
              :item-count="links.length"
              :page-slot="5"
              @update:page="linkPage = $event"
            />
          </div>
        </div>
      </details>
      <details class="evidence-group">
        <summary class="evidence-summary">
          <span class="evidence-title">{{ t('execution.protocol') }}</span>
          <span class="evidence-meta">
            <span v-if="protocolCount !== null" class="count">{{ protocolCount }}</span>
            <span v-if="state.protocol.loading" class="section-status" role="status">{{ t('execution.loading') }}</span>
            <span v-if="state.protocol.error" class="evidence-error">{{ t('execution.loadFailed') }}</span>
            <span v-if="state.protocolPageCoverage.length" class="section-status">
              {{ t('execution.protocolPageCoverage') }}
            </span>
          </span>
        </summary>

        <div class="evidence-body">
          <n-alert v-if="state.protocol.error" type="error" :bordered="false" class="section-alert">
            <div class="alert-row">
              <span>{{ t('execution.loadFailed') }}</span>
              <n-button size="tiny" :loading="reloading" @click="handleReload">{{ t('execution.retry') }}</n-button>
            </div>
          </n-alert>

          <div v-else-if="state.protocol.loading && !state.protocol.loaded" class="state-block" role="status">
            <n-spin size="small" />
            <span>{{ t('execution.loading') }}</span>
          </div>
          <div
            v-else-if="state.protocol.loaded"
            class="table-scroll"
            tabindex="0"
            role="group"
            :aria-label="t('execution.protocol')"
          >
            <div
              v-if="state.protocolPageCoverage.length"
              class="protocol-page-coverage"
              :aria-label="t('execution.protocolPageCoverage')"
            >
              <div
                v-for="(page, index) in state.protocolPageCoverage"
                :key="page.cursor ?? `page-${index + 1}`"
                class="protocol-page-row"
              >
                <span>{{ t('execution.protocolPage') }} {{ index + 1 }}</span>
                <n-tag size="small" :bordered="false">{{ coverageStateLabel(page.coverage, t) }}</n-tag>
                <n-tag v-for="reason in page.reasons" :key="reason" size="small" :bordered="true">
                  {{ coverageReasonLabel(reason, t) }}
                </n-tag>
              </div>
            </div>

            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">{{ t('execution.protocolFields.packetId') }}</th>
                  <th scope="col">{{ t('execution.protocolFields.messageType') }}</th>
                  <th scope="col">{{ t('execution.protocolFields.direction') }}</th>
                  <th scope="col">{{ t('execution.protocolFields.nodeId') }}</th>
                  <th scope="col">{{ t('execution.protocolFields.authenticatedNodeId') }}</th>
                  <th scope="col">{{ t('execution.protocolFields.fromNodeId') }}</th>
                  <th scope="col">{{ t('execution.protocolFields.toNodeId') }}</th>
                  <th scope="col">{{ t('execution.protocolFields.correlationId') }}</th>
                  <th scope="col">{{ t('execution.protocolFields.timestampMs') }}</th>
                  <th scope="col">{{ t('execution.protocolFields.matchBasis') }}</th>
                  <th scope="col">{{ t('execution.protocolFields.confidence') }}</th>
                  <th scope="col">{{ t('execution.protocolFields.sourceQuality') }}</th>
                  <th scope="col">{{ t('execution.protocolFields.sourceRef') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="event in visibleProtocolEvents" :key="`${event.nodeId}:${event.packetId}`">
                  <td class="mono">{{ event.packetId }}</td>
                  <td class="mono">{{ event.messageType }}</td>
                  <td class="mono">{{ t(`execution.protocolDirections.${event.direction}`) }}</td>
                  <td class="mono">{{ event.nodeId }}</td>
                  <td class="mono">{{ event.authenticatedNodeId ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ event.fromNodeId ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ event.toNodeId ?? t('execution.notAvailable') }}</td>
                  <td class="mono">{{ event.correlationId ?? t('execution.notAvailable') }}</td>
                  <td class="nowrap">
                    {{ event.timestampMs !== null ? formatDateTime(event.timestampMs) : t('execution.notAvailable') }}
                  </td>
                  <td class="mono">{{ event.matchBasis ?? t('execution.notAvailable') }}</td>
                  <td class="mono">
                    {{ event.confidence ? t(`execution.evidenceConfidence.${event.confidence}`) : t('execution.notAvailable') }}
                  </td>
                  <td class="mono">
                    {{ event.sourceQuality ? t(`execution.sourceQuality.${event.sourceQuality}`) : t('execution.notAvailable') }}
                  </td>
                  <td class="mono source-ref">{{ event.sourceRef }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            v-if="!state.protocol.error && protocolEvents.length > REPORT_PAGE_SIZE"
            class="pagination"
            role="group"
            :aria-label="t('execution.pagination.navigation')"
          >
            <n-pagination
              :page="protocolPage"
              :page-size="REPORT_PAGE_SIZE"
              :item-count="protocolEvents.length"
              :page-slot="5"
              @update:page="protocolPage = $event"
            />
          </div>
        </div>
      </details>

      <TaskDetailModal :task="selectedTask" :job="jobDetail" @close="closeTaskDetail" />
    </template>
  </div>
</template>

<script setup lang="ts">

import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TraceObservation } from '@/api/trace'
import { useTraceSession } from '@/features/execution/data/useTraceSession'
import { projectExecutionStages, type ExecutionStage } from '@/features/execution/data/executionStages'
import { projectExecutionCommunication } from '@/features/execution/data/executionCommunication'
import ExecutionSequenceView from '@/features/execution/components/ExecutionSequenceView.vue'
import type { TaskSummary } from '@/api/job'
import ChallengeConfidencePanel from '@/features/execution/components/ChallengeConfidencePanel.vue'
import ExecutionCoverageSummary from '@/features/execution/components/ExecutionCoverageSummary.vue'
import TagPartMatrix from '@/features/execution/components/TagPartMatrix.vue'
import { reportAlgorithmEvidence } from './executionReportModel'
import ExecutionBackButton from '@/features/execution/components/ExecutionBackButton.vue'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import { useI18n } from '@/stores/i18n'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { formatDateTime } from '@/utils/datetime'
import { jobStatusTagType } from '@/utils/jobStatus'
import {
  coverageReasonLabel,
  coverageStateLabel,
  executionKindLabel,
  jobStatusLabel,
  maintenanceRecoveryLabel,
  taskStatusLabel,
  tracePartStatusLabel,
} from '@/utils/statusLabels'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { algorithmsById, algorithmEntitiesById, ensureLoaded } = useReferenceCatalog()

/** Follow `route.params.jobId` reactively so in-place navigation reloads the session. */
const jobId = computed<string | null>(() => {
  const value = route.params.jobId
  const id = Array.isArray(value) ? value[0] : value
  return typeof id === 'string' && id.length > 0 ? id : null
})

const session = useTraceSession(jobId, { pollingProfile: 'adaptive' })
const { state, tasks, taskPage, jobDetail, jobDetailFailed } = session
const selectedTask = ref<TaskSummary | null>(null)

/** Every report row is a recorded fact; nothing is derived or recomputed client-side. */
const summary = computed(() => state.summary.data)
const observations = computed(() => state.observations.data ?? [])
const reportAlgorithm = computed(() => reportAlgorithmEvidence(summary.value ?? null, observations.value))
const reportAlgorithmProfile = computed(() => {
  const selection = reportAlgorithm.value.selection
  return selection ? algorithmEntitiesById.value.get(selection.algorithmId) ?? null : null
})
const reportAlgorithmName = computed(() => {
  const selection = reportAlgorithm.value.selection
  if (!selection) return t('execution.algorithmSelection.nameUnavailable')
  return selection.algorithmName?.trim()
    || algorithmsById.value.get(selection.algorithmId)
    || t('execution.algorithmSelection.nameUnavailable')
})
const reportAlgorithmType = computed(() =>
  reportAlgorithm.value.selection?.algorithmType?.trim()
  || reportAlgorithmProfile.value?.algorithmType?.trim()
  || t('execution.algorithmSelection.typeUnavailable'),
)
watch(() => reportAlgorithm.value.selection, selection => {
  if (selection && (!selection.algorithmName?.trim() || !selection.algorithmType?.trim())) void ensureLoaded()
}, { immediate: true })
const parts = computed(() => state.parts.data ?? [])
const links = computed(() => state.links.data ?? [])
const protocolEvents = computed(() => state.protocol.data ?? [])
const kind = computed(() => summary.value?.executionKind ?? null)
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
/** Identity node activity is limited to the same validated stage evidence. */
const stageProjection = computed(() => projectExecutionStages(kind.value, observations.value, {
  summary: summary.value ?? null,
  links: links.value,
}))
const communicationObservations = computed(() => {
  if (kind.value !== 'identityVerification') return observations.value
  const validObservationIds = new Set(
    stageProjection.value.stages.flatMap(stage => stage.evidence.map(evidence => evidence.observationId)),
  )
  return observations.value.filter(observation => validObservationIds.has(observation.observationId))
})
const communicationProjection = computed(() => projectExecutionCommunication({
  activeJobId: jobId.value ?? '',
  links: links.value,
  observations: communicationObservations.value,
  protocolEvents: protocolEvents.value,
}))

const REPORT_PAGE_SIZE = 100
const observationPage = ref(1)
const partPage = ref(1)
const linkPage = ref(1)
const protocolPage = ref(1)

function pageCount(items: readonly unknown[]): number {
  return Math.max(1, Math.ceil(items.length / REPORT_PAGE_SIZE))
}

function pageItems<T>(items: readonly T[], page: number): T[] {
  const normalizedPage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1
  const start = (Math.min(normalizedPage, pageCount(items)) - 1) * REPORT_PAGE_SIZE
  return items.slice(start, start + REPORT_PAGE_SIZE)
}

watch(
  () => [
    observations.value.length,
    parts.value.length,
    links.value.length,
    protocolEvents.value.length,
  ],
  () => {
    observationPage.value = Math.min(observationPage.value, pageCount(observations.value))
    partPage.value = Math.min(partPage.value, pageCount(parts.value))
    linkPage.value = Math.min(linkPage.value, pageCount(links.value))
    protocolPage.value = Math.min(protocolPage.value, pageCount(protocolEvents.value))
  },
  { flush: 'sync' },
)

const visibleObservations = computed(() => pageItems(observations.value, observationPage.value))
const visibleParts = computed(() => pageItems(parts.value, partPage.value))
const visibleLinks = computed(() => pageItems(links.value, linkPage.value))
const visibleProtocolEvents = computed(() => pageItems(protocolEvents.value, protocolPage.value))

watch(jobId, () => {
  observationPage.value = 1
  partPage.value = 1
  linkPage.value = 1
  protocolPage.value = 1
  selectedTask.value = null
}, { flush: 'sync' })
const sharedJob = computed(() => (session.job.value?.snapshotLoaded ? session.job.value : null))
const jobStatus = computed(() => sharedJob.value?.status ?? summary.value?.job.status ?? null)
const owner = computed(() => summary.value?.references.owner ?? sharedJob.value?.dataOwner ?? null)
const ownerLabel = computed(() => identityLabel(owner.value))
const createdAt = computed(() => summary.value?.job.createdAtMs ?? sharedJob.value?.createdAtMs ?? null)
const updatedAt = computed(() => summary.value?.observedAtMs ?? null)
const startedAt = computed(() => positiveTimestamp(jobDetail.value?.startedAtMs))
const endedAt = computed(() =>
  positiveTimestamp(jobDetail.value?.endedAtMs) ?? positiveTimestamp(summary.value?.job.endedAtMs),
)
const totalDurationMs = computed(() =>
  jobDetail.value?.totalDurationMs ?? sharedJob.value?.totalDurationMs ?? null,
)
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

function positiveTimestamp(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

const verified = computed(() => {
  const traceValue = summary.value?.references.verified
  if (traceValue === true || traceValue === false) return traceValue
  const metadataValue = jobDetail.value?.metadata?.verified
  if (metadataValue === true || metadataValue === false) return metadataValue
  if (metadataValue === 'true') return true
  if (metadataValue === 'false') return false
  return null
})

const summaryLoading = computed(
  () => state.summary.loading || (state.initialLoading && !state.summary.loaded && !state.summary.error),
)
const summaryPlaceholder = computed(() => (summaryLoading.value ? t('execution.loading') : t('execution.notAvailable')))

/** The hero repeats the cryptographic result only; it never stands in for Job status. */
const verifiedText = computed(() => {
  if (verified.value === true) return t('execution.confidence.verifiedTrue')
  if (verified.value === false) return t('execution.confidence.verifiedFalse')
  return t('execution.confidence.verifiedUnknown')
})
const verifiedToneClass = computed(() => {
  if (verified.value === true) return 'tone-true'
  if (verified.value === false) return 'tone-false'
  return 'tone-unknown'
})

const latestObservedStage = computed<ExecutionStage | null>(
  () =>
    stageProjection.value.stages.find(
      stage => stage.id === stageProjection.value.latestObservedStageId,
    ) ?? null,
)

function stageTagLabel(stage: ExecutionStage): string {
  if (stage.status === 'notObserved') return t('execution.stages.notObserved')
  if (stage.evidence.some(evidence => evidence.source.quality === 'observed')) {
    return t('execution.stages.observed')
  }
  if (stage.evidence.some(evidence => evidence.source.quality === 'reconstructed')) {
    return t('execution.stages.reconstructed')
  }
  return t('execution.stages.qualityUnknown')
}

function stageTagType(stage: ExecutionStage): 'default' | 'success' | 'warning' {
  if (stage.status === 'notObserved') return 'default'
  return stage.evidence.some(evidence => evidence.source.quality === 'observed') ? 'success' : 'warning'
}

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

function taskTimestamp(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return t('execution.notAvailable')
  }
  return formatDateTime(value)
}

function taskDurationMs(task: TaskSummary): number | null {
  const startedAtMs = task.startedAtMs
  const completedAtMs = task.completedAtMs
  if (
    typeof startedAtMs !== 'number'
    || typeof completedAtMs !== 'number'
    || !Number.isSafeInteger(startedAtMs)
    || !Number.isSafeInteger(completedAtMs)
    || startedAtMs <= 0
    || completedAtMs <= 0
    || completedAtMs < startedAtMs
  ) {
    return null
  }
  return completedAtMs - startedAtMs
}

const partsCount = computed(() => (state.parts.loaded && !state.parts.loading ? parts.value.length : null))
const linksCount = computed(() => (state.links.loaded && !state.links.loading ? links.value.length : null))
const protocolCount = computed(() =>
  state.protocol.loaded && !state.protocol.loading ? protocolEvents.value.length : null,
)
const observationsCount = computed(() =>
  state.observations.loaded && !state.observations.loading ? observations.value.length : null,
)

/** Counts of already-loaded records only; a missing count stays unknown, never zero. */
function countText(count: number | null, loading: boolean): string {
  if (count !== null) return String(count)
  return loading ? t('execution.loading') : t('execution.notAvailable')
}

const workloadItems = computed(() => [
  { key: 'tasks', label: t('execution.tasks'), value: taskTotalLabel.value },
  { key: 'parts', label: t('execution.parts'), value: countText(partsCount.value, state.parts.loading) },
  {
    key: 'observations',
    label: t('execution.observations'),
    value: countText(observationsCount.value, state.observations.loading),
  },
  { key: 'links', label: t('execution.links'), value: countText(linksCount.value, state.links.loading) },
  {
    key: 'protocol',
    label: t('execution.protocol'),
    value: countText(protocolCount.value, state.protocol.loading),
  },
])
const tagWorkloadItems = computed(() => {
  const progress = summary.value?.progress
  return [
    { key: 'plannedBlocks', label: t('execution.tagGeneration.plannedBlocks'), value: progress?.plannedBlockCount ?? null },
    { key: 'generatedBlocks', label: t('execution.tagGeneration.generatedBlocks'), value: progress?.generatedBlockCount ?? null },
    { key: 'plannedParts', label: t('execution.tagGeneration.plannedParts'), value: progress?.plannedPartCount ?? null },
    { key: 'completedParts', label: t('execution.tagGeneration.completedParts'), value: progress?.completedPartCount ?? null },
    { key: 'storageAccountedTags', label: t('execution.tagGeneration.storageAccountedTags'), value: progress?.storageAccountedTagCount ?? null },
    { key: 'persisted', label: t('execution.tagGeneration.persisted'), value: progress?.persistedCount ?? null },
    { key: 'duplicateCount', label: t('execution.tagGeneration.duplicateCount'), value: progress?.duplicateCount ?? null },
    { key: 'replacedCount', label: t('execution.tagGeneration.replacedCount'), value: progress?.replacedCount ?? null },
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
  if (name && id) return `${name} (${id})`
  return name || id
}

function observationActivityLabel(observation: TraceObservation): string {
  const key = `execution.activities.${observation.eventType}`
  const label = t(key)
  return label === key ? observation.eventType : label
}

function sourceLabel(source: TraceObservation['source']): string {
  const parts: string[] = []
  if (source.component) parts.push(source.component)
  if (source.nodeId) parts.push(source.nodeId)
  if (source.quality) parts.push(t(`execution.sourceQuality.${source.quality}`))
  return parts.length > 0 ? parts.join(' · ') : t('execution.notAvailable')
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

function hasPreviousRoute(): boolean {
  const back = window.history.state?.back
  return typeof back === 'string' && back.length > 0
}

function returnButtonLabel(): string {
  if (hasPreviousRoute()) return t('execution.backPrevious')
  return t(jobId.value ? 'execution.backToExecution' : 'execution.backToJobs')
}

function goBack(): void {
  if (hasPreviousRoute()) {
    router.back()
    return
  }
  const id = jobId.value
  if (!id) {
    void router.replace({ name: 'jobs' })
    return
  }
  void router.replace({ name: 'executionDetail', params: { jobId: id } })
}
</script>

<style scoped>
.execution-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1200px;
  min-width: 0;
}

.report-header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
}

.report-heading {
  min-width: 0;
}

.report-title {
  margin: 0 0 4px;
  color: var(--apple-gray-1);
  font-size: 18px;
  font-weight: 600;
}

.report-description {
  max-width: 60ch;
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 13px;
}

.report-job {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin: 6px 0 0;
}

.report-job > span {
  color: var(--apple-gray-4);
  font-size: 10px;
}

.report-job code {
  overflow-wrap: anywhere;
  color: var(--apple-gray-2);
  font-size: 12px;
}

.execution-actions {
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
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

.report-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  flex-wrap: wrap;
  min-width: 0;
  padding: 12px 16px;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
}

.hero-lead {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.hero-status-label {
  color: var(--apple-gray-1);
  font-size: 17px;
  font-weight: 600;
}

.hero-kind {
  color: var(--apple-gray-3);
  font-size: 12px;
}

.hero-result {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.hero-result-label {
  color: var(--apple-gray-3);
  font-size: 11px;
}

.hero-result-value {
  font-size: 14px;
  font-weight: 600;
}

.tone-true {
  color: var(--apple-green);
}

.tone-false {
  color: var(--apple-red);
}

.tone-unknown {
  color: var(--apple-gray-3);
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


.protocol-page-coverage {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}

.protocol-page-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  color: var(--apple-gray-3);
  font-size: 11px;
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

.workload-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px 20px;
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--apple-border);
}

.workload dt {
  color: var(--apple-gray-3);
  font-size: 11px;
}

.workload dd {
  margin: 2px 0 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.confidence-panel :deep(.challenge-confidence) {
  gap: 10px;
}

.confidence-panel :deep(.fact-grid) {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px 16px;
}

.confidence-panel :deep(.param-grid) {
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px 16px;
}

.stage-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0 20px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 0;
  border-bottom: 1px solid var(--apple-border);
}

.stage-index {
  color: var(--apple-gray-4);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.stage-label {
  color: var(--apple-gray-2);
  font-size: 12px;
}

.stage-evidence {
  margin-left: auto;
  color: var(--apple-gray-4);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.evidence-group {
  min-width: 0;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
}

.evidence-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 16px;
  cursor: pointer;
  list-style: none;
}

.evidence-summary::-webkit-details-marker {
  display: none;
}

.evidence-summary::before {
  content: '';
  flex: none;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid var(--apple-gray-3);
  border-bottom: 1.5px solid var(--apple-gray-3);
  transform: rotate(-45deg);
  transition: transform var(--apple-dur-fast) var(--apple-ease-out);
}

.evidence-group[open] > .evidence-summary::before {
  transform: rotate(45deg);
}

.evidence-summary:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: -2px;
  border-radius: var(--apple-radius-lg);
}

.evidence-title {
  margin-right: auto;
  color: var(--apple-gray-1);
  font-size: 14px;
  font-weight: 600;
}

.evidence-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.evidence-meta strong {
  color: var(--apple-gray-2);
  font-weight: 500;
}

.evidence-error {
  color: var(--apple-red);
}

.evidence-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--apple-border);
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


.report-algorithm-id {
  font-size: 11px;
  color: var(--apple-gray-2);
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
.task-detail-button {
  padding: 0;
  color: inherit;
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

.task-type {
  margin-left: auto;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.task-times {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  width: 100%;
  color: var(--apple-gray-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
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

  .report-header {
    grid-template-columns: 44px minmax(0, 1fr);
    align-items: start;
    gap: 12px;
  }

  .execution-actions {
    grid-column: 1 / -1;
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }
  .execution-action-group { width: 100%; justify-content: space-between; }
  .execution-action-group__label { flex-basis: 76px; }
  .execution-action-group__buttons { flex: 1 1 0; }

  .report-hero {
    align-items: flex-start;
    flex-direction: column;
    padding: 12px;
  }

  .evidence-summary {
    align-items: flex-start;
    padding: 10px 12px;
  }

  .evidence-meta {
    gap: 8px 12px;
  }

  .evidence-body {
    padding: 12px;
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
