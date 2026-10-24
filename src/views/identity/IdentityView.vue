<template>
  <main class="identity-workbench">
    <PageHeader
      :eyebrow="t('identity.workbench.eyebrow')"
      :title="t('identity.workbench.title')"
      :description="t('identity.workbench.description')"
    >
      <template #meta>
        <span>{{ t('identity.workbench.auditWorkerNote') }}</span>
      </template>
    </PageHeader>

    <n-tabs v-model:value="activeTab" type="segment" size="small" class="identity-workbench__tabs">
      <n-tab-pane name="verify" :tab="t('identity.verify')">
        <section class="work-area" :aria-label="t('identity.workbench.verifyTitle')">
          <div class="work-area__main">
            <section class="section-band">
              <div class="section-heading">
                <div>
                  <h2>{{ t('identity.workbench.scopeTitle') }}</h2>
                  <p>{{ t('identity.workbench.scopeDescription') }}</p>
                </div>
                <n-radio-group v-model:value="verifyScope" size="small" :aria-label="t('identity.workbench.scopeTitle')">
                  <n-radio-button value="cell">{{ t('identity.verifyCell') }}</n-radio-button>
                  <n-radio-button value="row">{{ t('identity.verifyRow') }}</n-radio-button>
                  <n-radio-button value="table">{{ t('identity.verifyTable') }}</n-radio-button>
                </n-radio-group>
              </div>

              <n-form :model="verifyForm" label-placement="top" class="locator-form">
                <n-form-item :label="t('identity.tableId')" required>
                  <TableSelect v-model="verifyForm.tableId" style="width: 100%" />
                </n-form-item>
                <n-form-item v-if="verifyScope !== 'table'" :label="t('identity.rowId')" required>
                  <n-input v-model:value="verifyForm.rowId" />
                </n-form-item>
                <n-form-item v-if="verifyScope === 'cell'" :label="t('identity.columnId')" required>
                  <n-input v-model:value="verifyForm.columnId" />
                </n-form-item>
              </n-form>
              <div class="scope-summary" aria-live="polite">
                <span class="scope-summary__label">{{ t('identity.workbench.requestScope') }}</span>
                <span>{{ scopeSummary }}</span>
              </div>
              <div class="section-actions">
                <n-button type="primary" :loading="verifyLoading" @click="handleVerify">
                  {{ t('identity.verifyBtn') }}
                </n-button>
              </div>
            </section>

            <section class="section-band result-band" aria-live="polite">
              <div class="section-heading">
                <div>
                  <h2>{{ t('identity.workbench.resultTitle') }}</h2>
                  <p>{{ t('identity.workbench.resultDescription') }}</p>
                </div>
                <n-tag v-if="verifyLoading" type="info" :bordered="false">
                  {{ t('identity.workbench.requestPending') }}
                </n-tag>
              </div>
              <n-alert v-if="verifyError" type="error" :title="t('identity.workbench.requestFailed')" :bordered="false">
                {{ verifyError }}
              </n-alert>
              <template v-else-if="verifyResult">
                <div class="result-facts result-facts--compact">
                  <div class="result-fact"><span>{{ t('identity.workbench.dispatchState') }}</span><strong>{{ dispatchStatusLabel }}</strong></div>
                  <div class="result-fact"><span>{{ t('identity.workbench.jobStatus') }}</span><strong>{{ currentJobStatusLabel }}</strong></div>
                  <div class="result-fact"><span>{{ t('identity.workbench.taskStatus') }}</span><strong>{{ currentTaskStatusLabel }}</strong></div>
                  <div class="result-fact"><span>{{ t('identity.workbench.verdict') }}</span><strong>{{ verificationSummary }}</strong></div>
                </div>
                <div class="job-entry">
                  <div>
                    <span class="job-entry__eyebrow">{{ t('identity.workbench.relatedJob') }}</span><code>{{ verifyResult.jobId }}</code>
                    <span class="job-entry__eyebrow">{{ t('identity.workbench.taskId') }}</span><code>{{ verifyResult.taskId }}</code>
                  </div>
                  <n-button size="small" type="primary" ghost @click="openJob(verifyResult.jobId)">
                    {{ t('identity.workbench.openExecution') }}
                  </n-button>
                </div>
                <div
                  v-if="workerStageCoverageLabel !== null || rootHashPresenceState !== 'unknown'"
                  class="trace-coverage trace-coverage--compact"
                >
                  <div v-if="workerStageCoverageLabel !== null" class="trace-coverage__fact">
                    <span>{{ t('identity.workbench.observationCoverage') }}</span>
                    <n-tag size="small" :bordered="false">{{ workerStageCoverageLabel }}</n-tag>
                  </div>
                  <div v-if="rootHashPresenceState !== 'unknown'" class="trace-coverage__fact">
                    <span>{{ t('execution.businessMetrics.rootHashPresence') }}</span>
                    <strong>{{ rootHashPresenceSummary }}</strong>
                  </div>
                </div>
                <p v-if="traceSession.state.summary.loading || traceSession.state.initialLoading" class="compact-trace-note" role="status">
                  {{ t('identity.workbench.traceLoading') }}
                </p>
                <p v-else-if="traceSession.state.summary.error || !traceSession.state.summary.loaded || !traceSummary" class="compact-trace-note" role="status">
                  {{ t('identity.workbench.traceUnknown') }}
                </p>
                <p v-else-if="traceSummary.executionKind && traceSummary.executionKind !== 'identityVerification'" class="compact-trace-note" role="status">
                  {{ t('identity.workbench.traceUnsupported') }}
                </p>
                <div v-if="identityTraceKind === 'identityVerification'" class="compact-stage-summary">
                  <div class="compact-stage-summary__head">
                    <h3>{{ t('identity.workbench.liveExecutionTitle') }}</h3>
                    <p>{{ t('identity.workbench.liveExecutionDescription') }}</p>
                  </div>
                  <ExecutionStageRail
                    execution-kind="identityVerification"
                    :stages="stageProjection.stages"
                    :dispatch-link="identityTaskRelations.dispatchLink"
                    :settlement-link="identityTaskRelations.settlementLink"
                    :selected-stage-id="selectedTraceStageId"
                    :display-facts="stageDisplayProjection.facts.stages"
                    @select-stage="selectedTraceStageId = $event"
                  />
                  <p v-if="traceSession.state.observations.loading" class="compact-trace-note" role="status">
                    {{ t('identity.workbench.observationsLoading') }}
                  </p>
                  <p v-else-if="traceSession.state.observations.error" class="compact-trace-note">{{ t('identity.workbench.observationsUnknown') }}</p>
                </div>
                <n-collapse>
                  <n-collapse-item :title="t('identity.workbench.responseDetails')" name="verify-response">
                    <div v-if="taskSnapshot?.statusMessage" class="task-diagnostic">
                      <span>{{ t('identity.workbench.taskDetail') }}</span>
                      <p>{{ taskSnapshot.statusMessage }}</p>
                    </div>
                    <n-code :code="formatResponse(verifyResult)" language="json" word-wrap />
                  </n-collapse-item>
                </n-collapse>
              </template>
              <n-empty v-else-if="!verifyLoading" :description="t('identity.workbench.noResult')" />
            </section>
          </div>

          <aside class="mechanism-rail">
            <section class="section-band mechanism-band">
              <span class="section-kicker">{{ t('identity.workbench.mechanismKicker') }}</span>
              <h2>{{ t('identity.workbench.mechanismTitle') }}</h2>
              <p>{{ t('identity.workbench.mechanismDescription') }}</p>
              <ol class="mechanism-list">
                <li><span>01</span>{{ t('identity.workbench.mechanismScope') }}</li>
                <li><span>02</span>{{ t('identity.workbench.mechanismEvidence') }}</li>
                <li><span>03</span>{{ t('identity.workbench.mechanismVerdict') }}</li>
              </ol>
              <n-alert type="info" :bordered="false" class="evidence-note">
                {{ t('identity.workbench.staticMechanismNote') }}
              </n-alert>
            </section>
            <section class="section-band boundary-band">
              <h3>{{ t('identity.workbench.stateBoundaryTitle') }}</h3>
              <p>{{ t('identity.workbench.stateBoundaryDescription') }}</p>
            </section>
          </aside>
        </section>
      </n-tab-pane>

      <n-tab-pane name="resign" :tab="t('identity.resign')">
        <section class="work-area" :aria-label="t('identity.workbench.resignTitle')">
          <div class="work-area__main">
            <section class="section-band">
              <div class="section-heading">
                <div>
                  <h2>{{ t('identity.workbench.resignTitle') }}</h2>
                  <p>{{ t('identity.workbench.resignDescription') }}</p>
                </div>
              </div>
              <n-form :model="resignForm" label-placement="top" class="locator-form resign-form">
                <n-form-item :label="t('identity.ownerId')" required>
                  <UserSelect v-model="resignForm.ownerId" style="width: 100%" />
                </n-form-item>
                <n-form-item :label="t('identity.algorithmId')" required>
                  <AlgorithmSelect
                    v-model="resignForm.algorithmId"
                    purpose="Identity"
                    style="width: 100%"
                    @change="handleAlgorithmChange"
                  />
                </n-form-item>
              </n-form>

              <section class="algorithm-summary" :aria-label="t('identity.workbench.selectedAlgorithm')">
                <div class="algorithm-summary__title">
                  <div>
                    <span class="section-kicker">{{ t('identity.workbench.selectedAlgorithm') }}</span>
                    <h3>{{ selectedProfile?.algorithmName || t('identity.workbench.noAlgorithm') }}</h3>
                  </div>
                  <n-tooltip v-if="selectedProfile" trigger="hover">
                    <template #trigger>
                      <n-button size="tiny" quaternary circle :aria-label="t('identity.workbench.copyAlgorithmId')" @click="copyAlgorithmId">
                        <template #icon><n-icon :component="CopyOutline" /></template>
                      </n-button>
                    </template>
                    {{ selectedProfile.algorithmId }} · {{ t('identity.workbench.copyAlgorithmId') }}
                  </n-tooltip>
                </div>
                <div v-if="selectedProfile" class="algorithm-metadata">
                  <span><b>{{ t('identity.workbench.algorithmType') }}</b>{{ selectedProfile.algorithmType }}</span>
                  <span><b>{{ t('identity.workbench.algorithmPurpose') }}</b>{{ t('identity.workbench.identityPurpose') }}</span>
                </div>
                <p v-else class="algorithm-empty">{{ t('identity.workbench.algorithmSelectionHint') }}</p>
              </section>

              <div class="operation-summary">
                <span class="section-kicker">{{ t('identity.workbench.operationSummary') }}</span>
                <p>{{ t('identity.workbench.resignMechanism') }}</p>
              </div>
              <div class="section-actions">
                <n-popconfirm @positive-click="handleResign">
                  <template #trigger>
                    <n-button type="warning" :loading="resignLoading">
                      {{ t('identity.triggerResign') }}
                    </n-button>
                  </template>
                  {{ t('identity.resignConfirm') }}
                </n-popconfirm>
              </div>
            </section>

            <section class="section-band result-band" aria-live="polite">
              <div class="section-heading">
                <div>
                  <h2>{{ t('identity.workbench.resignResultTitle') }}</h2>
                  <p>{{ t('identity.workbench.resignResultDescription') }}</p>
                </div>
                <n-tag v-if="resignResult" type="success" :bordered="false">
                  {{ t('identity.workbench.dispatchAccepted') }}
                </n-tag>
                <n-tag v-else-if="resignLoading" type="info" :bordered="false">
                  {{ t('identity.workbench.requestPending') }}
                </n-tag>
              </div>
              <n-alert v-if="resignError" type="error" :title="t('identity.workbench.requestFailed')" :bordered="false">
                {{ resignError }}
              </n-alert>
              <template v-else-if="resignResult">
                <div class="job-entry" v-if="resignJobId">
                  <div>
                    <span class="job-entry__eyebrow">{{ t('identity.workbench.relatedJob') }}</span>
                    <code>{{ resignJobId }}</code>
                  </div>
                  <n-button size="small" type="primary" ghost @click="openResignJob">
                    {{ t('identity.workbench.openExecution') }}
                  </n-button>
                </div>
                <n-collapse>
                  <n-collapse-item :title="t('identity.workbench.responseDetails')" name="resign-response">
                    <n-code :code="formatResponse(resignResult)" language="json" word-wrap />
                  </n-collapse-item>
                </n-collapse>
              </template>
              <n-empty v-else-if="!resignLoading" :description="t('identity.workbench.noResult')" />
            </section>
          </div>

          <aside class="mechanism-rail">
            <section class="section-band mechanism-band">
              <span class="section-kicker">{{ t('identity.workbench.operationKicker') }}</span>
              <h2>{{ t('identity.workbench.resignProcessTitle') }}</h2>
              <p>{{ t('identity.workbench.resignProcessDescription') }}</p>
              <ol class="mechanism-list">
                <li><span>01</span>{{ t('identity.workbench.resignStepOwner') }}</li>
                <li><span>02</span>{{ t('identity.workbench.resignStepAlgorithm') }}</li>
                <li><span>03</span>{{ t('identity.workbench.resignStepJob') }}</li>
              </ol>
              <n-alert type="warning" :bordered="false" class="evidence-note">
                {{ t('identity.workbench.noDynamicStepNote') }}
              </n-alert>
            </section>
            <section class="section-band boundary-band">
              <h3>{{ t('identity.workbench.resignBoundaryTitle') }}</h3>
              <p>{{ t('identity.workbench.resignBoundaryDescription') }}</p>
            </section>
          </aside>
        </section>
      </n-tab-pane>
    </n-tabs>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMessage, NIcon } from 'naive-ui'
