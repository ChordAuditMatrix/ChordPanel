<template>
  <section class="submission-card" :aria-label="t('audit.workbench.submission.title')">
    <header class="submission-card__head">
      <div class="submission-card__heading">
        <p class="submission-card__eyebrow">{{ t('audit.workbench.submission.eyebrow') }}</p>
        <h2 class="submission-card__title">{{ t('audit.workbench.submission.title') }}</h2>
      </div>
      <n-tag size="small" :bordered="false" :type="statusTagType">
        {{ snapshot?.snapshotLoaded ? statusLabel : t('audit.workbench.submission.statusLoading') }}
      </n-tag>
    </header>

    <p v-if="detailLoadFailed" class="submission-card__warn" role="status">
      {{ t('audit.workbench.submission.detailFailed') }}
    </p>
    <div v-if="errorCode || snapshot?.statusMessage" class="submission-card__message">
      <p v-if="errorCode" class="submission-card__error">
        {{ t('audit.workbench.submission.errorCode') }}: <code>{{ errorCode }}</code>
      </p>
      <div v-if="snapshot?.statusMessage" class="submission-card__status-message">
        <span class="submission-card__message-label">{{ t('audit.workbench.submission.statusMessage') }}</span>
        <JobStatusMessage :message="snapshot.statusMessage" />
      </div>
    </div>

    <dl class="submission-card__grid">
      <div class="submission-card__item">
        <dt>{{ t('audit.workbench.submission.jobId') }}</dt>
        <dd class="submission-card__value mono" :title="jobId">{{ jobId }}</dd>
      </div>
      <div class="submission-card__item">
        <dt>{{ t('audit.workbench.submission.algorithm') }}</dt>
        <dd class="submission-card__value algorithm-snapshot">
          <strong>{{ algorithmName }}</strong>
          <span v-if="algorithmNameFromCurrentCatalog" class="algorithm-snapshot__state">
            {{ t('execution.algorithmSelection.nameCurrentCatalog') }}
          </span>
          <span>
            {{ algorithmType }}
            <span v-if="algorithmTypeFromCurrentCatalog" class="algorithm-snapshot__state">
              · {{ t('execution.algorithmSelection.valueCurrentCatalog') }}
            </span>
          </span>
          <span>{{ t('execution.algorithmSelection.purpose') }} · {{ algorithmPurpose }}</span>
          <span v-if="algorithmVersionSummary" class="algorithm-snapshot__versions">
            {{ algorithmVersionSummary }}
          </span>
          <button
            v-if="algorithmSnapshot"
            type="button"
            class="algorithm-id-button"
            :title="algorithmDetailsTooltip"
            :aria-label="`${t('audit.workbench.submission.algorithmIdCopy')}: ${algorithmSnapshot}`"
            @click="copyAlgorithmId"
          >
            {{ algorithmCopied ? t('audit.workbench.submission.algorithmIdCopied') : t('audit.workbench.selection.algorithmId') }}
          </button>
          <span v-else class="algorithm-snapshot__state">
            {{ t('audit.workbench.submission.unavailable') }}
          </span>
          <span v-if="algorithmSelectionStatus" class="algorithm-snapshot__state">
            {{ algorithmSelectionStatus }}
          </span>
        </dd>
      </div>
      <div class="submission-card__item">
        <dt>{{ t('audit.workbench.submission.selectionMode') }}</dt>
        <dd class="submission-card__value">{{ selectionModeLabel }}</dd>
      </div>
      <div v-if="showStorage" class="submission-card__item">
        <dt>{{ t('audit.workbench.submission.storage') }}</dt>
        <dd class="submission-card__value mono" :title="storageNodeId ?? undefined">{{ storageText }}</dd>
      </div>
    </dl>
    <section class="submission-card__execution" :aria-label="t('audit.workbench.submission.executionSummary')">
      <div class="submission-card__execution-head">
        <h3>{{ t('audit.workbench.submission.executionSummary') }}</h3>
        <span class="submission-card__summary-source">{{ t('execution.stageDetails.sources.traceSummary') }}</span>
      </div>
      <p v-if="algorithmSelectionLoading && !compactSummary" class="submission-card__summary-note" role="status">
        {{ t('audit.workbench.submission.summaryLoading') }}
      </p>
      <p v-else-if="algorithmSelectionFailed || !compactSummary" class="submission-card__summary-note">
        {{ t('audit.workbench.submission.summaryUnavailable') }}
      </p>
      <template v-else>
        <p v-if="algorithmSelectionLoading" class="submission-card__summary-note" role="status">
          {{ t('audit.workbench.submission.summaryUpdating') }}
        </p>
        <div v-if="executionKind === 'challengeProof'" class="submission-card__verdict">
          <span>{{ t('execution.confidence.verified') }}</span>
          <strong>{{ compactVerificationVerdictLabel }}</strong>
        </div>
        <dl v-else-if="compactTagProgress.length" class="submission-card__progress">
          <div v-for="fact in compactTagProgress" :key="fact.key">
            <dt>{{ fact.label }}</dt>
            <dd class="mono">{{ fact.value }}</dd>
          </div>
        </dl>
        <p v-else class="submission-card__summary-note">
          {{ t('audit.workbench.submission.tagProgressUnavailable') }}
        </p>
        <div v-if="compactWorkerCoverageLabel" class="submission-card__coverage">
          <span>{{ t('audit.workbench.submission.workerCoverage') }}</span>
          <n-tag size="small" :bordered="false">{{ compactWorkerCoverageLabel }}</n-tag>
        </div>
      </template>
    </section>
    <section
      v-if="stageProjection.stages.length"
      class="submission-card__stage-rail"
      :aria-label="t('execution.stageRail.title')"
    >
      <h3>{{ t('execution.stageRail.title') }}</h3>
      <ExecutionStageRail
        :execution-kind="executionKind"
        :stages="stageProjection.stages"
        :dispatch-link="null"
        :settlement-link="null"
        :selected-stage-id="stageDisplayProjection.focus.stageId"
        :display-facts="stageDisplayProjection.facts.stages"
        :selectable="false"
      />
    </section>

    <div class="submission-card__actions">
      <n-button size="small" type="primary" @click="openExecution">{{ t('audit.workbench.submission.open') }}</n-button>
      <n-button size="small" @click="copyJobId">{{ copied ? t('common.copied') : t('audit.workbench.submission.copyJobId') }}</n-button>
      <n-button size="small" text @click="openJobs">{{ t('audit.workbench.submission.openJobs') }}</n-button>
    </div>

    <p class="submission-card__note">{{ t('audit.workbench.submission.snapshotNote') }}</p>

    <n-collapse v-if="$slots.raw" class="submission-card__raw">
      <n-collapse-item :title="t('audit.workbench.submission.raw')" name="raw">
        <slot name="raw" />
      </n-collapse-item>
    </n-collapse>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { useI18n } from '@/stores/i18n'
