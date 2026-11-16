<template>
  <div class="audit-maintenance">
    <section class="operator-scope" :aria-label="t('audit.workbench.operations.scopeTitle')">
      <div class="operator-scope__field">
        <span class="operator-scope__label">{{ t('audit.ownerId') }}</span>
        <UserSelect
          v-model="ownerId"
          :placeholder="t('audit.selectOwner')"
          style="width: 100%"
          :aria-describedby="ownerError ? 'maintenance-owner-error' : undefined"
        />
        <p v-if="ownerError" id="maintenance-owner-error" class="field-error" role="alert">{{ ownerError }}</p>
      </div>
      <div class="operator-scope__field">
        <span class="operator-scope__label">{{ t('audit.workbench.operations.operator') }}</span>
        <UserSelect
          v-model="m.operatorId"
          :placeholder="t('common.selectUser')"
          style="width: 100%"
          :aria-describedby="operatorError ? 'maintenance-operator-error' : undefined"
        />
        <p v-if="operatorError" id="maintenance-operator-error" class="field-error" role="alert">{{ operatorError }}</p>
      </div>
      <p class="operator-scope__note">{{ t('audit.workbench.operations.operatorNote') }}</p>
    </section>

    <WorkbenchSection
      :title="t('audit.workbench.maintenance.title')"
      :description="t('audit.workbench.maintenance.description')"
    >
      <n-alert type="warning" :show-icon="true" class="operation-warning">
        {{ t('audit.workbench.maintenance.warning') }}
      </n-alert>
      <div class="operation-grid">
        <div class="operation-form">
          <n-form label-placement="top" :show-feedback="false" @submit.prevent>
            <n-form-item :label="t('audit.workbench.maintenance.algorithmMode')" required>
              <n-radio-group
                v-model:value="m.algorithmMode"
                size="small"
                :aria-label="t('audit.workbench.maintenance.algorithmMode')"
              >
                <n-radio-button value="automatic">{{ t('audit.workbench.maintenance.modeAutomatic') }}</n-radio-button>
                <n-radio-button value="explicit">{{ t('audit.workbench.maintenance.modeExplicit') }}</n-radio-button>
              </n-radio-group>
            </n-form-item>
            <p class="operation-hint">{{ algorithmModeHint }}</p>

            <n-form-item
              v-if="m.algorithmMode === 'explicit'"
              :label="t('audit.algorithmId')"
              required
              :validation-status="algorithmError ? 'error' : undefined"
            >
              <OwnerAuditAlgorithmSelect
                v-model="m.algorithmId"
                :owner-id="ownerId"
                :placeholder="t('audit.workbench.maintenance.algorithmPlaceholder')"
                :described-by="algorithmError ? 'maintenance-algorithm-error' : undefined"
                style="width: 100%"
              />
            </n-form-item>
            <p v-if="algorithmError" id="maintenance-algorithm-error" class="field-error" role="alert">
              {{ algorithmError }}
            </p>

            <n-form-item :label="t('audit.workbench.maintenance.operation')" required>
              <n-select v-model:value="m.operation" :options="operationOptions" />
            </n-form-item>

            <n-form-item :label="t('audit.workbench.maintenance.selection')" required>
              <n-radio-group
                v-model:value="m.selectionMode"
                size="small"
                :aria-label="t('audit.workbench.maintenance.selection')"
              >
                <n-radio-button value="indices">{{ t('audit.workbench.maintenance.selectionIndices') }}</n-radio-button>
                <n-radio-button value="ranges">{{ t('audit.workbench.maintenance.selectionRanges') }}</n-radio-button>
              </n-radio-group>
            </n-form-item>

            <n-form-item
              v-if="m.selectionMode === 'indices'"
              :label="t('audit.workbench.maintenance.blockIndices')"
              required
              :validation-status="showSelectionError && selectionError ? 'error' : undefined"
            >
              <n-input
                v-model:value="m.indicesText"
                :placeholder="t('audit.workbench.maintenance.blockIndicesPlaceholder')"
                spellcheck="false"
                :aria-describedby="showSelectionError && selectionError
                  ? 'maintenance-indices-hint maintenance-selection-error'
                  : 'maintenance-indices-hint'"
                :aria-invalid="Boolean(showSelectionError && selectionError)"
              />
            </n-form-item>
            <n-form-item
              v-else
              :label="t('audit.workbench.maintenance.blockRanges')"
              required
              :validation-status="showSelectionError && selectionError ? 'error' : undefined"
            >
              <n-input
                v-model:value="m.rangesText"
                :placeholder="t('audit.workbench.maintenance.blockRangesPlaceholder')"
                spellcheck="false"
                :aria-describedby="showSelectionError && selectionError
                  ? 'maintenance-ranges-hint maintenance-selection-error'
                  : 'maintenance-ranges-hint'"
                :aria-invalid="Boolean(showSelectionError && selectionError)"
              />
            </n-form-item>
            <p :id="m.selectionMode === 'indices' ? 'maintenance-indices-hint' : 'maintenance-ranges-hint'" class="operation-hint">
              {{ m.selectionMode === 'indices'
                ? t('audit.workbench.maintenance.blockIndicesHint')
                : t('audit.workbench.maintenance.blockRangesHint') }}
            </p>
            <p
              v-if="showSelectionError && selectionError"
              id="maintenance-selection-error"
              class="field-error"
              role="alert"
            >
              {{ selectionError }}
            </p>
          </n-form>

          <AuditBlockSelectionPreview :preview="selectionPreview" />

          <div class="operation-actions">
            <n-button type="primary" :loading="m.status === 'running'" @click="openMaintenanceConfirm">
              {{ t('audit.workbench.maintenance.reviewTarget') }}
            </n-button>
            <span v-if="m.status === 'running'" class="operation-status" role="status">
              {{ t('audit.workbench.maintenance.waiting') }}
            </span>
          </div>
        </div>

        <aside class="operation-aside">
          <p class="operation-aside__title">{{ t('audit.workbench.operations.impact') }}</p>
          <ul class="operation-aside__list">
            <li>{{ t('audit.workbench.maintenance.impactState') }}</li>
            <li>{{ t('audit.workbench.maintenance.impactJob') }}</li>
            <li>{{ t('audit.workbench.maintenance.impactStatic') }}</li>
            <li>{{ t('audit.workbench.maintenance.consequencePending') }}</li>
            <li>{{ t('audit.workbench.operations.accepted202') }}</li>
          </ul>
        </aside>
      </div>

      <AuditOperationResult
        v-if="maintenanceSubmission"
        :title="t('audit.workbench.maintenance.resultTitle')"
        :facts="maintenanceResultFacts"
        :result="m.status === 'succeeded' ? m.attempt?.result : undefined"
        :error="maintenanceError"
        :job-id="maintenanceJobId"
        :notice="maintenanceNotice"
        :notes="m.status === 'succeeded' && m.attempt ? [t('audit.workbench.maintenance.resultNote')] : []"
        :outcome="maintenanceOutcome"
        :submission="maintenanceSubmission"
        :headline="maintenanceHeadline"
        :headline-label="t('audit.workbench.operations.facts.businessSemantics')"
      />
    </WorkbenchSection>

    <WorkbenchSection
      :title="t('audit.workbench.materialGc.title')"
      :description="t('audit.workbench.materialGc.description')"
      divided
    >
      <n-alert type="warning" :show-icon="true" class="operation-warning">
        {{ t('audit.workbench.materialGc.warning') }}
      </n-alert>
      <p class="scope-note">{{ t('audit.workbench.materialGc.scopeNote') }}</p>

      <div class="gc-operator">
        <span class="operator-scope__label">{{ t('audit.workbench.materialGc.operator') }}</span>
        <UserSelect
          v-model="gc.operatorId"
          :placeholder="t('common.selectUser')"
          style="width: 100%; max-width: 360px"
          :aria-describedby="gcOperatorError ? 'gc-operator-error' : undefined"
        />
        <p v-if="gcOperatorError" id="gc-operator-error" class="field-error" role="alert">{{ gcOperatorError }}</p>
        <p class="operation-hint">{{ t('audit.workbench.materialGc.operatorNote') }}</p>
      </div>

      <section class="gc-step" aria-labelledby="gc-rearm-title">
        <header class="gc-step__head">
          <span class="gc-step__index" aria-hidden="true">1</span>
          <div>
            <h3 id="gc-rearm-title" class="gc-step__title">{{ t('audit.workbench.materialGc.stepOne') }}</h3>
            <p class="operation-hint">{{ t('audit.workbench.materialGc.twoStepNote') }}</p>
          </div>
        </header>

        <div class="operation-grid">
          <div class="operation-form">
            <n-form label-placement="top" :show-feedback="false" @submit.prevent>
              <n-form-item
                :label="t('audit.ownerId')"
                required
                :validation-status="rearmErrors.owner ? 'error' : undefined"
              >
                <UserSelect
                  v-model="gc.rearm.ownerId"
                  :placeholder="t('audit.selectOwner')"
                  style="width: 100%"
                  :aria-describedby="rearmErrors.owner ? 'gc-rearm-owner-error' : undefined"
                />
              </n-form-item>
              <p v-if="rearmErrors.owner" id="gc-rearm-owner-error" class="field-error" role="alert">
                {{ rearmErrors.owner }}
              </p>

              <n-form-item
                :label="t('audit.algorithmId')"
                required
                :validation-status="rearmErrors.algorithm ? 'error' : undefined"
              >
                <OwnerAuditAlgorithmSelect
                  v-model="gc.rearm.algorithmId"
                  :owner-id="gc.rearm.ownerId"
                  :placeholder="t('audit.workbench.materialGc.algorithmPlaceholder')"
                  :described-by="rearmErrors.algorithm ? 'gc-rearm-algorithm-error' : undefined"
                  style="width: 100%"
                />
              </n-form-item>
              <p v-if="rearmErrors.algorithm" id="gc-rearm-algorithm-error" class="field-error" role="alert">
                {{ rearmErrors.algorithm }}
              </p>

              <n-form-item
                :label="t('audit.workbench.materialGc.versionId')"
                required
                :validation-status="rearmErrors.version ? 'error' : undefined"
              >
                <n-input
                  v-model:value="gc.rearm.versionId"
                  :placeholder="t('audit.workbench.materialGc.versionIdPlaceholder')"
                  spellcheck="false"
                  :aria-describedby="rearmErrors.version ? 'gc-rearm-version-error' : 'gc-rearm-hint'"
                  :aria-invalid="Boolean(rearmErrors.version)"
                />
              </n-form-item>
              <p v-if="rearmErrors.version" id="gc-rearm-version-error" class="field-error" role="alert">
                {{ rearmErrors.version }}
              </p>
            </n-form>

            <div v-if="gc.rearm.prefill" class="rearm-prefill" role="status">
              <p class="rearm-prefill__title">{{ t('audit.workbench.materialGc.rearmPrefilled', { versionId: gc.rearm.prefill.versionId }) }}</p>
              <p class="operation-hint">{{ t('audit.workbench.materialGc.rearmPrefillHint') }}</p>
              <dl class="rearm-prefill__facts">
                <div v-for="fact in prefillFields" :key="`${fact.labelKey}:${fact.value}`">
                  <dt>{{ t(fact.labelKey) }}</dt>
                  <dd :class="{ mono: fact.mono }">{{ fact.value }}</dd>
                </div>
              </dl>
            </div>

            <p id="gc-rearm-hint" class="operation-hint">{{ t('audit.workbench.materialGc.rearmNeedsFailed') }}</p>
            <p class="operation-hint">{{ t('audit.workbench.materialGc.rearmHint') }}</p>

            <div class="operation-actions">
              <n-button type="primary" :loading="gc.rearm.status === 'running'" @click="openRearmConfirm">
                {{ t('audit.workbench.materialGc.rearmAction') }}
              </n-button>
              <span v-if="gc.rearm.status === 'running'" class="operation-status" role="status">
                {{ t('audit.workbench.materialGc.rearmWaiting') }}
              </span>
            </div>
          </div>

          <aside class="operation-aside">
            <p class="operation-aside__title">{{ t('audit.workbench.materialGc.rearmConsequences') }}</p>
            <ul class="operation-aside__list">
              <li>{{ t('audit.workbench.materialGc.rearmImpactPending') }}</li>
              <li>{{ t('audit.workbench.materialGc.rearmImpactNoAuto') }}</li>
              <li>{{ t('audit.workbench.materialGc.rearmImpactImmutable') }}</li>
              <li>{{ t('audit.workbench.materialGc.rearmImpactBlocked') }}</li>
            </ul>
          </aside>
        </div>

        <AuditOperationResult
          v-if="rearmSubmission"
          :title="t('audit.workbench.materialGc.rearmResultTitle')"
          :facts="rearmResultFacts"
          :result="gc.rearm.status === 'succeeded' ? gc.rearm.attempt?.result : undefined"
          :error="rearmError"
          :job-id="rearmJobId"
          :notice="rearmNotice"
          :notes="rearmNextStep ? [t(rearmNextStep)] : []"
          :outcome="rearmOutcome"
          :submission="rearmSubmission"
          :headline="rearmHeadline"
          :headline-label="t('audit.workbench.operations.facts.businessSemantics')"
        />
      </section>

      <section class="gc-step" aria-labelledby="gc-pass-title">
        <header class="gc-step__head">
          <span class="gc-step__index" aria-hidden="true">2</span>
          <div>
            <h3 id="gc-pass-title" class="gc-step__title">{{ t('audit.workbench.materialGc.stepTwo') }}</h3>
            <p class="operation-hint">{{ t('audit.workbench.materialGc.passDescription') }}</p>
          </div>
        </header>

        <n-form label-placement="top" :show-feedback="false" @submit.prevent class="gc-pass-form">
          <n-form-item :label="t('audit.workbench.materialGc.cursor')">
            <n-input
              v-model:value="gc.cursor"
              :placeholder="t('audit.workbench.materialGc.cursorPlaceholder')"
              spellcheck="false"
              aria-describedby="gc-cursor-hint"
            />
          </n-form-item>
        </n-form>
        <p id="gc-cursor-hint" class="operation-hint">{{ t('audit.workbench.materialGc.cursorHint') }}</p>
        <p v-if="gc.pass.status === 'succeeded' && passAttempt" class="operation-hint gc-pass-position">
          {{ t('audit.workbench.materialGc.passPosition', {
            used: passStartedCursorText,
            next: passReturnedCursorText,
          }) }}
        </p>

        <div class="operation-actions">
          <n-button type="primary" :loading="gc.pass.status === 'running'" @click="openPassConfirm()">
            {{ t('audit.workbench.materialGc.runPassNow') }}
          </n-button>
          <n-button v-if="gc.pass.status === 'running'" quaternary @click="stopPass">
            {{ t('audit.workbench.materialGc.stopWaiting') }}
          </n-button>
          <span v-if="gc.pass.status === 'running'" class="operation-status" role="status">
            {{ gc.pass.stopRequested
              ? t('audit.workbench.materialGc.stoppingWait')
              : t('audit.workbench.materialGc.passWaiting') }}
          </span>
        </div>
        <p class="operation-hint">{{ t('audit.workbench.materialGc.stopWaitingHint') }}</p>

        <n-alert v-if="passUnknownNotice" type="warning" :show-icon="true" class="gc-unknown" role="status">
          {{ passUnknownNotice }}
        </n-alert>

        <div v-if="gc.pass.status === 'succeeded' && passContinuation.moreWorkPending" class="gc-continuation" role="status">
          <div>
            <p class="gc-continuation__title">{{ t('audit.workbench.materialGc.continuationTitle') }}</p>
            <p class="operation-hint">{{ t('audit.workbench.materialGc.continuationBody') }}</p>
            <p class="operation-hint">
              {{ t('audit.workbench.materialGc.continuationNext', {
                cursor: passContinuation.cursor ?? t('common.notAvailable'),
              }) }}
            </p>
            <p v-if="!passContinuation.canContinue" class="operation-hint field-error">
              {{ t('audit.workbench.materialGc.noReturnedCursor') }}
            </p>
          </div>
          <n-button
            type="primary"
            size="small"
            :disabled="!passContinuation.canContinue"
            @click="continuePass"
          >
            {{ t('audit.workbench.materialGc.continueAction') }}
          </n-button>
        </div>
        <p v-else-if="gc.pass.status === 'succeeded' && passAttempt" class="operation-hint">
          {{ t('audit.workbench.materialGc.noContinuation') }}
        </p>

        <AuditOperationResult
          v-if="passSubmission"
          :title="gc.pass.status === 'succeeded' && passAttempt
            ? t('audit.workbench.materialGc.passRoundTitle', { round: gc.pass.round })
            : t('audit.workbench.materialGc.passResultTitle')"
          :facts="passResultFacts"
          :result="gc.pass.status === 'succeeded' ? passAttempt?.result : undefined"
          :error="passError"
          :notice="passNotice"
          :notes="gc.pass.status === 'succeeded' && passAttempt ? [t('audit.workbench.materialGc.passResultNote')] : []"
          :outcome="passOutcome"
          :submission="passSubmission"
          :headline="passHeadline"
          :headline-label="t('audit.workbench.operations.facts.businessSemantics')"
          :track-job="false"
        />

        <div v-if="passRows.length" class="gc-reports">
          <h4 class="gc-step__subtitle">{{ t('audit.workbench.materialGc.reportsTitle') }}</h4>
          <n-data-table
            :columns="reportColumns"
            :data="passRows"
            :pagination="{ pageSize: 10 }"
            size="small"
            :row-key="reportRowKey"
            :bordered="false"
          />
        </div>
      </section>
    </WorkbenchSection>

    <AuditTargetConfirmModal
      v-model:show="confirm.show"
      :title="confirm.title"
      :description="confirm.description"
      :facts="confirm.facts"
      :consequences="confirm.consequences"
      :confirm-label="confirm.confirmLabel"
      :cancel-label="t('common.cancel')"
      :loading="confirmLoading"
      :confirm-type="confirm.confirmType"
      @confirm="handleConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, h, reactive, ref } from 'vue'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import type { AuditMaintenanceOp } from '@/api/audit'