import { CopyOutline } from '@vicons/ionicons5'
import { useRouter } from 'vue-router'
import { resign, verifyCell, verifyRow, verifyTable, type IdentityVerifyResult } from '@/api/identity'
import type { AlgorithmProfile } from '@/api/algorithm'
import PageHeader from '@/components/PageHeader.vue'
import TableSelect from '@/components/TableSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import AlgorithmSelect from '@/components/AlgorithmSelect.vue'
import { trackJob } from '@/stores/jobTracking'
import { useTraceSession } from '@/features/execution/data/useTraceSession'
import { projectExecutionDisplay, projectExecutionMetricSummary } from '@/features/execution/data/executionDisplayProjection'
import {
  projectExecutionStages,
  projectIdentityTaskRelations,
  projectIdentityVerificationConclusion,
} from '@/features/execution/data/executionStages'
import ExecutionStageRail from '@/features/execution/components/ExecutionStageRail.vue'
import { useI18n } from '@/stores/i18n'
import { coverageStateLabel, jobStatusLabel, taskStatusLabel } from '@/utils/statusLabels'

const message = useMessage()
const router = useRouter()
const { t } = useI18n()
const activeTab = ref<'verify' | 'resign'>('verify')
const verifyScope = ref<'cell' | 'row' | 'table'>('cell')
const verifyForm = ref({ tableId: '', rowId: '', columnId: '' })
const verifyLoading = ref(false)
const verifyResult = ref<IdentityVerifyResult | null>(null)
const verifyError = ref('')
let verifyRequestSequence = 0
const resignForm = ref({ ownerId: '', algorithmId: '' })
const resignLoading = ref(false)
const resignResult = ref<unknown>(null)
const resignError = ref('')
const selectedProfile = ref<AlgorithmProfile | null>(null)
const selectedTraceStageId = ref<string | null>(null)
const activeTraceJobId = computed(() => verifyResult.value?.jobId ?? null)
const resignJobId = computed(() => stringProperty(resignResult.value, 'jobId'))
const traceSession = useTraceSession(activeTraceJobId, { silent: true, pollingProfile: 'adaptive' })
const traceSummary = computed(() => {
  const summary = traceSession.state.summary.data
  return summary?.jobId === activeTraceJobId.value ? summary : null
})
const identityTraceKind = computed(() => {
  const kind = traceSummary.value?.executionKind
  if (kind === 'identityVerification') return kind
  if ((kind === null || kind === undefined) && activeTraceJobId.value) return 'identityVerification'
  return null
})
const workerStageCoverageLabel = computed(() => {
  const summary = traceSummary.value
  if (!summary || (summary.executionKind && summary.executionKind !== 'identityVerification')) return null
  const coverage = summary.coverage.workerStages
  return coverage ? coverageStateLabel(coverage, t) : null
})
const stageProjection = computed(() => projectExecutionStages(
  identityTraceKind.value,
  traceSession.state.observations.data ?? [],
  { summary: traceSummary.value, links: traceSession.state.links.data ?? [] },
))
const identityTaskRelations = computed(() => projectIdentityTaskRelations(
  activeTraceJobId.value ?? '',
  stageProjection.value.stages,
  traceSession.state.links.data ?? [],
))
const stageDisplayProjection = computed(() => {
  const jobId = activeTraceJobId.value ?? ''
  return projectExecutionDisplay({
    activeJobId: jobId,
    kind: identityTraceKind.value,
    stages: stageProjection.value.stages,
    observations: traceSession.state.observations.data ?? [],
    summary: traceSummary.value,
    parts: [],
    tasks: traceSession.tasks.value,
    storageNodeId: null,
    communication: { jobId, confirmedPackets: [], peerCorrelations: [], localStages: [] },
    mode: 'live',
  })
})
const currentJobStatus = computed(() => {
  const job = traceSession.job.value
  return job?.snapshotLoaded ? job.status : traceSummary.value?.job.status ?? null
})
const currentJobStatusLabel = computed(() =>
  currentJobStatus.value ? jobStatusLabel(currentJobStatus.value, t) : t('identity.workbench.statusUnknown'),
)
const taskSnapshot = computed(() => traceSession.tasks.value.find(task => task.taskId === verifyResult.value?.taskId) ?? null)
const currentTaskStatusLabel = computed(() =>
  taskSnapshot.value ? taskStatusLabel(taskSnapshot.value.status, t) : t('identity.workbench.taskStatusUnknown'),
)
const dispatchStatusLabel = computed(() =>
  verifyResult.value?.status === 'dispatched'
    ? t('identity.workbench.dispatchStatusDispatched')
    : t('identity.workbench.statusUnknown'),
)
const verificationConclusion = computed(() =>
  projectIdentityVerificationConclusion(traceSummary.value, activeTraceJobId.value),
)
const scopeSummary = computed(() => {
  const parts = [verifyForm.value.tableId || t('identity.workbench.notSelected')]
  if (verifyScope.value !== 'table') parts.push(verifyForm.value.rowId || t('identity.workbench.notSelected'))
  if (verifyScope.value === 'cell') parts.push(verifyForm.value.columnId || t('identity.workbench.notSelected'))
  return parts.join(' / ')
})
const verificationSummary = computed(() => {
  const verdict = verificationConclusion.value.verdict
  if (verdict === 'verified') return t('identity.workbench.verdictVerified')
  if (verdict === 'notVerified') return t('identity.workbench.verdictNotVerified')
  return t('identity.workbench.verdictUnknown')
})
const rootHashPresenceState = computed<'present' | 'notPresent' | 'conflict' | 'unknown'>(() => {
  const facts = new Set<boolean>()
  if (
    traceSummary.value?.executionKind === 'identityVerification'
    && typeof traceSummary.value.references.rootHashPresent === 'boolean'
  ) {
    facts.add(traceSummary.value.references.rootHashPresent)
  }
  for (const observation of traceSession.state.observations.data ?? []) {
    if (
      observation.jobId !== activeTraceJobId.value
      || observation.eventType !== 'IdentityVerificationCompleted'
      || typeof observation.metrics.rootHashPresentCount !== 'string'
    ) continue
    const fact = projectExecutionMetricSummary(
      'identityVerification',
      observation.eventType,
      'rootHashPresentCount',
      observation.metrics.rootHashPresentCount,
    )
    if (fact?.kind === 'rootHashPresence') facts.add(fact.present)
  }
  if (facts.has(true) && facts.has(false)) return 'conflict'
  if (facts.has(true)) return 'present'
  if (facts.has(false)) return 'notPresent'
  return 'unknown'
})
const rootHashPresenceSummary = computed(() => {
  if (rootHashPresenceState.value === 'present') return t('execution.businessMetrics.present')
  if (rootHashPresenceState.value === 'notPresent') return t('execution.businessMetrics.notPresent')
  if (rootHashPresenceState.value === 'conflict') return t('identity.workbench.rootHashConflict')
  return t('identity.workbench.statusUnknown')
})

