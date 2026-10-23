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
          <span>{{ algorithmType }}</span>
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
import { useI18n } from '@/stores/i18n'
import { useJobTracking } from '@/stores/jobTracking'
import { jobStatusLabel } from '@/utils/statusLabels'
import { jobStatusTagType } from '@/utils/jobStatus'
import JobStatusMessage from '@/components/JobStatusMessage.vue'
import { getTraceSummary, type TraceAlgorithmSelection } from '@/api/trace'
import { metadataText, resolveJobAlgorithmId, type AlgorithmSelectionMode } from './auditWorkbench'

const props = withDefaults(defineProps<{
  jobId: string
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
const { snapshots } = useJobTracking()

const snapshot = computed(() => snapshots[props.jobId] ?? null)
const status = computed(() => snapshot.value?.status ?? '')
const statusLabel = computed(() => jobStatusLabel(status.value, t))
const errorCode = computed(() => {
  const raw = snapshot.value?.errorCode
  if (typeof raw !== 'string') return null
  const normalized = raw.trim()
  return normalized && normalized.toLowerCase() !== 'none' ? normalized : null
})
const statusTagType = computed(() => snapshot.value?.snapshotLoaded ? jobStatusTagType(status.value) : 'default')
const detailLoadFailed = computed(() => snapshot.value?.detailLoadFailed === true)
const algorithmSelectionSnapshot = ref<TraceAlgorithmSelection | null>(null)
const algorithmSelectionLoading = ref(false)
const algorithmSelectionFailed = ref(false)
let algorithmSelectionRequestSequence = 0
// Historical names/types come only from the persisted Trace selection snapshot.
// The current algorithm catalog is intentionally not consulted here.

watch(() => props.jobId, async (jobId, _previous, onCleanup) => {
  const sequence = ++algorithmSelectionRequestSequence
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  algorithmSelectionSnapshot.value = null
  algorithmSelectionLoading.value = true
  algorithmSelectionFailed.value = false
  try {
    const summary = await getTraceSummary(jobId, { signal: controller.signal, silent: true })
    if (sequence !== algorithmSelectionRequestSequence) return
    if (summary.jobId === jobId) algorithmSelectionSnapshot.value = summary.algorithmSelection ?? null
    else algorithmSelectionFailed.value = true
  } catch {
    if (sequence === algorithmSelectionRequestSequence) algorithmSelectionFailed.value = true
  } finally {
    if (sequence === algorithmSelectionRequestSequence) algorithmSelectionLoading.value = false
  }
}, { immediate: true })

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
const algorithmName = computed(() =>
  matchedAlgorithmSelection.value?.algorithmName?.trim()
  || t('execution.algorithmSelection.nameUnavailable'),
)
const algorithmType = computed(() =>
  matchedAlgorithmSelection.value?.algorithmType?.trim()
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
  const rows = [`${t('execution.algorithmSelection.algorithmId')}: ${id}`]
  const selection = matchedAlgorithmSelection.value
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

const storageNodeId = computed(() => metadataText(snapshot.value?.metadata ?? null, 'storageNodeId'))
const storageText = computed(() => {
  if (detailLoadFailed.value) return t('audit.workbench.submission.unavailable')
  if (!snapshot.value?.detailLoaded) return t('audit.workbench.submission.awaitingDetail')
  return storageNodeId.value ?? t('audit.workbench.submission.storageNotRecorded')
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
  algorithmSelectionRequestSequence += 1
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
