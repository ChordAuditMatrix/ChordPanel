<template>
  <div class="ownership-refresh">
    <WorkbenchSection
      :title="t('ownership.workbench.refresh.title')"
      :description="t('ownership.workbench.refresh.description')"
    >
      <n-alert type="warning" :show-icon="true" class="refresh-warning">
        {{ t('ownership.workbench.refresh.warning') }}
      </n-alert>

      <RecoveryReportPrefill
        mode="refresh"
        :report="refreshReport"
        :owner-id="ownerId"
        :applied="refreshReportApplied"
        @apply="applyRefreshReport"
      />

      <div class="refresh-grid">
        <div class="refresh-form">
          <n-form label-placement="top" :show-feedback="false" @submit.prevent>
            <n-form-item :label="t('ownership.ownerId')" required>
              <UserSelect v-model="ownerId" :placeholder="t('ownership.selectOwner')" style="width: 100%" @change="revealErrors = true" />
              <p v-if="ownerError" id="refresh-owner-error" class="refresh-field-error" role="alert">
                {{ ownerError }}
              </p>
            </n-form-item>
            <n-form-item :label="t('audit.workbench.operations.operator')" required>
              <UserSelect v-model="operatorId" :placeholder="t('common.selectUser')" style="width: 100%" @change="revealErrors = true" />
              <p v-if="operatorError" id="refresh-operator-error" class="refresh-field-error" role="alert">
                {{ operatorError }}
              </p>
            </n-form-item>
            <n-form-item :label="t('ownership.workbench.refresh.pendingRevision')" required>
              <n-input-number
                v-model:value="pendingRevision"
                :min="0"
                :precision="0"
                :show-button="false"
                :placeholder="t('ownership.workbench.refresh.pendingRevisionPlaceholder')"
                :status="revisionError ? 'error' : undefined"
                :input-props="revisionInputProps"
                style="width: 100%"
                @blur="refreshTouched.revision = true"
              />
              <p v-if="revisionError" id="refresh-revision-error" class="refresh-field-error" role="alert">
                {{ revisionError }}
              </p>
            </n-form-item>
            <n-form-item :label="t('ownership.workbench.refresh.reason')" required>
              <n-input
                v-model:value="reason"
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 6 }"
                :placeholder="t('ownership.workbench.refresh.reasonPlaceholder')"
                :status="reasonError ? 'error' : undefined"
                :input-props="reasonInputProps"
                @blur="refreshTouched.reason = true"
              />
              <p v-if="reasonError" id="refresh-reason-error" class="refresh-field-error" role="alert">
                {{ reasonError }}
              </p>
            </n-form-item>
          </n-form>
          <p class="refresh-hint">{{ t('ownership.workbench.refresh.revisionHint') }}</p>
          <p class="refresh-hint">{{ t('audit.workbench.operations.operatorNote') }}</p>
          <div class="refresh-actions">
            <n-button
              type="warning"
              :loading="loading"
              :disabled="!canSubmit"
              @click="openConfirm"
            >
              {{ t('ownership.workbench.refresh.submit') }}
            </n-button>
            <p v-if="blockedReason" class="refresh-blocked" role="status">
              {{ t('recovery.form.blocked', { reason: blockedReason }) }}
            </p>
          </div>
        </div>

        <aside class="refresh-aside">
          <p class="refresh-aside__title">{{ t('audit.workbench.operations.impact') }}</p>
          <ul class="refresh-aside__list">
            <li>{{ t('ownership.workbench.refresh.impactReArm') }}</li>
            <li>{{ t('ownership.workbench.refresh.impactNoMutation') }}</li>
            <li>{{ t('ownership.workbench.refresh.impactNotAutomatic') }}</li>
            <li>{{ t('ownership.workbench.refresh.impactRevision') }}</li>
          </ul>
        </aside>
      </div>

      <OwnershipResultPanel
        v-if="outcome && (outcome.result || outcome.error)"
        :title="t('ownership.workbench.refresh.resultTitle')"
        :facts="facts"
        :result="outcome.result"
        :error="outcome.error"
        :notes="notes"
        filename="ownership-refresh-retry.json"
        :outcome="outcomeKind"
        :headline="headline"
        :headline-label="headlineLabel"
        :submission="submission"
      />

      <RecoveryConfirmModal
        v-model:show="confirmOpen"
        :title="t(REFRESH_CONFIRM_TITLE_KEY)"
        :targets="confirmTargets"
        :consequences="confirmConsequences"
        :ack-label="t(REFRESH_ACK_KEY)"
        :confirm-label="t('ownership.workbench.refresh.submit')"
        :notice="t('ownership.workbench.refresh.warning')"
        notice-type="warning"
        tone="warning"
        :loading="loading"
        @confirm="submitRetry"
      />
    </WorkbenchSection>
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
  useMessage,
} from 'naive-ui'
import { retryOwnershipRefresh } from '@/api/ownership'
import UserSelect from '@/components/UserSelect.vue'
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import RecoveryConfirmModal from '@/features/recovery/RecoveryConfirmModal.vue'
import RecoveryReportPrefill from '@/features/recovery/RecoveryReportPrefill.vue'
import {
  REFRESH_ACK_KEY,
  REFRESH_CONFIRM_TITLE_KEY,
  classifyRefreshRetry,
  createRefreshTargetSnapshot,
  manualOrigin,
  originFromRefreshReport,
  planRefreshReportPrefill,
  refreshConsequenceKeys,
  refreshReportMatches,
  refreshSnapshotFacts,
  refreshSubmission,
  type RefreshFailureReport,
  type RefreshTargetSnapshot,
  type RecoveryInputAriaProps,
} from '@/features/recovery/recoveryFlow'
import { useI18n } from '@/stores/i18n'
import OwnershipResultPanel from './OwnershipResultPanel.vue'
import { refreshRetryFacts, requestErrorMessage } from './ownershipWorkbench'