import UserSelect from '@/components/UserSelect.vue'
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import { useI18n } from '@/stores/i18n'
import AuditBlockSelectionPreview from './AuditBlockSelectionPreview.vue'
import AuditOperationResult from './AuditOperationResult.vue'
import AuditTargetConfirmModal from './AuditTargetConfirmModal.vue'
import OwnerAuditAlgorithmSelect from './OwnerAuditAlgorithmSelect.vue'
import {
  buildBlockSelection,
  buildGcPassTarget,
  buildMaintenanceTarget,
  buildOperationSubmission,
  buildRearmTarget,
  failureFacts,
  gcPassTargetFields,
  maintenanceConsequenceKeys,
  maintenanceTargetFacts,
  maintenanceTargetFields,
  materialGcContinuation,
  operationFacts,
  rearmNextStepKey,
  rearmPrefillFields,
  rearmPrefillFromReport,
  rearmTargetFields,
  type GcPassTarget,
  type MaintenanceTarget,
  type OperationOutcomeKind,
  type OperationSubmissionSnapshot,
  type RearmTarget,
} from './auditMaintenance'
import {
  auditMaintenanceSession,
} from './auditMaintenanceSession'
import {
  submitGcRearm,
  stopGcPassWait,
  submitMaintenance,
  runGcPass,
} from './auditMaintenanceController'
import {
  maintenanceFacts,
  materialGcPassFacts,
  materialGcRearmFacts,
  materialGcReportRows,
  type MaterialGcReportRow,
  type OperationFact,
} from './auditOperations'