watch(
  [verifyScope, () => verifyForm.value.tableId, () => verifyForm.value.rowId, () => verifyForm.value.columnId],
  () => {
    verifyRequestSequence += 1
    verifyLoading.value = false
    verifyResult.value = null
    selectedTraceStageId.value = null
    verifyError.value = ''
  },
)

function handleAlgorithmChange(profile: AlgorithmProfile | null) {
  selectedProfile.value = profile
}

async function handleVerify() {
  const scope = verifyScope.value
  const { tableId, rowId, columnId } = verifyForm.value
  if (!tableId) {
    message.warning(t('identity.fillTableId'))
    return
  }
  if (scope !== 'table' && !rowId) {
    message.warning(t('identity.fillComplete'))
    return
  }
  if (scope === 'cell' && !columnId) {
    message.warning(t('identity.fillComplete'))
    return
  }
  const requestSequence = ++verifyRequestSequence
  verifyLoading.value = true
  verifyResult.value = null
  verifyError.value = ''
  try {
    const res = scope === 'cell'
      ? await verifyCell(tableId, rowId, columnId)
      : scope === 'row'
        ? await verifyRow(tableId, rowId)
        : await verifyTable(tableId)
    trackJob(res.jobId, 'Identity')
    if (requestSequence !== verifyRequestSequence || scope !== verifyScope.value) return
    verifyResult.value = res
  }
  catch (error: unknown) {
    if (requestSequence !== verifyRequestSequence || scope !== verifyScope.value) return
    verifyError.value = requestErrorMessage(error)
  }
  finally {
    if (requestSequence === verifyRequestSequence && scope === verifyScope.value) verifyLoading.value = false
  }
}

