<template>
  <div class="ownership-proof">
    <WorkbenchSection :title="modeTitle" :description="modeDescription">
      <div class="ownership-proof__layout">
        <div class="ownership-proof__form">
          <div class="proof-scope">
            <p class="proof-scope__label">{{ t('ownership.workbench.proof.scope') }}</p>
            <n-radio-group v-model:value="isRangeMode" size="small">
              <n-radio-button :value="false">{{ t('ownership.workbench.proof.singleScope') }}</n-radio-button>
              <n-radio-button :value="true">{{ t('ownership.workbench.proof.rangeScope') }}</n-radio-button>
            </n-radio-group>
          </div>
          <p class="field-hint">{{ t('ownership.workbench.ownerIdIdentityNote') }}</p>

          <template v-if="mode === 'generate'">
            <n-form v-if="!isRangeMode" label-placement="top" :show-feedback="false" @submit.prevent>
              <n-form-item :label="t('ownership.proofType')" required>
                <n-select v-model:value="genForm.proofType" :options="membershipOptions" />
              </n-form-item>
              <p class="field-hint">{{ proofTypeHint }}</p>
              <div class="ownership-form-grid">
                <n-form-item :label="t('ownership.ownerId')" required>
                  <UserSelect v-model="genForm.ownerId" :placeholder="t('ownership.selectOwner')" style="width: 100%" />
                </n-form-item>
                <n-form-item :label="t('ownership.tableId')" required>
                  <TableSelect v-model="genForm.tableId" style="width: 100%" />
                </n-form-item>
                <n-form-item :label="t('ownership.rowId')">
                  <n-input v-model:value="genForm.rowId" :placeholder="t('ownership.workbench.proof.rowIdPlaceholder')" />
                </n-form-item>
                <n-form-item :label="t('ownership.columnId')" required>
                  <n-input-number v-model:value="genForm.columnId" :show-button="false" :min="0" :precision="0" style="width: 100%" />
                </n-form-item>
              </div>
              <p class="field-hint">{{ t('ownership.workbench.proof.rowIdNote') }}</p>
              <n-button type="primary" :loading="genLoading" @click="handleGenerate">
                {{ t('ownership.generateSingle') }}
              </n-button>
            </n-form>

            <n-form v-else label-placement="top" :show-feedback="false" @submit.prevent>
              <div class="ownership-form-grid">
                <n-form-item class="ownership-form-grid__wide" :label="t('ownership.ownerId')" required>
                  <UserSelect v-model="rangeGenForm.ownerId" :placeholder="t('ownership.selectOwner')" style="width: 100%" />
                </n-form-item>
                <n-form-item :label="t('ownership.tableIdFrom')" required>
                  <TableSelect v-model="rangeGenForm.tableIdFrom" style="width: 100%" />
                </n-form-item>
                <n-form-item :label="t('ownership.tableIdTo')" required>
                  <TableSelect v-model="rangeGenForm.tableIdTo" style="width: 100%" />
                </n-form-item>
                <n-form-item :label="t('ownership.rowIdFrom')">
                  <n-input v-model:value="rangeGenForm.rowIdFrom" :placeholder="t('ownership.workbench.proof.rowIdPlaceholder')" />
                </n-form-item>
                <n-form-item :label="t('ownership.rowIdTo')">
                  <n-input v-model:value="rangeGenForm.rowIdTo" :placeholder="t('ownership.workbench.proof.rowIdPlaceholder')" />
                </n-form-item>
              </div>
              <p class="field-hint">{{ t('ownership.workbench.proof.rangeBoundsNote') }}</p>
              <n-button type="primary" :loading="rangeGenLoading" @click="handleRangeGenerate">
                {{ t('ownership.generateRange') }}
              </n-button>
            </n-form>
          </template>

          <template v-else>
            <n-form v-if="!isRangeMode" label-placement="top" :show-feedback="false" @submit.prevent>
              <n-form-item :label="t('ownership.proofType')" required>
                <n-select v-model:value="verifyForm.proofType" :options="membershipOptions" />
              </n-form-item>
              <n-form-item :label="t('ownership.workbench.verify.input')">
                <n-input
                  v-model:value="verifyForm.proofJson"
                  type="textarea"
                  :rows="10"
                  class="proof-textarea"
                  :placeholder="t('ownership.pasteProof')"
                />
              </n-form-item>
              <div class="ownership-proof__actions">
                <n-button size="small" quaternary :disabled="verifyLoading" @click="triggerFileInput">
                  {{ t('ownership.workbench.verify.loadFile') }}
                </n-button>
                <n-button type="primary" :loading="verifyLoading" @click="handleVerify">
                  {{ t('ownership.verifySingle') }}
                </n-button>
              </div>
            </n-form>

            <n-form v-else label-placement="top" :show-feedback="false" @submit.prevent>
              <n-form-item :label="t('ownership.workbench.verify.input')">
                <n-input
                  v-model:value="rangeVerifyForm.proofJson"
                  type="textarea"
                  :rows="10"
                  class="proof-textarea"
                  :placeholder="t('ownership.pasteRangeProof')"
                />
              </n-form-item>
              <div class="ownership-proof__actions">
                <n-button size="small" quaternary :disabled="rangeVerifyLoading" @click="triggerFileInput">
                  {{ t('ownership.workbench.verify.loadFile') }}
                </n-button>
                <n-button type="primary" :loading="rangeVerifyLoading" @click="handleRangeVerify">
                  {{ t('ownership.verifyRange') }}
                </n-button>
              </div>
            </n-form>

            <input ref="fileInput" type="file" accept=".json,application/json" class="file-input" @change="handleFileChange" />

            <n-alert
              v-if="inputErrorKey"
              type="warning"
              :title="t('ownership.workbench.verify.inputInvalidTitle')"
              :show-icon="true"
              class="input-error"
            >
              <p class="input-error__reason">{{ t(inputErrorKey) }}</p>
              <p class="input-error__hint">{{ t('ownership.workbench.verify.inputInvalidHint') }}</p>
            </n-alert>
          </template>
        </div>

        <aside class="ownership-proof__aside">
          <p class="aside-title">
            {{ mode === 'generate' ? t('ownership.workbench.proof.structure') : t('ownership.workbench.verify.semantics') }}
          </p>
          <ul class="aside-list">
            <li v-for="item in asideItems" :key="item">{{ item }}</li>
          </ul>
          <p class="aside-note">{{ asideNote }}</p>
        </aside>
      </div>
    </WorkbenchSection>

    <template v-if="mode === 'generate'">
      <OwnershipResultPanel
        v-if="genResult || genError"
        :title="t('ownership.singleResult')"
        :headline="genHeadline"
        :headline-label="t('common.result')"
        :facts="genFacts"
        :result="genResult"
        :error="genError"
        :notes="genNotes"
        filename="ownership-membership-proof.json"
        track-job
      />
      <OwnershipResultPanel
        v-if="rangeGenResult || rangeGenError"
        :title="t('ownership.rangeResult')"
        :facts="[]"
        :result="rangeGenResult"
        :error="rangeGenError"
        :notes="rangeGenNotes"
        filename="ownership-range-proof-job.json"
        show-job-outcome
        track-job
      />
    </template>
    <template v-else>
      <OwnershipResultPanel
        v-if="verifyResult || verifyError"
        :title="t('ownership.workbench.verify.resultTitle')"
        :headline="verifyHeadline"
        :headline-label="t('ownership.workbench.verify.verdict')"
        :facts="verifyFacts"
        :result="verifyResult"
        :error="verifyError"
        :notes="verifyNotes"
        filename="ownership-verification.json"
      />
      <OwnershipResultPanel
        v-if="rangeVerifyResult || rangeVerifyError"
        :title="t('ownership.workbench.verify.rangeResultTitle')"
        :facts="[]"
        :result="rangeVerifyResult"
        :error="rangeVerifyError"
        :notes="rangeVerifyNotes"
        filename="ownership-range-verification-job.json"
        show-job-outcome
      />
    </template>
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
  NRadioGroup,
  NSelect,
  useMessage,
} from 'naive-ui'
import UserSelect from '@/components/UserSelect.vue'
import {
  generateProof,
  generateRangeProof,
  verifyProof,
  verifyRangeProof,
} from '@/api/ownership'
import TableSelect from '@/components/TableSelect.vue'
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import { useI18n } from '@/stores/i18n'
import OwnershipResultPanel from './OwnershipResultPanel.vue'
import {
  parseProofInput,
  proofIdentityFacts,
  proofSummaryFacts,
  requestErrorMessage,
  verificationVerdict,
  type SummaryFact,
} from './ownershipWorkbench'