const props = defineProps<{ ownerId: string }>()
const emit = defineEmits<{ 'update:ownerId': [value: string] }>()
const { t } = useI18n()
const message = useMessage()

const ownerId = computed({
  get: () => props.ownerId,
  set: (value: string) => emit('update:ownerId', value),
})
const m = auditMaintenanceSession.maintenance
const gc = auditMaintenanceSession.gc

const validationAttempted = ref(false)
const rearmValidationAttempted = ref(false)
const gcOperatorAttempted = ref(false)

const operationOptions = computed<{ label: string; value: AuditMaintenanceOp }[]>(() => [
  { label: t('audit.workbench.maintenance.ops.update'), value: 'Update' },
  { label: t('audit.workbench.maintenance.ops.insert'), value: 'Insert' },
  { label: t('audit.workbench.maintenance.ops.delete'), value: 'Delete' },
])

const selection = computed(() => buildBlockSelection(m.selectionMode, m.indicesText, m.rangesText))
const selectionPreview = computed(() => selection.value.ok ? selection.value.selection.preview : null)
const selectionError = computed(() => selection.value.ok ? '' : t(selection.value.errorKey, selection.value.errorParams))
const showSelectionError = computed(() => validationAttempted.value
  || (m.selectionMode === 'indices' ? m.indicesText.trim() !== '' : m.rangesText.trim() !== ''))