async function handleResign() {
  const ownerId = resignForm.value.ownerId
  const profile = selectedProfile.value
  if (!ownerId || !resignForm.value.algorithmId || !profile || profile.algorithmId !== resignForm.value.algorithmId || !profile.algorithmType) {
    message.warning(t('identity.fillComplete'))
    return
  }
  resignLoading.value = true
  resignResult.value = null
  resignError.value = ''
  try {
    const response: unknown = await resign(ownerId, profile.algorithmId, profile.algorithmType)
    resignResult.value = response
    message.success(t('identity.resignSubmitted'))
    const jobId = stringProperty(response, 'jobId')
    if (jobId) trackJob(jobId, 'Identity')
  }
  catch (error: unknown) {
    resignError.value = requestErrorMessage(error)
  }
  finally {
    resignLoading.value = false
  }
}

function openJob(jobId: string) {
  void router.push({ name: 'executionDetail', params: { jobId } })
}
function openResignJob() {
  const jobId = resignJobId.value
  if (jobId) openJob(jobId)
}
function stringProperty(value: unknown, key: string): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !(key in value)) return null
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' ? field : null
}

function requestErrorMessage(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'response' in error) {
    const response = error.response
    if (response !== null && typeof response === 'object' && 'data' in response) {
      const data = response.data
      if (data !== null && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
        return data.message
      }
    }
  }
  return error instanceof Error ? error.message : String(error)
}