const props = defineProps<{ mode: 'generate' | 'verify' }>()
const { t } = useI18n()
const message = useMessage()
function isOwnershipRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const isRangeMode = ref(false)

const membershipOptions = computed(() => [
  { label: t('ownership.membership'), value: 'membership' },
  { label: t('ownership.nonMembership'), value: 'non-membership' },
])

const modeTitle = computed(() => props.mode === 'generate'
  ? t('ownership.workbench.generate.title')
  : t('ownership.workbench.verify.title'))
const modeDescription = computed(() => props.mode === 'generate'
  ? t('ownership.workbench.generate.description')
  : t('ownership.workbench.verify.description'))

const asideItems = computed(() => props.mode === 'verify'
  ? [
      t('ownership.workbench.verify.semanticsPoint1'),
      t('ownership.workbench.verify.semanticsPoint2'),
      t('ownership.workbench.verify.semanticsPoint3'),
    ]
  : isRangeMode.value
    ? [
        t('ownership.workbench.proof.rangeStructurePoint1'),
        t('ownership.workbench.proof.rangeStructurePoint2'),
        t('ownership.workbench.proof.rangeStructurePoint3'),
      ]
    : [
        t('ownership.workbench.proof.structurePoint1'),
        t('ownership.workbench.proof.structurePoint2'),
        t('ownership.workbench.proof.structurePoint3'),
      ])
