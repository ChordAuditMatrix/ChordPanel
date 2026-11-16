<template>
  <div class="audit-source-change">
    <section class="operator-scope" :aria-label="t('audit.workbench.operations.scopeTitle')">
      <div class="operator-scope__field">
        <span class="operator-scope__label">{{ t('audit.ownerId') }}</span>
        <UserSelect v-model="ownerId" :placeholder="t('audit.selectOwner')" style="width: 100%" @change="sourceRevealErrors = true" />
        <p v-if="sourceOwnerError" id="source-owner-error" class="recovery-field-error" role="alert">
          {{ sourceOwnerError }}
        </p>
      </div>
      <div class="operator-scope__field">
        <span class="operator-scope__label">{{ t('audit.workbench.operations.operator') }}</span>
        <UserSelect v-model="operatorId" :placeholder="t('common.selectUser')" style="width: 100%" @change="sourceRevealErrors = true" />
        <p v-if="sourceOperatorError" id="source-operator-error" class="recovery-field-error" role="alert">
          {{ sourceOperatorError }}
        </p>
      </div>
      <p class="operator-scope__note">
        {{ t('audit.workbench.operations.operatorNote') }}
        {{ t('recovery.flow.sharedScope') }}
      </p>
    </section>

    <div class="flow-switch" role="tablist" :aria-label="t('recovery.flow.label')">
      <button
        v-for="flow in flows"
        :key="flow.key"
        :id="`audit-flow-tab-${flow.key}`"
        type="button"
        role="tab"
        :aria-selected="activeFlow === flow.key"
        :aria-controls="`audit-flow-panel-${flow.key}`"
        :class="[
          'flow-switch__option',
          { 'is-active': activeFlow === flow.key, 'is-privileged': flow.key === 'drift' },
        ]"
        @click="activeFlow = flow.key"
      >
        <span class="flow-switch__meta">
          <n-tag size="small" :type="flow.key === 'drift' ? 'warning' : 'info'" :bordered="false">
            {{ t(flow.tagKey) }}
          </n-tag>
        </span>
        <strong class="flow-switch__title">{{ t(flow.titleKey) }}</strong>
        <span class="flow-switch__description">{{ t(flow.descriptionKey) }}</span>
      </button>
    </div>

    <div
      v-show="activeFlow === 'notification'"
      id="audit-flow-panel-notification"
      role="tabpanel"
      aria-labelledby="audit-flow-tab-notification"
    >
      <WorkbenchSection
        :title="t('audit.workbench.sourceChange.title')"
        :description="t('audit.workbench.sourceChange.description')"
      >
        <div class="operation-grid">
          <div class="operation-form">
            <n-form label-placement="top" :show-feedback="false" @submit.prevent>
              <n-form-item :label="t('audit.workbench.sourceChange.notificationId')" required>
                <n-input
                  v-model:value="notificationId"
                  :placeholder="t('audit.workbench.sourceChange.notificationIdPlaceholder')"
                  :status="sourceNotificationError ? 'error' : undefined"
                  :input-props="sourceNotificationInputProps"
                  autocomplete="off"
                  spellcheck="false"
                  @blur="sourceRevealErrors = true"
                />
                <p
                  v-if="sourceNotificationError"
                  id="source-notification-error"
                  class="recovery-field-error"
                  role="alert"
                >
                  {{ sourceNotificationError }}
                </p>
              </n-form-item>
            </n-form>

            <div class="scope-block">
              <p class="scope-block__label">{{ t('recovery.scope.label') }}</p>
              <n-radio-group :value="sourceScope ?? null" @update:value="setSourceScope">
                <n-radio-button value="cells">{{ t('recovery.scope.cells') }}</n-radio-button>
                <n-radio-button value="whole-file">{{ t('recovery.scope.wholeFile') }}</n-radio-button>
              </n-radio-group>
              <p
                v-if="sourceScope === null"
                class="operation-hint"
                role="alert"
              >
                {{ t('recovery.scope.required') }}
              </p>
              <p v-else-if="sourceScope === 'cells'" class="operation-hint">
                {{ t('recovery.scope.cellsHint') }}
              </p>
              <n-alert
                v-else
                type="warning"
                :show-icon="true"
                class="operation-warning"
              >
                {{ t('recovery.scope.wholeFileWarning') }}
              </n-alert>
            </div>

            <SourceChangeCellsEditor
              v-if="sourceScope === 'cells'"
              v-model="cellDrafts"
              :disabled="sourceLoading"
              :reveal-errors="sourceRevealErrors"
            />
            <p
              v-if="sourceScope === 'cells' && sourceCellSummaryText"
              class="operation-hint scope-block__summary"
            >
              {{ sourceCellSummaryText }}
            </p>
            <p v-else-if="sourceScope === 'whole-file'" class="operation-hint">
              {{ t('recovery.scope.summaryWholeFile') }}
            </p>

            <div class="operation-actions">
              <n-button
                type="primary"
                :loading="sourceLoading"
                :disabled="!sourceCanSubmit"
                @click="openSourceConfirm"
              >
                {{ t('audit.workbench.sourceChange.submit') }}
              </n-button>
              <p v-if="sourceBlockedReason" class="recovery-blocked" role="status">
                {{ t('recovery.form.blocked', { reason: sourceBlockedReason }) }}
              </p>
            </div>
          </div>

          <aside class="operation-aside">
            <p class="operation-aside__title">{{ t('audit.workbench.operations.impact') }}</p>
            <ul class="operation-aside__list">
              <li v-if="sourceScope === 'cells'">{{ t('recovery.scope.cellsImpact') }}</li>
              <li v-else-if="sourceScope === 'whole-file'">{{ t('recovery.scope.wholeFileImpact') }}</li>
              <li v-else>{{ t('recovery.scope.chooseImpact') }}</li>
              <li>{{ t('audit.workbench.sourceChange.idempotency') }}</li>
              <li>{{ t('audit.workbench.operations.accepted202') }}</li>
            </ul>
          </aside>
        </div>

        <AuditOperationResult
          :title="t('audit.workbench.sourceChange.resultTitle')"
          :facts="sourceFacts"
          :result="sourceResult"
          :error="sourceError"
          :job-id="sourceJobId"
          :notice="sourceResult ? t('audit.workbench.operations.accepted202Result') : ''"
          :notes="sourceResult ? [t('audit.workbench.sourceChange.resultNote')] : []"
          :outcome="sourceOutcomeKind"
          :headline="sourceHeadline"
          :submission="sourceSubmission"
        />

        <RecoveryConfirmModal
          v-model:show="sourceConfirmOpen"
          :title="t(SOURCE_CHANGE_CONFIRM_TITLE_KEY)"
          :targets="sourceConfirmTargets"
          :consequences="sourceConfirmConsequences"
          :ack-label="t(SOURCE_CHANGE_ACK_KEY)"
          :confirm-label="t('audit.workbench.sourceChange.submit')"
          :notice="sourceConfirmNotice"
          notice-type="warning"
          :loading="sourceLoading"
          @confirm="submitSourceChange"
        />
      </WorkbenchSection>
    </div>

    <div
      v-show="activeFlow === 'drift'"
      id="audit-flow-panel-drift"
      role="tabpanel"
      aria-labelledby="audit-flow-tab-drift"
    >
      <WorkbenchSection
        :title="t('audit.workbench.drift.title')"
        :description="t('audit.workbench.drift.description')"
      >
        <n-alert type="warning" :show-icon="true" class="operation-warning">
          {{ t('audit.workbench.drift.warning') }}
        </n-alert>

        <RecoveryReportPrefill
          mode="drift"
          :report="driftReport"
          :owner-id="ownerId"
          :applied="driftReportApplied"
          @apply="applyDriftReport"
        />

        <div class="operation-grid">
          <div class="operation-form">
            <n-form label-placement="top" :show-feedback="false" @submit.prevent>
              <n-form-item :label="t('audit.workbench.drift.recoveryId')" required>
                <n-input
                  v-model:value="recoveryId"
                  :placeholder="t('recovery.source.recoveryIdPlaceholder')"
                  :status="driftRecoveryError ? 'error' : undefined"
                  :input-props="driftRecoveryInputProps"
                  autocomplete="off"
                  spellcheck="false"
                  @blur="driftTouched.recoveryId = true"
                />
                <p
                  v-if="driftRecoveryError"
                  id="drift-recovery-error"
                  class="recovery-field-error"
                  role="alert"
                >
                  {{ driftRecoveryError }}
                </p>
              </n-form-item>
              <n-form-item :label="t('audit.workbench.drift.driftRevision')" required>
                <n-input-number
                  v-model:value="driftRevision"
                  :min="1"
                  :precision="0"
                  :show-button="false"
                  :placeholder="t('audit.workbench.drift.driftRevisionPlaceholder')"
                  :status="driftRevisionError ? 'error' : undefined"
                  :input-props="driftRevisionInputProps"
                  style="width: 100%"
                  @blur="driftTouched.revision = true"
                />
                <p
                  v-if="driftRevisionError"
                  id="drift-revision-error"
                  class="recovery-field-error"
                  role="alert"
                >
                  {{ driftRevisionError }}
                </p>
              </n-form-item>
            </n-form>
            <p class="operation-hint">{{ t('audit.workbench.drift.identityHint') }}</p>
            <div class="operation-actions">
              <n-button
                type="warning"
                :loading="driftLoading"
                :disabled="!driftCanSubmit"
                @click="openDriftConfirm"
              >
                {{ t('audit.workbench.drift.submit') }}
              </n-button>
              <p v-if="driftBlockedReason" class="recovery-blocked" role="status">
                {{ t('recovery.form.blocked', { reason: driftBlockedReason }) }}
              </p>
            </div>
          </div>

          <aside class="operation-aside">
            <p class="operation-aside__title">{{ t('audit.workbench.operations.impact') }}</p>
            <ul class="operation-aside__list">
              <li>{{ t('audit.workbench.drift.impactDecision') }}</li>
              <li>{{ t('audit.workbench.drift.impactIsolation') }}</li>
              <li>{{ t('audit.workbench.drift.impactRecovery') }}</li>
              <li>{{ t('audit.workbench.drift.conflictHint') }}</li>
            </ul>
          </aside>
        </div>

        <AuditOperationResult
          :title="t('audit.workbench.drift.resultTitle')"
          :facts="driftFacts"
          :result="driftResult"
          :error="driftError"
          :notice="driftResult ? t('audit.workbench.drift.resultNote') : ''"
          :outcome="driftOutcomeKind"
          :headline="driftHeadline"
          :submission="driftSubmission"
        />

        <RecoveryConfirmModal
          v-model:show="driftConfirmOpen"
          :title="t(DRIFT_CONFIRM_TITLE_KEY)"
          :targets="driftConfirmTargets"
          :consequences="driftConfirmConsequences"
          :ack-label="t(DRIFT_ACK_KEY)"
          :confirm-label="t('audit.workbench.drift.submit')"
          :notice="t('audit.workbench.drift.warning')"
          notice-type="warning"
          tone="warning"
          :loading="driftLoading"
          @confirm="submitDriftApproval"
        />
      </WorkbenchSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NRadioButton,
  NRadioGroup,
  NTag,
  useMessage,
} from 'naive-ui'
import { approveSourceDriftBaseline, createSourceChangeJob } from '@/api/auditData'
import UserSelect from '@/components/UserSelect.vue'
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import RecoveryConfirmModal from '@/features/recovery/RecoveryConfirmModal.vue'
import RecoveryReportPrefill from '@/features/recovery/RecoveryReportPrefill.vue'
import {
  DRIFT_ACK_KEY,
  DRIFT_CONFIRM_TITLE_KEY,
  SOURCE_CHANGE_ACK_KEY,
  SOURCE_CHANGE_CONFIRM_TITLE_KEY,
  createDriftTargetSnapshot,
  createSourceChangeCellDraft,
  createSourceChangeSnapshot,
  driftConsequenceKeys,
  driftReportMatches,
  driftSnapshotFacts,
  driftSubmission as buildDriftSubmission,
  manualOrigin,
  originFromDriftReport,
  planDriftReportPrefill,
  sourceChangeCellsToTuples,
  sourceChangeConsequenceKeys,
  sourceChangeSnapshotFacts,
  sourceChangeSubmission,
  type DriftRecoveryReport,
  type DriftTargetSnapshot,
  type RecoveryInputAriaProps,
  type SourceChangeCellDraft,
  type SourceChangeScope,
  type SourceChangeTargetSnapshot,
} from '@/features/recovery/recoveryFlow'
import { useI18n } from '@/stores/i18n'
import { trackJob } from '@/stores/jobTracking'
import AuditOperationResult from './AuditOperationResult.vue'
import SourceChangeCellsEditor from './SourceChangeCellsEditor.vue'
import {
  driftApprovalFacts,
  operationErrorMessage,
  sourceChangeFacts,
  sourceChangeIdentityError,
  type OperationFact,
} from './auditOperations'