import { useJobTracking } from '@/stores/jobTracking'
import { coverageStateLabel, jobStatusLabel } from '@/utils/statusLabels'
import { useTraceSession } from '@/features/execution/data/useTraceSession'
import { projectExecutionStages } from '@/features/execution/data/executionStages'
import { projectExecutionDisplay } from '@/features/execution/data/executionDisplayProjection'
import ExecutionStageRail from '@/features/execution/components/ExecutionStageRail.vue'
import { jobStatusTagType } from '@/utils/jobStatus'
import JobStatusMessage from '@/components/JobStatusMessage.vue'
import type { TraceAlgorithmSelection } from '@/api/trace'
import { metadataText, resolveJobAlgorithmId, type AlgorithmSelectionMode } from './auditWorkbench'
import { projectAuditSubmissionSummary, type AuditSubmissionKind, type TagProgressKey } from './auditSubmissionSummary'

const props = withDefaults(defineProps<{
  jobId: string
  executionKind: AuditSubmissionKind
  /** Algorithm ID from the creation response; the Job metadata snapshot wins once loaded. */
  algorithmId?: string | null
  /** Mode returned by the creation route or chosen for the submitted request. */
  selectionMode?: AlgorithmSelectionMode | null
  /** Distinguishes the backend challenge response from a local request choice. */
  selectionModeSource?: 'request' | 'response'
  /** Tag generation only: the Storage target lives in this Job's own metadata. */
  showStorage?: boolean
}>(), { algorithmId: null, selectionMode: null, selectionModeSource: 'request', showStorage: false })