const asideNote = computed(() => props.mode === 'verify'
  ? t('ownership.workbench.verify.semanticsNote')
  : t('ownership.workbench.proof.structureNote'))

/* Generation */
const genForm = ref({
  proofType: 'membership' as 'membership' | 'non-membership',
  ownerId: '',
  tableId: '',
  rowId: '',
  columnId: 0 as number | null,
})
const genLoading = ref(false)
const genResult = ref<Record<string, unknown> | null>(null)
const genError = ref('')
const genFacts = computed<SummaryFact[]>(() => genResult.value ? proofSummaryFacts(genResult.value, t) : [])
const genNotes = computed(() => genResult.value ? [t('ownership.workbench.proof.hashEvidenceNote')] : [])
const proofTypeHint = computed(() => genForm.value.proofType === 'membership'
  ? t('ownership.workbench.proof.memberSemantics')
  : t('ownership.workbench.proof.nonMemberSemantics'))
const genHeadline = computed(() => {
  const result = genResult.value
  if (!result) return ''
  if (result.proofType === 'membership') return t('ownership.workbench.proof.generatedMembership')
  if (result.proofType === 'non-membership') return t('ownership.workbench.proof.generatedNonMembership')
  return ''
})

async function handleGenerate() {
  const ownerId = genForm.value.ownerId.trim()
  const columnId = genForm.value.columnId
  if (!ownerId) { message.warning(t('ownership.fillOwnerId')); return }
  if (!genForm.value.tableId) { message.warning(t('identity.fillTableId')); return }
  if (columnId === null || !Number.isInteger(columnId)) {
    message.warning(t('ownership.workbench.proof.columnRequired')); return
  }
  genLoading.value = true
  genResult.value = null
  genError.value = ''
  try {
    const response = await generateProof({
      proofType: genForm.value.proofType,
      ownerId,
      tableId: genForm.value.tableId,
      rowId: genForm.value.rowId,
      columnId,
    })
    if (!isOwnershipRecord(response)) throw new TypeError('Invalid ownership proof response')
    genResult.value = response
    message.success(t('ownership.proofGenerateSuccess'))
  } catch (error) {
    genError.value = requestErrorMessage(error)
  } finally {
    genLoading.value = false
  }
}