const ownerError = computed(() => validationAttempted.value && !ownerId.value.trim()
  ? t('audit.workbench.maintenance.ownerRequired')
  : '')
const operatorError = computed(() => validationAttempted.value && !m.operatorId.trim()
  ? t('audit.workbench.operations.operatorRequired')
  : '')
const algorithmError = computed(() => validationAttempted.value
  && m.algorithmMode === 'explicit'
  && !m.algorithmId.trim()
  ? t('audit.workbench.maintenance.algorithmRequired')
  : '')
const algorithmModeHint = computed(() => t(m.algorithmMode === 'automatic'
  ? 'audit.workbench.maintenance.algorithmAutoHint'
  : 'audit.workbench.maintenance.algorithmBoundHint'))

function currentMaintenanceTarget(): MaintenanceTarget | null {
  if (!ownerId.value.trim() || !m.operatorId.trim()) return null
  if (m.algorithmMode === 'explicit' && !m.algorithmId.trim()) return null
  if (!selection.value.ok) return null
  return buildMaintenanceTarget({
    ownerId: ownerId.value,
    operatorId: m.operatorId,
    algorithmMode: m.algorithmMode,
    requestedAlgorithmId: m.algorithmId,
    operation: m.operation,
    selection: selection.value.selection,
  })
}