const { t } = useI18n()
const router = useRouter()
const message = useMessage()

const { algorithmEntitiesById, ensureAlgorithmsLoaded } = useReferenceCatalog()
const { snapshots } = useJobTracking()

const snapshot = computed(() => snapshots[props.jobId] ?? null)
const status = computed(() => snapshot.value?.status ?? '')
const traceSession = useTraceSession(() => props.jobId, {
  silent: true,
  pollingProfile: 'adaptive',
  resourceProfile: 'stageRail',
})
const traceSummary = computed(() => {
  const summary = traceSession.state.summary.data
  return summary?.jobId === props.jobId ? summary : null
})
const statusLabel = computed(() => jobStatusLabel(status.value, t))
const errorCode = computed(() => {
  const raw = snapshot.value?.errorCode
  if (typeof raw !== 'string') return null
  const normalized = raw.trim()
  return normalized && normalized.toLowerCase() !== 'none' ? normalized : null
})
const statusTagType = computed(() => snapshot.value?.snapshotLoaded ? jobStatusTagType(status.value) : 'default')
const detailLoadFailed = computed(() => snapshot.value?.detailLoadFailed === true)
const algorithmSelectionSnapshot = computed(() => traceSummary.value?.algorithmSelection ?? null)
const algorithmSelectionLoading = computed(() =>
  traceSession.state.initialLoading || traceSession.state.summary.loading,
)
const algorithmSelectionFailed = computed(() => traceSession.state.summary.error !== null)
// Trace names/types remain historical snapshots; only a missing name may use the current catalog.

const fallbackAlgorithmId = computed(() =>
  resolveJobAlgorithmId(props.algorithmId, snapshot.value?.metadata ?? null),
)
const algorithmSnapshot = computed(() => {
  const traceSnapshotId = algorithmSelectionSnapshot.value?.algorithmId?.trim()
  return traceSnapshotId && (!fallbackAlgorithmId.value || traceSnapshotId === fallbackAlgorithmId.value)
    ? traceSnapshotId
    : fallbackAlgorithmId.value
})
const matchedAlgorithmSelection = computed(() => {
  const selection = algorithmSelectionSnapshot.value
  if (!selection) return null
  return !fallbackAlgorithmId.value || selection.algorithmId === fallbackAlgorithmId.value ? selection : null
})
const snapshotAlgorithmName = computed(() => matchedAlgorithmSelection.value?.algorithmName?.trim() || null)
const catalogAlgorithm = computed(() => {
  const id = algorithmSnapshot.value
  return id ? algorithmEntitiesById.value.get(id) ?? null : null
})
const catalogAlgorithmName = computed(() => catalogAlgorithm.value?.algorithmName?.trim() || null)
const catalogAlgorithmType = computed(() => catalogAlgorithm.value?.algorithmType?.trim() || null)
const algorithmNameFromCurrentCatalog = computed(() =>
  !snapshotAlgorithmName.value && Boolean(catalogAlgorithmName.value),
)
const snapshotAlgorithmType = computed(() => matchedAlgorithmSelection.value?.algorithmType?.trim() || null)
const algorithmTypeFromCurrentCatalog = computed(() =>
  !snapshotAlgorithmType.value && Boolean(catalogAlgorithmType.value),
)
watch([algorithmSnapshot, snapshotAlgorithmName, snapshotAlgorithmType], ([id, snapshotName, snapshotType]) => {
  if (id && (!snapshotName || !snapshotType)) void ensureAlgorithmsLoaded()
}, { immediate: true })
const algorithmName = computed(() =>
  snapshotAlgorithmName.value
  || (algorithmNameFromCurrentCatalog.value ? catalogAlgorithmName.value : null)
  || t('execution.algorithmSelection.nameUnavailable'),
)
const algorithmType = computed(() =>
  snapshotAlgorithmType.value
  || (algorithmTypeFromCurrentCatalog.value ? catalogAlgorithmType.value : null)
  || t('execution.algorithmSelection.typeUnavailable'),
)
const algorithmPurpose = computed(() => {
  const purpose = matchedAlgorithmSelection.value?.purpose?.trim()
  if (purpose === 'Audit') return t('algorithm.workbench.purposeAudit')
  if (purpose === 'Identity') return t('algorithm.workbench.purposeIdentity')
  return purpose || t('execution.notAvailable')
})
const algorithmVersionSummary = computed(() => {
  const selection = matchedAlgorithmSelection.value
  if (!selection) return null
  const profileVersion = typeof selection.profileVersion === 'number'
    ? String(selection.profileVersion)
    : t('execution.notAvailable')
  const strategyVersion = selection.strategyVersion?.trim() || t('execution.notAvailable')
  return `${t('execution.algorithmSelection.profileVersion')} ${profileVersion} · ${t('execution.algorithmSelection.strategyVersion')} ${strategyVersion}`
})
const CAPABILITY_LABEL_KEYS: Record<string, string> = {
  BatchVerify: 'algorithm.workbench.capabilityBatchVerify',
  IdentityAuthentication: 'algorithm.workbench.capabilityIdentityAuthentication',
  DynamicUpdate: 'algorithm.workbench.capabilityDynamicUpdate',
}
const PARTY_LABEL_KEYS: Record<string, string> = {
  Public: 'algorithm.workbench.maintenancePartyPublic',
  TPA: 'algorithm.workbench.maintenancePartyTPA',
  CSP: 'algorithm.workbench.maintenancePartyCSP',
  User: 'algorithm.workbench.maintenancePartyUser',
  Shared: 'algorithm.workbench.maintenancePartyShared',
  None: 'algorithm.workbench.maintenancePartyNone',
}