const rangeGenForm = ref({ ownerId: '', tableIdFrom: '', tableIdTo: '', rowIdFrom: '', rowIdTo: '' })
const rangeGenLoading = ref(false)
const rangeGenResult = ref<Record<string, unknown> | null>(null)
const rangeGenError = ref('')
const rangeGenNotes = computed(() => rangeGenResult.value
  ? [t('ownership.workbench.proof.rangeJobNote'), t('ownership.workbench.proof.rangeFailureNote')]
  : [])

async function handleRangeGenerate() {
  const ownerId = rangeGenForm.value.ownerId.trim()
  if (!ownerId) { message.warning(t('ownership.fillOwnerId')); return }
  if (!rangeGenForm.value.tableIdFrom || !rangeGenForm.value.tableIdTo) {
    message.warning(t('identity.fillTableId')); return
  }
  rangeGenLoading.value = true
  rangeGenResult.value = null
  rangeGenError.value = ''
  try {
    const response = await generateRangeProof({
      ownerId,
      tableIdFrom: rangeGenForm.value.tableIdFrom,
      tableIdTo: rangeGenForm.value.tableIdTo,
      rowIdFrom: rangeGenForm.value.rowIdFrom,
      rowIdTo: rangeGenForm.value.rowIdTo,
    })
    if (!isOwnershipRecord(response)) throw new TypeError('Invalid ownership proof response')
    rangeGenResult.value = response
    message.success(t('ownership.rangeProofSubmitted'))
  } catch (error) {
    rangeGenError.value = requestErrorMessage(error)
  } finally {
    rangeGenLoading.value = false
  }
}

/* Verification */
const verifyForm = ref({ proofType: 'membership', proofJson: '' })
const verifyLoading = ref(false)
const verifyResult = ref<Record<string, unknown> | null>(null)
const verifyError = ref('')
const verifySubmitted = ref<Record<string, unknown> | null>(null)
const inputErrorKey = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const verifyFacts = computed<SummaryFact[]>(() => verifySubmitted.value
  ? proofIdentityFacts(verifySubmitted.value)
  : [])
const verifyHeadline = computed(() => {
  const result = verifyResult.value
  if (!result) return ''
  const verdict = verificationVerdict(result)
  if (verdict === 'valid') return t('ownership.workbench.verify.valid')
  if (verdict === 'invalid') return t('ownership.workbench.verify.invalid')
  return t('ownership.workbench.verify.verdictUnknown')
})
const verifyNotes = computed(() => {
  const notes: string[] = []
  if (verifyResult.value) {
    notes.push(t('ownership.workbench.verify.staleNote'))
    notes.push(t('ownership.workbench.proof.hashEvidenceNote'))
  }
  if (verifyError.value) notes.push(t('ownership.workbench.verify.executionFailed'))
  return notes
})

async function handleVerify() {
  const parsed = parseProofInput(verifyForm.value.proofJson)
  if (!parsed.ok) {
    inputErrorKey.value = parsed.reasonKey
    verifyResult.value = null
    verifyError.value = ''
    return
  }
  inputErrorKey.value = ''
  verifyLoading.value = true
  verifyResult.value = null
  verifyError.value = ''
  try {
    const response = await verifyProof(verifyForm.value.proofType, parsed.value)
    if (!isOwnershipRecord(response)) throw new TypeError('Invalid ownership proof response')
    verifySubmitted.value = parsed.value
    verifyResult.value = response
  } catch (error) {
    verifyError.value = requestErrorMessage(error)
  } finally {
    verifyLoading.value = false
  }
}

