<template>
  <section v-if="hasContent" class="operation-result">
    <header class="operation-result__head">
      <div class="operation-result__heading">
        <h3 class="operation-result__title">{{ title }}</h3>
        <n-tag
          v-if="resolvedOutcome"
          size="small"
          :bordered="false"
          :type="outcomeTone"
          class="operation-result__badge"
        >
          <span class="operation-result__badge-label">{{ t('operationResult.outcomeLabel') }}</span>
          {{ t(OPERATION_OUTCOME_LABEL_KEYS[resolvedOutcome]) }}
        </n-tag>
      </div>
      <div v-if="hasResult" class="operation-result__actions">
        <n-button size="tiny" ghost @click="handleCopy">
          <template #icon><n-icon :component="copiedAll ? CheckmarkOutline : CopyOutline" size="14" /></template>
          {{ copiedAll ? t('common.copied') : t('operationResult.copyJson') }}
        </n-button>
        <n-button v-if="filename" size="tiny" ghost @click="handleDownload">
          <template #icon><n-icon :component="DownloadOutline" size="14" /></template>
          {{ t('operationResult.downloadJson') }}
        </n-button>
      </div>
    </header>

    <n-alert v-if="error" type="error" :title="errorTitle || t('common.operationFailed')" :show-icon="true">
      {{ error }}
    </n-alert>
    <n-alert v-if="notice" type="info" :show-icon="true">
      {{ notice }}
    </n-alert>

    <div v-if="headline" class="operation-result__headline">
      <p v-if="headlineLabel" class="operation-result__headline-label">{{ headlineLabel }}</p>
      <p class="operation-result__headline-text">{{ headline }}</p>
    </div>

    <div v-for="group in factGroups" :key="group.key" class="operation-result__group">
      <p v-if="group.titleKey" class="operation-result__group-title">{{ t(group.titleKey) }}</p>
      <dl class="operation-result__facts">
        <div v-for="fact in group.facts" :key="`${fact.labelKey}:${fact.value}`" class="operation-result__fact">
          <dt>{{ t(fact.labelKey) }}</dt>
          <dd :class="{ 'is-mono': fact.mono && !fact.note }">
            <span v-if="fact.note" class="operation-result__user">
              <strong>{{ fact.note }}</strong>
              <code :title="fact.value">({{ fact.value }})</code>
            </span>
            <span v-else class="operation-result__value">{{ fact.value }}</span>
            <button
              v-if="fact.mono"
              type="button"
              class="operation-result__copy"
              :aria-label="`${t('common.copy')}: ${t(fact.labelKey)}`"
              @click="handleCopyValue(fact.value)"
            >
              <n-icon :component="copiedValue === fact.value ? CheckmarkOutline : CopyOutline" size="13" />
            </button>
          </dd>
        </div>
      </dl>
    </div>

    <slot name="job" />

    <section
      v-if="frozenSubmission"
      class="operation-result__submission"
      :aria-label="t('operationResult.submission')"
    >
      <p class="operation-result__submission-title">{{ t('operationResult.submission') }}</p>
      <dl v-if="frozenSubmission.fields.length" class="operation-result__facts">
        <div
          v-for="field in frozenSubmission.fields"
          :key="`${field.labelKey}:${field.value}`"
          class="operation-result__fact"
        >
          <dt>{{ t(field.labelKey) }}</dt>
          <dd :class="{ 'is-mono': field.mono }">{{ field.value }}</dd>
        </div>
      </dl>
      <p v-if="hasContext" class="operation-result__context">
        <span v-if="frozenSubmission.submittedAt" class="operation-result__context-item">
          {{ t('operationResult.submittedAt') }}
          <time class="operation-result__mono" :datetime="frozenSubmission.submittedAt">{{ frozenSubmission.submittedAt }}</time>
        </span>
        <span v-if="requestId" class="operation-result__context-item">
          {{ t('operationResult.requestId') }}
          <code class="operation-result__mono">{{ requestId }}</code>
        </span>
        <span v-if="traceId" class="operation-result__context-item">
          {{ t('operationResult.traceId') }}
          <code class="operation-result__mono">{{ traceId }}</code>
          <router-link class="operation-result__trace-link" :to="traceLink">
            {{ t('operationResult.viewTrace') }}<span aria-hidden="true"> →</span>
          </router-link>
        </span>
      </p>
    </section>

    <p v-else-if="hasContext" class="operation-result__context">
      <span v-if="requestId" class="operation-result__context-item">
        {{ t('operationResult.requestId') }}
        <code class="operation-result__mono">{{ requestId }}</code>
      </span>
      <span v-if="traceId" class="operation-result__context-item">
        {{ t('operationResult.traceId') }}
        <code class="operation-result__mono">{{ traceId }}</code>
        <router-link class="operation-result__trace-link" :to="traceLink">
          {{ t('operationResult.viewTrace') }}<span aria-hidden="true"> →</span>
        </router-link>
      </span>
    </p>

    <ul v-if="notes.length" class="operation-result__notes">
      <li v-for="note in notes" :key="note">{{ note }}</li>
    </ul>

    <template v-if="hasResult">
      <p class="operation-result__source">{{ jsonNote || t('operationResult.rawNote') }}</p>
      <n-collapse class="operation-result__json" :default-expanded-names="defaultOpen ? ['json'] : []">
        <n-collapse-item name="json">
          <template #header>
            <span class="operation-result__json-title">{{ jsonTitle || t('operationResult.technicalJson') }}</span>
            <span class="operation-result__json-size">{{ sizeLabel }}</span>
          </template>
          <pre
            class="operation-result__json-body"
            tabindex="0"
            :aria-label="jsonTitle || t('operationResult.technicalJson')"
          >{{ jsonText }}</pre>
        </n-collapse-item>
      </n-collapse>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NAlert, NButton, NCollapse, NCollapseItem, NIcon, NTag } from 'naive-ui'