const props = withDefaults(defineProps<{
  ownerId: string
  /** Optional same-source drift report; absent means the explicit manual path. */
  driftReport?: DriftRecoveryReport | null
}>(), {
  driftReport: null,
})

const emit = defineEmits<{ 'update:ownerId': [value: string] }>()
const { t } = useI18n()
const message = useMessage()

const ownerId = computed({
  get: () => props.ownerId,
  set: (value: string) => emit('update:ownerId', value),
})
const operatorId = ref('1')

const flows = [
  {
    key: 'notification',
    tagKey: 'recovery.flow.notificationTag',
    titleKey: 'recovery.flow.notification',
    descriptionKey: 'recovery.flow.notificationDescription',
  },
  {
    key: 'drift',
    tagKey: 'recovery.flow.driftTag',
    titleKey: 'recovery.flow.drift',
    descriptionKey: 'recovery.flow.driftDescription',
  },
] as const
type AuditFlow = (typeof flows)[number]['key']
const activeFlow = ref<AuditFlow>('notification')

const notificationId = ref('')
const sourceScope = ref<SourceChangeScope | null>(null)
const cellDrafts = ref<SourceChangeCellDraft[]>([])
const sourceLoading = ref(false)
const sourceRevealErrors = ref(false)
const sourceConfirmOpen = ref(false)
const sourceDraftSnapshot = ref<SourceChangeTargetSnapshot | null>(null)
let sourceRequestSequence = 0