function formatResponse(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  }
  catch {
    return String(value)
  }
}

async function copyAlgorithmId() {
  if (!selectedProfile.value) return
  try {
    await navigator.clipboard.writeText(selectedProfile.value.algorithmId)
    message.success(t('common.copied'))
  }
  catch {
    message.error(t('identity.workbench.copyFailed'))
  }
}
</script>

<style scoped>
.identity-workbench {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  width: 100%;
  max-width: var(--apple-content-max);
  margin: 0 auto;
  min-width: 0;
  box-sizing: border-box;
}

.identity-workbench__tabs,
.work-area,
.work-area__main,
.mechanism-rail {
  min-width: 0;
}

.identity-workbench__tabs :deep(.n-tabs-pane-wrapper) {
  padding-top: var(--apple-space-4);
}

.work-area {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(270px, 0.85fr);
  gap: var(--apple-section-gap);
  align-items: start;
}

.work-area__main,
.mechanism-rail {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
}

.section-band {
  min-width: 0;
  padding: var(--apple-space-5);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--apple-space-4);
  margin-bottom: var(--apple-space-4);
}

.section-heading h2,
.mechanism-band h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 650;
}

.section-heading p,
.mechanism-band > p,
.boundary-band p {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-3);
  line-height: 1.55;
}