import { CheckmarkOutline, CopyOutline, DownloadOutline } from '@vicons/ionicons5'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/stores/i18n'
import {
  OPERATION_OUTCOME_LABEL_KEYS,
  classifyOperationOutcome,
  freezeSubmissionSnapshot,
  operationOutcomeTone,
  resultRequestId,
  resultTraceId,
  type OperationOutcomeKind,
  type OperationSubmissionSnapshot,
  type ResultFact,
  type ResultFactGroup,
} from '@/components/operationResult'
import { copyText, downloadTextFile, exactJsonText, fileSizeLabel } from '@/utils/textExport'

const props = withDefaults(defineProps<{
  title: string
  headline?: string
  headlineLabel?: string
  /** Omit to classify from the answer; a real error always wins. */
  outcome?: OperationOutcomeKind
  facts?: readonly ResultFact[]
  groups?: readonly ResultFactGroup[]
  result?: unknown
  error?: string
  errorTitle?: string
  notice?: string
  notes?: readonly string[]
  submission?: OperationSubmissionSnapshot | null
  filename?: string
  defaultOpen?: boolean
  jsonTitle?: string
  jsonNote?: string
}>(), {
  headline: '',
  headlineLabel: '',
  outcome: undefined,
  facts: () => [],
  groups: () => [],
  result: undefined,
  error: '',
  errorTitle: '',
  notice: '',
  notes: () => [],
  submission: null,
  filename: '',
  defaultOpen: false,
  jsonTitle: '',
  jsonNote: '',
})

const { t } = useI18n()
const copiedAll = ref(false)
const copiedValue = ref('')

const hasResult = computed(() => props.result !== undefined && props.result !== null)
const frozenSubmission = computed(() => (
  props.submission ? freezeSubmissionSnapshot(props.submission) : null
))
const factGroups = computed<readonly ResultFactGroup[]>(() => {
  if (props.groups.length) return props.groups
  return props.facts.length ? [{ key: 'facts', facts: props.facts }] : []
})
const hasContent = computed(() => Boolean(
  hasResult.value
  || props.error
  || props.notice
  || props.headline
  || factGroups.value.length
  || frozenSubmission.value,
))
const hasContext = computed(() => Boolean(
  frozenSubmission.value?.submittedAt || requestId.value || traceId.value,
))
const requestId = computed(() => frozenSubmission.value?.requestId || resultRequestId(props.result))
const traceId = computed(() => frozenSubmission.value?.traceId || resultTraceId(props.result))
const traceLink = computed(() => ({ name: 'events', query: { traceId: traceId.value } }))
const jsonText = computed(() => (hasResult.value ? exactJsonText(props.result) : ''))
const sizeLabel = computed(() => fileSizeLabel(jsonText.value))
const resolvedOutcome = computed<OperationOutcomeKind | null>(() => {
  if (props.error.trim()) return 'failed'
  if (props.outcome) return props.outcome
  return hasResult.value ? classifyOperationOutcome(props.result) : null
})
const outcomeTone = computed(() => (
  resolvedOutcome.value ? operationOutcomeTone(resolvedOutcome.value) : 'default'
))