function jobIdOf(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null
  const jobId = (value as Record<string, unknown>).jobId
  return typeof jobId === 'string' && jobId.trim() !== '' ? jobId.trim() : null
}

const maintenanceSubmission = computed<OperationSubmissionSnapshot | null>(() => {
  if (m.status === 'running' && m.pendingSubmission) return m.pendingSubmission
  if (m.failure) return m.failure.submission
  if (m.attempt) return m.attempt.submission
  return m.pendingSubmission
})
const maintenanceJobId = computed(() => m.status === 'succeeded' ? jobIdOf(m.attempt?.result) : null)
const maintenanceResultFacts = computed<OperationFact[]>(() => {
  if (m.failure) return failureFacts(m.failure.failure, m.failure.businessKey, t)
  if (m.status === 'succeeded' && m.attempt) {
    return [
      ...operationFacts(m.attempt.httpStatus, m.attempt.businessKey, t),
      ...maintenanceFacts(m.attempt.result, t),
    ]
  }
  return []
})
const maintenanceHeadline = computed(() => {
  if (m.failure) return t(m.failure.businessKey)
  if (m.status === 'succeeded' && m.attempt) return t(m.attempt.businessKey)
  return ''
})
const maintenanceOutcome = computed<OperationOutcomeKind | undefined>(() => {
  if (m.failure) return m.failure.failure.kind === 'http' ? undefined : 'unknown'
  if (m.status === 'succeeded' && m.attempt) return m.attempt.outcome
  return undefined
})
const maintenanceError = computed(() => {
  const failure = m.failure
  if (!failure || failure.failure.kind !== 'http') return ''
  return [failure.failure.message, failure.failure.detail].filter(Boolean).join(' · ')
})
const maintenanceNotice = computed(() => {
  if (m.status === 'succeeded' && m.attempt) return t('audit.workbench.maintenance.resultNote')
  if (m.failure && m.failure.failure.kind !== 'http') return t(m.failure.businessKey)
  return ''
})

const gcOperatorError = computed(() => gcOperatorAttempted.value && !gc.operatorId.trim()
  ? t('audit.workbench.materialGc.operatorRequired')
  : '')
const rearmErrors = computed(() => ({
  owner: rearmValidationAttempted.value && !gc.rearm.ownerId.trim()
    ? t('audit.workbench.maintenance.ownerRequired')
    : '',
  algorithm: rearmValidationAttempted.value && !gc.rearm.algorithmId.trim()
    ? t('audit.workbench.materialGc.algorithmRequired')
    : '',
  version: rearmValidationAttempted.value && !gc.rearm.versionId.trim()
    ? t('audit.workbench.materialGc.versionRequired')
    : '',
}))

const rearmPrefillMatches = computed(() => {
  const prefill = gc.rearm.prefill
  return Boolean(prefill
    && prefill.ownerId === gc.rearm.ownerId.trim()
    && prefill.algorithmId === gc.rearm.algorithmId.trim()
    && prefill.versionId === gc.rearm.versionId.trim())
})
const prefillFields = computed(() => gc.rearm.prefill
  ? rearmPrefillFields(gc.rearm.prefill, t)
  : [])

const rearmSubmission = computed<OperationSubmissionSnapshot | null>(() => {
  if (gc.rearm.status === 'running' && gc.rearm.pendingSubmission) return gc.rearm.pendingSubmission
  if (gc.rearm.failure) return gc.rearm.failure.submission
  if (gc.rearm.attempt) return gc.rearm.attempt.submission
  return gc.rearm.pendingSubmission
})
const rearmJobId = computed(() => gc.rearm.status === 'succeeded' ? jobIdOf(gc.rearm.attempt?.result) : null)
const rearmResultFacts = computed<OperationFact[]>(() => {
  if (gc.rearm.failure) return failureFacts(gc.rearm.failure.failure, gc.rearm.failure.businessKey, t)
  if (gc.rearm.status === 'succeeded' && gc.rearm.attempt) {
    return [
      ...operationFacts(gc.rearm.attempt.httpStatus, gc.rearm.attempt.businessKey, t),
      ...materialGcRearmFacts(gc.rearm.attempt.result, t),
    ]
  }
  return []
})
const rearmHeadline = computed(() => {
  if (gc.rearm.failure) return t(gc.rearm.failure.businessKey)
  if (gc.rearm.status === 'succeeded' && gc.rearm.attempt) return t(gc.rearm.attempt.businessKey)
  return ''
})
const rearmOutcome = computed<OperationOutcomeKind | undefined>(() => {
  if (gc.rearm.failure) return gc.rearm.failure.failure.kind === 'http' ? undefined : 'unknown'
  if (gc.rearm.status === 'succeeded' && gc.rearm.attempt) return gc.rearm.attempt.outcome
  return undefined
})
const rearmError = computed(() => {
  const failure = gc.rearm.failure
  if (!failure || failure.failure.kind !== 'http') return ''
  return [failure.failure.message, failure.failure.detail].filter(Boolean).join(' · ')
})
const rearmNotice = computed(() => {
  if (gc.rearm.status === 'succeeded' && gc.rearm.attempt) return t(gc.rearm.attempt.businessKey)
  if (gc.rearm.failure && gc.rearm.failure.failure.kind !== 'http') return t(gc.rearm.failure.businessKey)
  return ''
})
const rearmNextStep = computed(() => rearmNextStepKey(gc.rearm.status === 'succeeded' ? gc.rearm.attempt?.result ?? null : null))