interface SourceOutcome {
  snapshot: SourceChangeTargetSnapshot
  result: Record<string, unknown> | null
  error: string
}
const sourceOutcome = ref<SourceOutcome | null>(null)

const recoveryId = ref('')
const driftRevision = ref<number | null>(null)
const driftLoading = ref(false)
const driftRevealErrors = ref(false)
const driftTouched = ref({ recoveryId: false, revision: false })
const driftConfirmOpen = ref(false)
const driftDraftSnapshot = ref<DriftTargetSnapshot | null>(null)
const appliedDriftReport = ref<DriftRecoveryReport | null>(null)
let driftRequestSequence = 0

interface DriftOutcome {
  snapshot: DriftTargetSnapshot
  result: Record<string, unknown> | null
  error: string
}
const driftOutcome = ref<DriftOutcome | null>(null)

watch(() => props.driftReport, () => {
  appliedDriftReport.value = null
})

const cellState = computed(() => sourceChangeCellsToTuples(cellDrafts.value))
const sourceCellSummaryText = computed(() => {
  const state = cellState.value
  return state.ok
    ? t('recovery.scope.summaryCells', {
      count: state.tuples.length,
      bytes: state.payloadBytes,
    })
    : ''
})

const sourceIdentityIssue = computed(() =>
  sourceChangeIdentityError(ownerId.value.trim(), notificationId.value.trim()))