async function handleCopy() {
  if (await copyText(jsonText.value)) {
    copiedAll.value = true
    setTimeout(() => { copiedAll.value = false }, 2000)
  }
}

function handleDownload() {
  downloadTextFile(props.filename || 'operation-result.json', jsonText.value)
}

async function handleCopyValue(value: string) {
  if (await copyText(value)) {
    copiedValue.value = value
    setTimeout(() => {
      if (copiedValue.value === value) copiedValue.value = ''
    }, 2000)
  }
}
</script>

<style scoped>
.operation-result {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
  min-width: 0;
  margin-top: var(--apple-space-4);
  padding-top: var(--apple-space-4);
  border-top: 1px solid var(--apple-border);
}
.operation-result__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--apple-space-3);
}
.operation-result__heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  min-width: 0;
}
.operation-result__title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 620;
}
.operation-result__badge-label {
  margin-right: 6px;
  color: var(--apple-gray-3);
  font-weight: 500;
}
.operation-result__actions {
  display: flex;
  align-items: center;
  gap: var(--apple-space-4);
}
.operation-result__group {
  min-width: 0;
}
.operation-result__headline {
  min-width: 0;
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}
.operation-result__headline-label {
  margin: 0 0 var(--apple-space-1);
  color: var(--apple-gray-4);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.operation-result__headline-text {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 16px;
  font-weight: 620;
  line-height: 1.4;
}
.operation-result__group-title {
  margin: 0 0 var(--apple-space-1);
  color: var(--apple-gray-4);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
}
.operation-result__facts {
  display: grid;
  grid-template-columns: minmax(120px, max-content) minmax(0, 1fr);
  gap: var(--apple-space-1) var(--apple-space-4);
  margin: 0;
}
.operation-result__fact {
  display: contents;
}
.operation-result__fact dt {
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.6;
}
.operation-result__fact dd {
  display: flex;
  align-items: baseline;
  gap: var(--apple-space-2);
  min-width: 0;
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 12.5px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.operation-result__fact dd.is-mono {
  font-family: var(--apple-font-mono);
  font-size: 11.5px;
}
.operation-result__user {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: baseline;
  gap: 4px;
  overflow: hidden;
  white-space: nowrap;
}
.operation-result__user strong {
  min-width: 0;
  overflow: hidden;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.operation-result__user code {
  flex: 0 1 auto;
  overflow: hidden;
  color: var(--apple-gray-3);
  font-family: var(--apple-font-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.operation-result__copy {
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--apple-gray-4);
  cursor: pointer;
  line-height: 1;
}
.operation-result__copy:hover,
.operation-result__copy:focus-visible {
  color: var(--apple-blue);
}
.operation-result__submission {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-2);
  min-width: 0;
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  background: var(--apple-card);
}
.operation-result__submission-title {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
}
.operation-result__context {
  display: flex;
  flex-wrap: wrap;
  gap: var(--apple-space-2) var(--apple-space-4);
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 11.5px;
  line-height: 1.6;
}
.operation-result__context-item {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.operation-result__mono {
  color: var(--apple-gray-2);
  font-family: var(--apple-font-mono);
  font-size: 11px;
}
.operation-result__trace-link {
  color: var(--apple-blue);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.operation-result__trace-link:hover,
.operation-result__trace-link:focus-visible {
  color: var(--apple-blue-hover);
}
.operation-result__notes {
  margin: 0;
  padding-left: 18px;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}
.operation-result__source {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 11.5px;
  line-height: 1.6;
}
.operation-result__json-title {
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 600;
}
.operation-result__json-size {
  margin-left: var(--apple-space-2);
  color: var(--apple-gray-4);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.operation-result__json-body {
  max-height: 420px;
  margin: 0;
  padding: var(--apple-space-3);
  overflow: auto;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  background: var(--apple-bg);
  color: var(--apple-gray-2);
  font-family: var(--apple-font-mono);
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre;
}
@media (max-width: 680px) {
  .operation-result__facts {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
  .operation-result__fact dt {
    margin-top: var(--apple-space-2);
  }
}
</style>