const passAttempt = computed(() => gc.pass.attempt)
const passSubmission = computed<OperationSubmissionSnapshot | null>(() => {
  if (gc.pass.failure) return gc.pass.failure.submission
  if (gc.pass.status === 'running' && gc.pass.pendingSubmission) return gc.pass.pendingSubmission
  if (passAttempt.value) return passAttempt.value.submission
  return gc.pass.pendingSubmission
})
const passContinuation = computed(() => materialGcContinuation(passAttempt.value?.result ?? null))
const passRows = computed<MaterialGcReportRow[]>(() =>
  gc.pass.status === 'succeeded' && passAttempt.value ? materialGcReportRows(passAttempt.value.result) : [])
const passTarget = computed<GcPassTarget | null>(() => {
  const attempt = passAttempt.value
  return attempt && 'cursor' in attempt.target ? attempt.target : null
})
const passStartedCursorText = computed(() =>
  passTarget.value?.cursor ?? t('audit.workbench.materialGc.cursorFirstRow'))
const passReturnedCursorText = computed(() =>
  passContinuation.value.cursor ?? t('common.notAvailable'))
const passResultFacts = computed<OperationFact[]>(() => {
  if (gc.pass.failure) {
    return failureFacts(gc.pass.failure.failure, gc.pass.failure.businessKey, t)
  }
  if (gc.pass.status === 'succeeded' && passAttempt.value) {
    return [
      ...operationFacts(passAttempt.value.httpStatus, passAttempt.value.businessKey, t),
      { labelKey: 'audit.workbench.materialGc.passRound', value: String(gc.pass.round) },
      { labelKey: 'audit.workbench.materialGc.passStartedAt', value: formatTimestamp(passAttempt.value.submission.submittedAt) },
      { labelKey: 'audit.workbench.materialGc.passReceivedAt', value: formatTimestamp(passAttempt.value.receivedAt) },
      ...materialGcPassFacts(passAttempt.value.result, t),
    ]
  }
  return []
})
const passHeadline = computed(() => {
  if (gc.pass.failure) return t(gc.pass.failure.businessKey)
  if (gc.pass.status === 'succeeded' && passAttempt.value) return t(passAttempt.value.businessKey)
  return ''
})
const passOutcome = computed<OperationOutcomeKind | undefined>(() => {
  if (gc.pass.failure) return gc.pass.failure.failure.kind === 'http' ? undefined : 'unknown'
  if (gc.pass.status === 'succeeded' && passAttempt.value) return passAttempt.value.outcome
  return undefined
})
const passError = computed(() => {
  const failure = gc.pass.failure
  if (!failure || failure.failure.kind !== 'http') return ''
  return [failure.failure.message, failure.failure.detail].filter(Boolean).join(' · ')
})
const passUnknownNotice = computed(() => {
  const failure = gc.pass.failure
  if (!failure || failure.failure.kind === 'http') return ''
  return failure.failure.kind === 'canceled'
    ? t('audit.workbench.materialGc.stoppedUnknown')
    : t('audit.workbench.materialGc.networkUnknown')
})
const passNotice = computed(() => {
  if (gc.pass.status === 'succeeded' && passAttempt.value) return t('audit.workbench.materialGc.passResultNote')
  return ''
})

const reportColumns = computed<DataTableColumns<MaterialGcReportRow>>(() => [
  { title: t('audit.workbench.materialGc.columns.owner'), key: 'ownerId', ellipsis: { tooltip: true } },
  { title: t('audit.workbench.materialGc.columns.algorithm'), key: 'algorithmId', ellipsis: { tooltip: true } },
  { title: t('audit.workbench.materialGc.columns.version'), key: 'versionId', ellipsis: { tooltip: true } },
  { title: t('audit.workbench.materialGc.columns.job'), key: 'jobId', ellipsis: { tooltip: true } },
  { title: t('audit.workbench.materialGc.columns.step'), key: 'step' },
  { title: t('audit.workbench.materialGc.columns.outcome'), key: 'outcome' },
  { title: t('audit.workbench.materialGc.columns.detail'), key: 'detail', ellipsis: { tooltip: true } },
  {
    title: t('audit.workbench.materialGc.columns.actions'),
    key: 'actions',
    width: 132,
    render: row => {
      if (!rearmPrefillFromReport(row)) {
        return h('span', { class: 'gc-report-unavailable' }, t('audit.workbench.materialGc.prefillUnavailableShort'))
      }
      return h(NButton, {
        size: 'tiny',
        quaternary: true,
        type: 'primary',
        onClick: () => prefillRearm(row),
      }, () => t('audit.workbench.materialGc.rearmPrefillAction'))
    },
  },
])

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return t('common.notAvailable')
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function reportRowKey(row: MaterialGcReportRow): string {
  return `${row.versionId}:${row.jobId}:${row.step}`
}