.trace-coverage {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  padding: var(--apple-space-3);
  border-radius: var(--apple-radius);
  background: var(--apple-bg);
}

.trace-coverage__fact {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
}
.trace-coverage__fact > span {
  color: var(--apple-gray-3);
  font-size: 0.875rem;
}
.trace-coverage__fact > strong {
  color: var(--apple-gray-1);
  font-weight: 600;
}


.locator-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: var(--apple-space-4);
  max-width: 700px;
}

.locator-form :deep(.n-form-item) {
  min-width: 0;
}

.scope-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  padding: var(--apple-space-3) 0;
  border-top: 1px solid var(--apple-border);
  color: var(--apple-gray-1);
  overflow-wrap: anywhere;
}

.scope-summary__label,
.job-entry__eyebrow,
.result-fact > span {
  color: var(--apple-gray-3);
  font-size: 0.875rem;
}

.section-actions {
  display: flex;
  justify-content: flex-start;
  padding-top: var(--apple-space-2);
}

.mechanism-band {
  background: var(--apple-bg);
}

.section-kicker {
  display: block;
  margin-bottom: var(--apple-space-2);
  color: var(--apple-gray-3);
  font-size: 0.75rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.mechanism-list {
  display: grid;
  gap: 0;
  margin: var(--apple-space-4) 0;
  padding: 0;
  list-style: none;
}

.mechanism-list li {
  display: flex;
  gap: var(--apple-space-3);
  align-items: baseline;
  padding: var(--apple-space-3) 0;
  border-top: 1px solid var(--apple-border);
  line-height: 1.5;
}

.mechanism-list li span {
  color: var(--apple-text-secondary);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.evidence-note {
  margin-top: var(--apple-space-3);
}

.boundary-band h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 650;
}

.boundary-band p {
  font-size: 0.9rem;
}

.result-band {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
}

.result-band .section-heading {
  align-items: center;
  margin-bottom: 0;
}

.result-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--apple-space-3);
}
.result-facts--compact {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--apple-space-2);
}
.result-facts--compact .result-fact {
  padding: var(--apple-space-2) var(--apple-space-3);
}
.compact-stage-summary {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-2);
  padding-top: var(--apple-space-3);
  border-top: 1px solid var(--apple-border);
}
.compact-stage-summary__head h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 650;
}
.compact-stage-summary__head p,
.compact-trace-note {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-3);
  font-size: 0.8rem;
  line-height: 1.45;
}
.trace-coverage--compact {
  padding: 0;
  background: transparent;
}