function translatedValue(value: string, keys: Record<string, string>): string {
  const key = keys[value]
  if (!key) return value
  const translated = t(key)
  return translated === key ? value : translated
}

function snapshotModeLabel(mode: TraceAlgorithmSelection['mode']): string {
  if (!mode) return t('execution.notAvailable')
  const key = `execution.algorithmSelection.modes.${mode}`
  const translated = t(key)
  return translated === key ? mode : translated
}

const algorithmDetailsTooltip = computed(() => {
  const id = algorithmSnapshot.value
  if (!id) return ''
  const selection = matchedAlgorithmSelection.value
  const rows = [
    ...(algorithmNameFromCurrentCatalog.value
      ? [t('execution.algorithmSelection.nameCurrentCatalogNote')]
      : []),
    `${t('execution.algorithmSelection.algorithmId')}: ${id}`,
  ]
  if (selection) {
    const capabilities = selection.capabilities === null || selection.capabilities === undefined
      ? t('algorithm.workbench.capabilitiesUnknown')
      : selection.capabilities.length
        ? selection.capabilities.map(value => translatedValue(value, CAPABILITY_LABEL_KEYS)).join(', ')
        : t('algorithm.workbench.capabilitiesNone')
    rows.push(`${t('execution.algorithmSelection.mode')}: ${snapshotModeLabel(selection.mode)}`)
    rows.push(`${t('execution.algorithmSelection.capabilities')}: ${capabilities}`)
    if (typeof selection.capabilitiesMask === 'number') {
      rows.push(`${t('algorithm.workbench.capabilitiesMask')}: ${selection.capabilitiesMask}`)
    }
    if (selection.strategyKind) {
      const kindKey = selection.strategyKind === 'Static'
        ? 'algorithm.workbench.kindAuditStatic'
        : selection.strategyKind === 'Dynamic'
          ? 'algorithm.workbench.kindAuditDynamic'
          : null
      rows.push(`${t('execution.algorithmSelection.strategyKind')}: ${
        kindKey ? translatedValue(selection.strategyKind, { [selection.strategyKind]: kindKey }) : selection.strategyKind
      }`)
    }
    if (selection.stateMaintenanceParty) {
      rows.push(`${t('execution.algorithmSelection.stateMaintenanceParty')}: ${
        translatedValue(selection.stateMaintenanceParty, PARTY_LABEL_KEYS)
      }`)
    }
  }
  return rows.join('\n')
})
const algorithmSelectionStatus = computed(() => {
  if (algorithmSelectionLoading.value) return t('audit.workbench.submission.algorithmSnapshotLoading')
  if (algorithmSelectionFailed.value) return t('audit.workbench.submission.algorithmSnapshotUnavailable')
  if (algorithmSelectionSnapshot.value && !matchedAlgorithmSelection.value) {
    return t('audit.workbench.submission.algorithmSnapshotMismatch')
  }
  return matchedAlgorithmSelection.value
    ? ''
    : t('audit.workbench.submission.algorithmSnapshotUnavailable')
})
const compactSummary = computed(() =>
  projectAuditSubmissionSummary(props.jobId, props.executionKind, traceSummary.value),
)
const TAG_PROGRESS_LABEL_KEYS: Record<TagProgressKey, string> = {
  plannedPartCount: 'execution.tagGeneration.plannedParts',
  completedPartCount: 'execution.tagGeneration.completedParts',
  plannedBlockCount: 'execution.tagGeneration.plannedBlocks',
  generatedBlockCount: 'execution.tagGeneration.generatedBlocks',
  persistedCount: 'execution.tagGeneration.persisted',
  storageAccountedTagCount: 'execution.tagGeneration.storageAccountedTags',
}
const compactTagProgress = computed(() =>
  (compactSummary.value?.tagProgress ?? []).map(fact => ({
    ...fact,
    label: t(TAG_PROGRESS_LABEL_KEYS[fact.key]),
  })),
)
const compactVerificationVerdictLabel = computed(() => {
  const verdict = compactSummary.value?.verificationVerdict
  if (verdict === true) return t('execution.confidence.verifiedTrue')
  if (verdict === false) return t('execution.confidence.verifiedFalse')
  return t('audit.workbench.submission.resultUnknown')
})
const compactWorkerCoverageLabel = computed(() => {
  const coverage = compactSummary.value?.workerStageCoverage
  return coverage ? coverageStateLabel(coverage, t) : null
})