function prefillRearm(row: MaterialGcReportRow): void {
  const prefill = rearmPrefillFromReport(row)
  if (!prefill) {
    message.warning(t('audit.workbench.materialGc.prefillUnavailable'))
    return
  }
  gc.rearm.prefill = prefill
  gc.rearm.ownerId = prefill.ownerId
  gc.rearm.algorithmId = prefill.algorithmId
  gc.rearm.versionId = prefill.versionId
  message.success(t('audit.workbench.materialGc.rearmPrefilled', { versionId: prefill.versionId }))
}

interface ConfirmState {
  show: boolean
  kind: 'maintenance' | 'pass' | 'rearm'
  title: string
  description: string
  facts: OperationFact[]
  consequences: string[]
  confirmLabel: string
  confirmType: 'primary' | 'warning' | 'error'
  target: MaintenanceTarget | GcPassTarget | RearmTarget | null
  submission: OperationSubmissionSnapshot | null
}

const confirm = reactive<ConfirmState>({
  show: false,
  kind: 'maintenance',
  title: '',
  description: '',
  facts: [],
  consequences: [],
  confirmLabel: '',
  confirmType: 'primary',
  target: null,
  submission: null,
})

const confirmLoading = computed(() => {
  if (confirm.kind === 'maintenance') return m.status === 'running'
  if (confirm.kind === 'rearm') return gc.rearm.status === 'running'
  return gc.pass.status === 'running'
})

function openMaintenanceConfirm(): void {
  validationAttempted.value = true
  const target = currentMaintenanceTarget()
  if (!target) {
    message.warning(t('audit.workbench.maintenance.validationBlocked'))
    return
  }
  const submission = buildOperationSubmission(maintenanceTargetFields(target, t))
  confirm.kind = 'maintenance'
  confirm.title = t('audit.workbench.maintenance.confirmTitle')
  confirm.description = t('audit.workbench.maintenance.confirmDescription')
  confirm.facts = maintenanceTargetFacts(target, t)
  confirm.consequences = maintenanceConsequenceKeys(target).map(key => t(key))
  confirm.confirmLabel = t('audit.workbench.maintenance.confirmDispatch')
  confirm.confirmType = 'primary'
  confirm.target = target
  confirm.submission = submission
  confirm.show = true
}

function openPassConfirm(cursorOverride?: string): void {
  gcOperatorAttempted.value = true
  if (!gc.operatorId.trim()) {
    message.warning(t('audit.workbench.materialGc.operatorRequired'))
    return
  }
  if (gc.pass.status === 'running') {
    message.warning(t('audit.workbench.materialGc.passBusy'))
    return
  }
  const target = buildGcPassTarget(gc.operatorId, cursorOverride ?? gc.cursor)
  const submission = buildOperationSubmission(gcPassTargetFields(target, t))
  confirm.kind = 'pass'
  confirm.title = t('audit.workbench.materialGc.passConfirmTitle')
  confirm.description = t('audit.workbench.materialGc.passConfirmDescription')
  confirm.facts = gcPassTargetFields(target, t).map(field => ({
    labelKey: field.labelKey,
    value: field.value,
    ...(field.mono ? { mono: true } : {}),
  }))
  confirm.consequences = [
    t('audit.workbench.materialGc.passConsequenceBounded'),
    t('audit.workbench.materialGc.passConsequenceWait'),
    t('audit.workbench.materialGc.passConsequenceNoQuiescence'),
    t('audit.workbench.materialGc.passConsequenceNoAutoRetry'),
  ]
  confirm.confirmLabel = t('audit.workbench.materialGc.passConfirmRun')
  confirm.confirmType = 'primary'
  confirm.target = target
  confirm.submission = submission
  confirm.show = true
}

function openRearmConfirm(): void {
  rearmValidationAttempted.value = true
  gcOperatorAttempted.value = true
  if (!gc.operatorId.trim()) {
    message.warning(t('audit.workbench.materialGc.operatorRequired'))
    return
  }
  if (!gc.rearm.ownerId.trim() || !gc.rearm.algorithmId.trim() || !gc.rearm.versionId.trim()) {
    message.warning(t('audit.workbench.materialGc.rearmValidationBlocked'))
    return
  }
  if (gc.rearm.status === 'running') {
    message.warning(t('audit.workbench.materialGc.rearmBusy'))
    return
  }
  const target = buildRearmTarget({
    ownerId: gc.rearm.ownerId,
    algorithmId: gc.rearm.algorithmId,
    versionId: gc.rearm.versionId,
    operatorId: gc.operatorId,
    prefilledFromReport: rearmPrefillMatches.value,
    sourceJobId: rearmPrefillMatches.value ? gc.rearm.prefill?.sourceJobId : '',
  })
  const submission = buildOperationSubmission(rearmTargetFields(target, t))
  confirm.kind = 'rearm'
  confirm.title = t('audit.workbench.materialGc.rearmConfirmTitle')
  confirm.description = t('audit.workbench.materialGc.rearmConfirmDescription')
  confirm.facts = rearmTargetFields(target, t).map(field => ({
    labelKey: field.labelKey,
    value: field.value,
    ...(field.mono ? { mono: true } : {}),
  }))
  confirm.consequences = [
    t('audit.workbench.materialGc.rearmImpactPending'),
    t('audit.workbench.materialGc.rearmImpactNoAuto'),
    t('audit.workbench.materialGc.rearmImpactImmutable'),
    t('audit.workbench.materialGc.rearmImpactBlocked'),
    t('audit.workbench.materialGc.nextStepAfterRearm'),
  ]
  confirm.confirmLabel = t('audit.workbench.materialGc.rearmConfirmRun')
  confirm.confirmType = 'primary'
  confirm.target = target
  confirm.submission = submission
  confirm.show = true
}