const sourceOwnerError = computed(() => {
  if (!sourceRevealErrors.value) return ''
  const issue = sourceIdentityIssue.value
  return issue === 'audit.workbench.sourceChange.errors.ownerRequired'
    || issue === 'audit.workbench.sourceChange.errors.ownerTooLong'
    ? t(issue)
    : ''
})

const sourceNotificationError = computed(() => {
  if (!sourceRevealErrors.value) return ''
  const issue = sourceIdentityIssue.value
  return issue === 'audit.workbench.sourceChange.errors.notificationIdRequired'
    || issue === 'audit.workbench.sourceChange.errors.notificationIdTooLong'
    || issue === 'audit.workbench.sourceChange.errors.identityTooLong'
    ? t(issue)
    : ''
})

const sourceOperatorError = computed(() =>
  sourceRevealErrors.value && !operatorId.value.trim()
    ? t('audit.workbench.operations.operatorRequired')
    : '')

const sourceNotificationInputProps = computed<RecoveryInputAriaProps>(() => {
  if (!sourceNotificationError.value) return {}
  return { 'aria-invalid': 'true', 'aria-describedby': 'source-notification-error' }
})

const sourceBlockedReason = computed(() => {
  const identityIssue = sourceIdentityIssue.value
  if (identityIssue) return t(identityIssue)
  if (!operatorId.value.trim()) return t('audit.workbench.operations.operatorRequired')
  if (sourceScope.value === null) return t('recovery.scope.required')
  const cells = cellState.value
  if (sourceScope.value === 'cells' && !cells.ok) {
    return t(cells.errorKey, cells.errorParams)
  }
  return ''
})