const rangeVerifyForm = ref({ proofJson: '' })
const rangeVerifyLoading = ref(false)
const rangeVerifyResult = ref<Record<string, unknown> | null>(null)
const rangeVerifyError = ref('')
const rangeVerifyNotes = computed(() => {
  const notes: string[] = []
  if (rangeVerifyResult.value) notes.push(t('ownership.workbench.verify.rangeJobNote'))
  if (rangeVerifyError.value) notes.push(t('ownership.workbench.verify.executionFailed'))
  return notes
})

async function handleRangeVerify() {
  const parsed = parseProofInput(rangeVerifyForm.value.proofJson)
  if (!parsed.ok) {
    inputErrorKey.value = parsed.reasonKey
    rangeVerifyResult.value = null
    rangeVerifyError.value = ''
    return
  }
  inputErrorKey.value = ''
  rangeVerifyLoading.value = true
  rangeVerifyResult.value = null
  rangeVerifyError.value = ''
  try {
    const response = await verifyRangeProof(parsed.value)
    if (!isOwnershipRecord(response)) throw new TypeError('Invalid ownership proof response')
    rangeVerifyResult.value = response
  } catch (error) {
    rangeVerifyError.value = requestErrorMessage(error)
  } finally {
    rangeVerifyLoading.value = false
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    message.warning(t('ownership.workbench.verify.fileTooLarge'))
    return
  }
  try {
    const text = await file.text()
    if (isRangeMode.value) rangeVerifyForm.value.proofJson = text
    else verifyForm.value.proofJson = text
    inputErrorKey.value = ''
  } catch {
    message.error(t('ownership.workbench.verify.fileReadFailed'))
  }
}

watch(() => [verifyForm.value.proofJson, rangeVerifyForm.value.proofJson, isRangeMode.value] as const, () => {
  inputErrorKey.value = ''
})

watch(isRangeMode, () => {
  genResult.value = null
  genError.value = ''
  rangeGenResult.value = null
  rangeGenError.value = ''
  verifyResult.value = null
  verifyError.value = ''
  verifySubmitted.value = null
  rangeVerifyResult.value = null
  rangeVerifyError.value = ''
  inputErrorKey.value = ''
})
</script>

<style scoped>
.ownership-proof {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  min-width: 0;
}
.ownership-proof__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(260px, 0.85fr);
  gap: var(--apple-section-gap);
  align-items: start;
}
.ownership-proof__form {
  min-width: 0;
}
.proof-scope {
  margin-bottom: var(--apple-space-4);
}
.proof-scope__label {
  margin: 0 0 var(--apple-space-2);
  color: var(--apple-gray-3);
  font-size: 12px;
}
.ownership-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--apple-space-3) var(--apple-space-4);
}
.ownership-form-grid__wide {
  grid-column: 1 / -1;
}
.ownership-proof__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--apple-space-4);
  margin-top: var(--apple-space-3);
}
.file-input {
  display: none;
}
.proof-textarea :deep(textarea) {
  font-family: var(--apple-font-mono);
  font-size: 11.5px;
  line-height: 1.55;
}
.field-hint {
  margin: var(--apple-space-1) 0 var(--apple-space-3);
  color: var(--apple-gray-4);
  font-size: 11.5px;
  line-height: 1.55;
}
.input-error {
  margin-top: var(--apple-space-3);
}
.input-error__reason {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 12.5px;
}
.input-error__hint {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
}
.ownership-proof__aside {
  min-width: 0;
  padding-left: var(--apple-space-4);
  border-left: 1px solid var(--apple-border);
}
.aside-title {
  margin: 0 0 var(--apple-space-2);
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 620;
}
.aside-list {
  margin: 0;
  padding-left: 16px;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.65;
}
.aside-note {
  margin: var(--apple-space-3) 0 0;
  color: var(--apple-gray-4);
  font-size: 11.5px;
  line-height: 1.6;
}
@media (max-width: 900px) {
  .ownership-proof__layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .ownership-proof__aside {
    padding-top: var(--apple-space-4);
    padding-left: 0;
    border-top: 1px solid var(--apple-border);
    border-left: 0;
  }
}
@media (max-width: 560px) {
  .ownership-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