async function executePass(target: GcPassTarget, submission: OperationSubmissionSnapshot): Promise<void> {
  const result = await runGcPass(target, submission)
  if ('busy' in result) {
    message.warning(t('audit.workbench.materialGc.passBusy'))
    return
  }
  if (result.ok) message.success(t('audit.workbench.materialGc.passFinished'))
  else if (result.failure.failure.kind === 'http') message.error(t(result.failure.businessKey))
  else message.warning(t(result.failure.businessKey))
}

async function handleConfirm(): Promise<void> {
  const target = confirm.target
  const submission = confirm.submission
  if (!target || !submission || confirmLoading.value) return
  if (confirm.kind === 'maintenance') {
    const result = await submitMaintenance(target as MaintenanceTarget, submission)
    if ('busy' in result) {
      message.warning(t('audit.workbench.maintenance.busy'))
      return
    }
    confirm.show = false
    if (result.ok) message.success(t('audit.workbench.maintenance.submitted'))
    else message.error(t(result.failure.businessKey))
    return
  }
  if (confirm.kind === 'pass') {
    // A pass may legitimately wait for bounded remote steps. Close the
    // confirmation so the pass controls (including "stop waiting") stay usable.
    confirm.show = false
    void executePass(target as GcPassTarget, submission)
    return
  }
  const result = await submitGcRearm(target as RearmTarget, submission)
  if ('busy' in result) {
    message.warning(t('audit.workbench.materialGc.rearmBusy'))
    return
  }
  confirm.show = false
  if (result.ok) message.success(t('audit.workbench.materialGc.rearmSubmitted'))
  else message.error(t(result.failure.businessKey))
}

function stopPass(): void {
  if (stopGcPassWait()) message.warning(t('audit.workbench.materialGc.stoppingWait'))
}

function continuePass(): void {
  const cursor = passContinuation.value.cursor
  if (!cursor) {
    message.warning(t('audit.workbench.materialGc.noReturnedCursor'))
    return
  }
  gc.cursor = cursor
  openPassConfirm(cursor)
}
</script>

<style scoped>
.audit-maintenance {
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
.audit-maintenance :deep(.n-form-item) {
  margin-bottom: var(--apple-space-4);
}
.operation-hint {
  margin: 0 0 var(--apple-space-3);
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.field-error {
  margin: var(--apple-space-1) 0 var(--apple-space-3);
  color: var(--apple-red);
  font-size: 12px;
  line-height: 1.5;
}
/* A message that belongs to the control above it sits 4px under the input; the
   next control keeps the standard 12px gap. */
.audit-maintenance :deep(.n-form-item) + .field-error {
  margin-top: calc(var(--apple-space-1) - var(--apple-space-4));
}
.operator-scope .field-error,
.gc-operator .field-error {
  margin-bottom: 0;
}
.operation-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--apple-space-3);
  margin-top: var(--apple-space-4);
}
.operation-status {
  color: var(--apple-gray-3);
  font-size: 12px;
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
.operation-warning {
  margin-bottom: var(--apple-space-4);
}
.scope-note {
  margin: 0 0 var(--apple-space-4);
  padding: var(--apple-space-2) var(--apple-space-3);
  border-left: 3px solid var(--apple-blue);
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.55;
}
.gc-operator {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-1, 4px);
  margin-bottom: var(--apple-space-5);
}
.gc-step {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
  min-width: 0;
  padding-top: var(--apple-space-4);
  border-top: 1px solid var(--apple-border);
}
.gc-step + .gc-step {
  margin-top: var(--apple-space-6, 24px);
}
.gc-step:first-of-type {
  border-top: 0;
  padding-top: 0;
}
.gc-step__head {
  display: flex;
  align-items: flex-start;
  gap: var(--apple-space-3);
}
.gc-step__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--apple-blue);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  flex: 0 0 auto;
}
.gc-step__title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 14px;
  font-weight: 620;
}
.gc-step__subtitle {
  margin: var(--apple-space-3) 0 var(--apple-space-2);
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 620;
}
.gc-pass-form {
  max-width: 520px;
}
.gc-pass-position {
  font-family: var(--apple-font-mono);
  font-size: 11.5px;
}
.gc-unknown {
  margin: var(--apple-space-2) 0;
}
.gc-continuation {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--apple-space-3);
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
}
.gc-continuation__title {
  margin: 0 0 var(--apple-space-1, 4px);
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 620;
}
.rearm-prefill {
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
}
.rearm-prefill__title {
  margin: 0 0 var(--apple-space-1, 4px);
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 620;
}
.rearm-prefill__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--apple-space-2, 8px);
  margin: var(--apple-space-2) 0 0;
}
.rearm-prefill__facts dt {
  color: var(--apple-gray-4);
  font-size: 11px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.rearm-prefill__facts dd {
  margin: 1px 0 0;
  color: var(--apple-gray-1);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.rearm-prefill__facts .mono {
  font-family: var(--apple-font-mono);
}
.gc-reports {
  min-width: 0;
  overflow-x: auto;
}
.gc-report-unavailable {
  color: var(--apple-gray-4);
  font-size: 11.5px;
}
@media (max-width: 880px) {
  .operation-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 640px) {
  .operator-scope {
    padding: var(--apple-space-3);
  }
}
</style>