const props = withDefaults(defineProps<{
  /** Optional same-source refresh failure report; absent means the explicit manual path. */
  refreshReport?: RefreshFailureReport | null
}>(), {
  refreshReport: null,
})

const { t } = useI18n()
const message = useMessage()

const ownerId = ref('')
const operatorId = ref('1')
const pendingRevision = ref<number | null>(null)
const reason = ref('')
const loading = ref(false)
const revealErrors = ref(false)
const refreshTouched = ref({ revision: false, reason: false })
const confirmOpen = ref(false)
const draftSnapshot = ref<RefreshTargetSnapshot | null>(null)
const appliedRefreshReport = ref<RefreshFailureReport | null>(null)
let requestSequence = 0

interface RefreshOutcome {
  snapshot: RefreshTargetSnapshot
  result: Record<string, unknown> | null
  error: string
}
const outcome = ref<RefreshOutcome | null>(null)

watch(() => props.refreshReport, () => {
  appliedRefreshReport.value = null
})

const refreshReportApplied = computed(() => {
  const report = appliedRefreshReport.value
  return report
    ? refreshReportMatches(report, ownerId.value, pendingRevision.value)
    : false
})
const refreshOrigin = computed(() => {
  const report = appliedRefreshReport.value
  return report && refreshReportMatches(report, ownerId.value, pendingRevision.value)
    ? originFromRefreshReport(report)
    : manualOrigin()
})

const ownerError = computed(() =>
  revealErrors.value && !ownerId.value.trim() ? t('ownership.fillOwnerId') : '')
const operatorError = computed(() =>
  revealErrors.value && !operatorId.value.trim()
    ? t('audit.workbench.operations.operatorRequired')
    : '')
const revisionError = computed(() => {
  if (!revealErrors.value && !refreshTouched.value.revision) return ''
  const revision = pendingRevision.value
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0
    ? ''
    : t('ownership.workbench.refresh.revisionRequired')
})
const reasonError = computed(() => {
  if (!revealErrors.value && !refreshTouched.value.reason) return ''
  return reason.value.trim() ? '' : t('ownership.workbench.refresh.reasonRequired')
})
const revisionInputProps = computed<RecoveryInputAriaProps>(() =>
  revisionError.value
    ? { 'aria-invalid': 'true', 'aria-describedby': 'refresh-revision-error' }
    : {})
const reasonInputProps = computed<RecoveryInputAriaProps>(() =>
  reasonError.value
    ? { 'aria-invalid': 'true', 'aria-describedby': 'refresh-reason-error' }
    : {})