const sourceCanSubmit = computed(() => sourceBlockedReason.value === '')

const sourceResult = computed(() => sourceOutcome.value?.result ?? null)
const sourceError = computed(() => sourceOutcome.value?.error ?? '')
const sourceFacts = computed<OperationFact[]>(() =>
  sourceResult.value ? sourceChangeFacts(sourceResult.value, t) : [])
const sourceJobId = computed(() => {
  const jobId = sourceResult.value?.jobId
  return typeof jobId === 'string' && jobId.trim() !== '' ? jobId.trim() : null
})
const sourceSubmission = computed(() => sourceOutcome.value
  ? sourceChangeSubmission(sourceOutcome.value.snapshot, t)
  : null)
const sourceOutcomeKind = computed(() =>
  sourceOutcome.value?.result ? 'accepted' as const : undefined)
const sourceHeadline = computed(() =>
  sourceOutcome.value?.result ? t('audit.workbench.sourceChange.submitted') : '')

const sourceConfirmTargets = computed(() => sourceDraftSnapshot.value
  ? sourceChangeSnapshotFacts(sourceDraftSnapshot.value, t)
  : [])
const sourceConfirmConsequences = computed(() => sourceDraftSnapshot.value
  ? sourceChangeConsequenceKeys(sourceDraftSnapshot.value).map(key => t(key))
  : [])
const sourceConfirmNotice = computed(() =>
  sourceDraftSnapshot.value?.scope === 'whole-file'
    ? t('recovery.scope.wholeFileWarning')
    : '')

const driftReportApplied = computed(() => {
  const report = appliedDriftReport.value
  return report
    ? driftReportMatches(report, ownerId.value, recoveryId.value, driftRevision.value)
    : false
})
const driftOrigin = computed(() => {
  const report = appliedDriftReport.value
  return report && driftReportMatches(report, ownerId.value, recoveryId.value, driftRevision.value)
    ? originFromDriftReport(report)
    : manualOrigin()
})

const driftRecoveryError = computed(() => {
  if (!driftRevealErrors.value && !driftTouched.value.recoveryId) return ''
  return recoveryId.value.trim() ? '' : t('audit.workbench.drift.recoveryRequired')
})
const driftRevisionError = computed(() => {
  if (!driftRevealErrors.value && !driftTouched.value.revision) return ''
  const revision = driftRevision.value
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision > 0
    ? ''
    : t('audit.workbench.drift.revisionRequired')
})
const driftRecoveryInputProps = computed<RecoveryInputAriaProps>(() =>
  driftRecoveryError.value
    ? { 'aria-invalid': 'true', 'aria-describedby': 'drift-recovery-error' }
    : {})
const driftRevisionInputProps = computed<RecoveryInputAriaProps>(() =>
  driftRevisionError.value
    ? { 'aria-invalid': 'true', 'aria-describedby': 'drift-revision-error' }
    : {})

const driftBlockedReason = computed(() => {
  if (!ownerId.value.trim()) return t('audit.selectOwnerWarn')
  if (!operatorId.value.trim()) return t('audit.workbench.operations.operatorRequired')
  if (!recoveryId.value.trim()) return t('audit.workbench.drift.recoveryRequired')
  const revision = driftRevision.value
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision <= 0) {
    return t('audit.workbench.drift.revisionRequired')
  }
  return ''
})
const driftCanSubmit = computed(() => driftBlockedReason.value === '')