const storageNodeId = computed(() => metadataText(snapshot.value?.metadata ?? null, 'storageNodeId'))
const storageText = computed(() => {
  if (detailLoadFailed.value) return t('audit.workbench.submission.unavailable')
  if (!snapshot.value?.detailLoaded) return t('audit.workbench.submission.awaitingDetail')
  return storageNodeId.value ?? t('audit.workbench.submission.storageNotRecorded')
})
const compactStageKind = computed(() => {
  const summaryKind = traceSummary.value?.executionKind
  return summaryKind && summaryKind !== props.executionKind ? null : props.executionKind
})
const stageProjection = computed(() => projectExecutionStages(
  compactStageKind.value,
  traceSession.state.observations.data ?? [],
  { summary: traceSummary.value, links: traceSession.state.links.data ?? [] },
))
const stageDisplayProjection = computed(() => {
  const jobId = props.jobId
  return projectExecutionDisplay({
    activeJobId: jobId,
    kind: compactStageKind.value,
    stages: stageProjection.value.stages,
    observations: traceSession.state.observations.data ?? [],
    summary: traceSummary.value,
    parts: traceSession.state.parts.data ?? [],
    tasks: traceSession.tasks.value,
    storageNodeId: props.executionKind === 'tagGeneration' ? storageNodeId.value : null,
    communication: { jobId, confirmedPackets: [], peerCorrelations: [], localStages: [] },
    mode: 'live',
  })
})
const selectionModeLabel = computed(() => {
  if (algorithmSelectionSnapshot.value) {
    const mode = matchedAlgorithmSelection.value?.mode
    if (!mode) return t('audit.workbench.submission.modeUnknown')
    const key = `execution.algorithmSelection.modes.${mode}`
    const label = t(key)
    if (label === key) return t('audit.workbench.submission.modeUnknown')
    return `${label} · ${t('audit.workbench.submission.modeSourceSnapshot')}`
  }

  const mode = props.selectionMode
  if (!mode) return t('audit.workbench.submission.modeUnknown')
  const label = t(`audit.workbench.mode.${mode}`)
  const source = props.selectionModeSource === 'response'
    ? t('audit.workbench.submission.modeSourceResponse')
    : t('audit.workbench.submission.modeSourceRequest')
  return `${label} · ${source}`
})

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
const algorithmCopied = ref(false)
let algorithmCopiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyJobId() {
  try {
    await navigator.clipboard.writeText(props.jobId)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2000)
  } catch {
    message.error(t('common.operationFailed'))
  }
}