.result-fact {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-1);
  min-width: 0;
  padding: var(--apple-space-3);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  overflow-wrap: anywhere;
}

.result-fact strong {
  font-weight: 600;
}
.task-diagnostic {
  margin-bottom: var(--apple-space-3);
  padding: var(--apple-space-3);
  border-radius: var(--apple-radius);
  background: var(--apple-bg);
}

.task-diagnostic span {
  color: var(--apple-gray-3);
  font-size: 0.875rem;
}

.task-diagnostic p {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-2);
  overflow-wrap: anywhere;
}

.job-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--apple-space-3);
  flex-wrap: wrap;
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  background: var(--apple-bg);
}

.job-entry > div {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-1);
  min-width: 0;
  overflow-wrap: anywhere;
}

.job-entry code,
.result-fact code {
  font-family: var(--apple-font-mono);
  font-size: 0.85rem;
}

.algorithm-summary,
.operation-summary {
  max-width: 700px;
  padding: var(--apple-space-4);
  border-top: 1px solid var(--apple-border);
  border-bottom: 1px solid var(--apple-border);
}

.algorithm-summary__title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--apple-space-3);
}

.algorithm-summary__title h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 650;
}

.algorithm-metadata {
  display: flex;
  flex-wrap: wrap;
  gap: var(--apple-space-4);
  margin-top: var(--apple-space-3);
}

.algorithm-metadata span {
  display: flex;
  gap: var(--apple-space-2);
  color: var(--apple-gray-3);
}

.algorithm-metadata b {
  color: var(--apple-gray-1);
  font-weight: 600;
}

.algorithm-empty,
.operation-summary p {
  margin: var(--apple-space-2) 0 0;
  color: var(--apple-gray-3);
  line-height: 1.55;
}

@media (max-width: 900px) {
  .work-area {
    grid-template-columns: minmax(0, 1fr);
  }

  .mechanism-rail {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}

@media (max-width: 620px) {
  .section-band {
    padding: var(--apple-space-4);
  }

  .section-heading {
    flex-direction: column;
  }

  .locator-form,
  .result-facts,
  .mechanism-rail {
    grid-template-columns: minmax(0, 1fr);
  }
  .result-facts--compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .job-entry {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