const driftResult = computed(() => driftOutcome.value?.result ?? null)
const driftError = computed(() => driftOutcome.value?.error ?? '')
const driftFacts = computed<OperationFact[]>(() =>
  driftResult.value ? driftApprovalFacts(driftResult.value, t) : [])
const driftSubmission = computed(() => driftOutcome.value
  ? buildDriftSubmission(driftOutcome.value.snapshot, t)
  : null)
const driftOutcomeKind = computed(() =>
  driftOutcome.value?.result ? 'succeeded' as const : undefined)
const driftHeadline = computed(() =>
  driftOutcome.value?.result ? t('audit.workbench.drift.approved') : '')
const driftConfirmTargets = computed(() => driftDraftSnapshot.value
  ? driftSnapshotFacts(driftDraftSnapshot.value, t)
  : [])
const driftConfirmConsequences = computed(() => driftConsequenceKeys().map(key => t(key)))

function setSourceScope(value: string | number | boolean) {
  if (value !== 'cells' && value !== 'whole-file') return
  sourceScope.value = value
  if (value === 'cells' && cellDrafts.value.length === 0) {
    cellDrafts.value = [createSourceChangeCellDraft()]
  }
}

function openSourceConfirm() {
  sourceRevealErrors.value = true
  if (sourceBlockedReason.value) {
    message.warning(sourceBlockedReason.value)
    return
  }
  const built = createSourceChangeSnapshot({
    ownerId: ownerId.value,
    operatorId: operatorId.value,
    notificationId: notificationId.value,
    scope: sourceScope.value,
    cells: cellDrafts.value,
  })
  if (!built.ok) {
    message.warning(t(built.errorKey, built.errorParams))
    return
  }
  sourceDraftSnapshot.value = built.snapshot
  sourceConfirmOpen.value = true
}

async function submitSourceChange() {
  const snapshot = sourceDraftSnapshot.value
  sourceConfirmOpen.value = false
  if (!snapshot) return
  const requestSequence = ++sourceRequestSequence
  sourceOutcome.value = { snapshot, result: null, error: '' }
  sourceLoading.value = true
  try {
    const response = await createSourceChangeJob(
      snapshot.ownerId,
      snapshot.notificationId,
      snapshot.scope === 'cells'
        ? snapshot.tuples.map(tuple => ({ ...tuple }))
        : undefined,
      snapshot.operatorId,
    )
    if (requestSequence !== sourceRequestSequence) return
    sourceOutcome.value = { snapshot, result: { ...response }, error: '' }
    if (response.jobId) trackJob(response.jobId, 'Audit')
    message.success(t('audit.workbench.sourceChange.submitted'))
  } catch (error) {
    if (requestSequence !== sourceRequestSequence) return
    sourceOutcome.value = {
      snapshot,
      result: null,
      error: operationErrorMessage(error),
    }
  } finally {
    if (requestSequence === sourceRequestSequence) {
      sourceLoading.value = false
      sourceDraftSnapshot.value = null
    }
  }
}

function applyDriftReport() {
  const plan = planDriftReportPrefill(props.driftReport, ownerId.value)
  if (plan.status !== 'available' || !plan.report) {
    message.warning(plan.status === 'owner-mismatch'
      ? t('recovery.source.ownerMismatchDetail', {
        reportOwner: plan.report?.ownerId ?? '',
        owner: ownerId.value.trim() || t('recovery.source.ownerUnset'),
      })
      : t('recovery.source.invalid'))
    return
  }
  ownerId.value = plan.report.ownerId
  recoveryId.value = plan.report.recoveryId
  driftRevision.value = plan.report.driftRevision
  appliedDriftReport.value = plan.report
}

function openDriftConfirm() {
  driftRevealErrors.value = true
  driftTouched.value = { recoveryId: true, revision: true }
  if (driftBlockedReason.value) {
    message.warning(driftBlockedReason.value)
    return
  }
  const built = createDriftTargetSnapshot({
    ownerId: ownerId.value,
    operatorId: operatorId.value,
    recoveryId: recoveryId.value,
    driftRevision: driftRevision.value,
    origin: driftOrigin.value,
  })
  if (!built.ok) {
    message.warning(t(built.errorKey, built.errorParams))
    return
  }
  driftDraftSnapshot.value = built.snapshot
  driftConfirmOpen.value = true
}