async function copyAlgorithmId() {
  const id = algorithmSnapshot.value
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
    algorithmCopied.value = true
    clearTimeout(algorithmCopiedTimer)
    algorithmCopiedTimer = setTimeout(() => { algorithmCopied.value = false }, 1600)
    message.success(t('audit.workbench.submission.algorithmIdCopied'))
  } catch {
    message.error(t('common.operationFailed'))
  }
}

function openExecution() {
  void router.push({ name: 'executionDetail', params: { jobId: props.jobId } })
}

function openJobs() {
  void router.push({ name: 'jobs' })
}

onBeforeUnmount(() => {
  clearTimeout(copiedTimer)
  clearTimeout(algorithmCopiedTimer)
})
</script>

<style scoped>
.submission-card {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-4);
  padding: var(--apple-space-5);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
  min-width: 0;
}

.submission-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--apple-space-4);
}

.submission-card__eyebrow {
  margin: 0 0 var(--apple-space-1);
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.submission-card__title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 16px;
  font-weight: 620;
  line-height: 1.35;
}

.submission-card__warn {
  margin: 0;
  color: var(--apple-orange);
  font-size: 12px;
}

.submission-card__message {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-2);
  padding: var(--apple-space-3);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  color: var(--apple-gray-2);
  font-size: 12px;
}

.submission-card__error,
.submission-card__status-message {
  margin: 0;
}

.submission-card__message-label {
  display: block;
  margin-bottom: var(--apple-space-1);
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 600;
}

.submission-card__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--apple-space-3);
  margin: 0;
}
.submission-card__execution {
  display: grid;
  gap: var(--apple-space-3);
  padding-top: var(--apple-space-3);
  border-top: 1px solid var(--apple-border);
}
.submission-card__stage-rail {
  display: grid;
  gap: var(--apple-space-3);
  min-width: 0;
  padding-top: var(--apple-space-3);
  border-top: 1px solid var(--apple-border);
}
.submission-card__stage-rail > h3 {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 650;
}
.submission-card__execution-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--apple-space-2);
}
.submission-card__execution-head h3 {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 650;
}
.submission-card__summary-source,
.submission-card__summary-note {
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.45;
}
.submission-card__summary-note { margin: 0; }
.submission-card__verdict,
.submission-card__coverage {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
}
.submission-card__verdict span,
.submission-card__coverage span {
  color: var(--apple-gray-3);
  font-size: 12px;
}
.submission-card__verdict strong {
  color: var(--apple-gray-1);
  font-size: 14px;
  font-weight: 650;
}
.submission-card__progress {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--apple-space-2);
  margin: 0;
}
.submission-card__progress > div {
  display: grid;
  gap: var(--apple-space-1);
  min-width: 0;
  padding: var(--apple-space-2) var(--apple-space-3);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}
.submission-card__progress dt {
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.35;
}
.submission-card__progress dd {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 14px;
  font-weight: 650;
}

.submission-card__item {
  min-width: 0;
}

.submission-card__item dt {
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}

.submission-card__value {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.algorithm-snapshot {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--apple-space-1);
}

.algorithm-snapshot strong {
  color: var(--apple-gray-1);
  font-weight: 620;
}

.algorithm-snapshot span {
  color: var(--apple-gray-3);
  font-size: 11px;
}

.algorithm-snapshot__state {
  color: var(--apple-gray-4) !important;
}
.algorithm-id-button {
  padding: 0;
  border: 0;
  color: var(--apple-blue);
  font: inherit;
  font-size: 11px;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  background: none;
  cursor: pointer;
}

.algorithm-id-button:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 3px;
}

.submission-card__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
}

.submission-card__note {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.5;
}

.submission-card__raw {
  border-top: 1px solid var(--apple-border);
  padding-top: var(--apple-space-3);
}

.mono {
  font-family: var(--apple-font-mono);
}

@media (max-width: 680px) {
  .submission-card__head {
    flex-direction: column;
    gap: var(--apple-space-2);
  }
}
</style>