const blockedReason = computed(() => {
  if (!ownerId.value.trim()) return t('ownership.fillOwnerId')
  if (!operatorId.value.trim()) return t('audit.workbench.operations.operatorRequired')
  const revision = pendingRevision.value
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    return t('ownership.workbench.refresh.revisionRequired')
  }
  if (!reason.value.trim()) return t('ownership.workbench.refresh.reasonRequired')
  return ''
})
const canSubmit = computed(() => blockedReason.value === '')

const result = computed(() => outcome.value?.result ?? null)
const retryOutcome = computed(() => classifyRefreshRetry(result.value))
const facts = computed(() => {
  const value = result.value
  return value ? refreshRetryFacts(value, t) : []
})
const outcomeKind = computed(() => retryOutcome.value?.kind)
const headline = computed(() =>
  retryOutcome.value ? t(retryOutcome.value.headlineKey) : '')
const headlineLabel = computed(() =>
  result.value ? t('recovery.refresh.headlineLabel') : '')
const notes = computed(() => {
  const notes = [t('ownership.workbench.refresh.resultNote')]
  if (result.value?.retried === false) notes.push(t('ownership.workbench.refresh.notRetriedNote'))
  if (result.value && result.value.retried !== true && result.value.retried !== false) {
    notes.push(t('recovery.refresh.unknownNote'))
  }
  return notes
})
const submission = computed(() => outcome.value
  ? refreshSubmission(outcome.value.snapshot, t)
  : null)

const confirmTargets = computed(() => draftSnapshot.value
  ? refreshSnapshotFacts(draftSnapshot.value, t)
  : [])
const confirmConsequences = computed(() => refreshConsequenceKeys().map(key => t(key)))

function applyRefreshReport() {
  const plan = planRefreshReportPrefill(props.refreshReport, ownerId.value)
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
  pendingRevision.value = plan.report.pendingRevision
  appliedRefreshReport.value = plan.report
}

function openConfirm() {
  revealErrors.value = true
  refreshTouched.value = { revision: true, reason: true }
  if (blockedReason.value) {
    message.warning(blockedReason.value)
    return
  }
  const built = createRefreshTargetSnapshot({
    ownerId: ownerId.value,
    operatorId: operatorId.value,
    pendingRevision: pendingRevision.value,
    reason: reason.value,
    origin: refreshOrigin.value,
  })
  if (!built.ok) {
    message.warning(t(built.errorKey, built.errorParams))
    return
  }
  draftSnapshot.value = built.snapshot
  confirmOpen.value = true
}

async function submitRetry() {
  const snapshot = draftSnapshot.value
  confirmOpen.value = false
  if (!snapshot) return
  const currentSequence = ++requestSequence
  outcome.value = { snapshot, result: null, error: '' }
  loading.value = true
  try {
    const response = await retryOwnershipRefresh(
      snapshot.ownerId,
      snapshot.pendingRevision,
      snapshot.reason,
      snapshot.operatorId,
    )
    if (currentSequence !== requestSequence) return
    outcome.value = { snapshot, result: { ...response }, error: '' }
    if (response.retried === true) {
      message.success(t('ownership.workbench.refresh.retried'))
    } else if (response.retried === false) {
      message.info(t('ownership.workbench.refresh.notRetried'))
    } else {
      message.info(t('recovery.refresh.outcomeUnknown'))
    }
  } catch (caught) {
    if (currentSequence !== requestSequence) return
    outcome.value = {
      snapshot,
      result: null,
      error: requestErrorMessage(caught),
    }
  } finally {
    if (currentSequence === requestSequence) {
      loading.value = false
      draftSnapshot.value = null
    }
  }
}
</script>

<style scoped>
.ownership-refresh {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  min-width: 0;
}
.refresh-warning {
  margin-bottom: var(--apple-space-4);
}
.refresh-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(250px, 0.8fr);
  gap: var(--apple-space-5);
  align-items: start;
}
.refresh-form {
  min-width: 0;
}
.refresh-hint {
  margin: 0 0 var(--apple-space-3);
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.refresh-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-3);
}
.refresh-field-error {
  margin: 4px 0 0;
  color: var(--apple-red, #c0392b);
  font-size: 11.5px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.refresh-blocked {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.45;
}
.refresh-aside {
  min-width: 0;
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
}
.refresh-aside__title {
  margin: 0 0 var(--apple-space-2);
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 620;
}
.refresh-aside__list {
  margin: 0;
  padding-left: 18px;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 880px) {
  .refresh-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