async function submitDriftApproval() {
  const snapshot = driftDraftSnapshot.value
  driftConfirmOpen.value = false
  if (!snapshot) return
  const requestSequence = ++driftRequestSequence
  driftOutcome.value = { snapshot, result: null, error: '' }
  driftLoading.value = true
  try {
    const response = await approveSourceDriftBaseline(
      snapshot.ownerId,
      snapshot.recoveryId,
      snapshot.driftRevision,
      snapshot.operatorId,
    )
    if (requestSequence !== driftRequestSequence) return
    driftOutcome.value = { snapshot, result: { ...response }, error: '' }
    message.success(t('audit.workbench.drift.approved'))
  } catch (error) {
    if (requestSequence !== driftRequestSequence) return
    driftOutcome.value = {
      snapshot,
      result: null,
      error: operationErrorMessage(error),
    }
  } finally {
    if (requestSequence === driftRequestSequence) {
      driftLoading.value = false
      driftDraftSnapshot.value = null
    }
  }
}
</script>

<style scoped>
.audit-source-change {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  min-width: 0;
}
.operator-scope {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: var(--apple-space-3);
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
}
.operator-scope__field {
  flex: 1 1 220px;
  min-width: 0;
}
.operator-scope__label {
  display: block;
  margin-bottom: 4px;
  color: var(--apple-gray-4);
  font-size: 11.5px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.operator-scope__note {
  flex: 1 1 100%;
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.5;
}
.flow-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--apple-space-3);
  min-width: 0;
}
.flow-switch__option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.flow-switch__option:hover,
.flow-switch__option:focus-visible {
  border-color: var(--apple-blue);
}
.flow-switch__option.is-active {
  border-color: var(--apple-blue);
  box-shadow: inset 0 0 0 1px var(--apple-blue);
}
.flow-switch__option.is-privileged.is-active {
  border-color: var(--apple-orange, #c77700);
  box-shadow: inset 0 0 0 1px var(--apple-orange, #c77700);
}
.flow-switch__meta {
  display: flex;
  align-items: center;
}
.flow-switch__title {
  color: var(--apple-gray-1);
  font-size: 14px;
  font-weight: 620;
}
.flow-switch__description {
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.5;
}
.operation-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(250px, 0.75fr);
  gap: var(--apple-space-5);
  align-items: start;
}
.operation-form {
  min-width: 0;
}
/* Naive omits the feedback row when :show-feedback="false", and with it the only
   vertical gap between stacked controls. Restore an explicit rhythm. */
.audit-source-change :deep(.n-form-item) {
  margin-bottom: var(--apple-space-4);
}
/* Validation copy lives inside the form item (there is no feedback slot), so the
   blank must stack control and message instead of laying them out side by side. */
.audit-source-change :deep(.n-form-item-blank) {
  flex-direction: column;
  align-items: stretch;
}
.operation-hint {
  margin: 0 0 var(--apple-space-3);
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.operation-warning {
  margin-bottom: var(--apple-space-3);
}
.operation-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-3);
  margin-top: var(--apple-space-4);
}
.scope-block {
  margin-bottom: var(--apple-space-4);
}
.scope-block__label {
  margin: 0 0 var(--apple-space-2);
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 620;
}
.scope-block__summary {
  margin-top: var(--apple-space-2);
}
.scope-block .operation-hint,
.scope-block .operation-warning {
  margin-top: var(--apple-space-2);
}
.recovery-field-error {
  margin: 4px 0 0;
  color: var(--apple-red, #c0392b);
  font-size: 11.5px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.recovery-blocked {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.45;
}
.operation-aside {
  min-width: 0;
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
}
.operation-aside__title {
  margin: 0 0 var(--apple-space-2);
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 620;
}
.operation-aside__list {
  margin: 0;
  padding-left: 18px;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 880px) {
  .operation-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .flow-switch {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 640px) {
  .operator-scope {
    padding: var(--apple-space-3);
  }
}
</style>
