<template>
  <section v-if="result || error || facts.length" class="ownership-result">
    <header class="ownership-result__head">
      <h3 class="ownership-result__title">{{ title }}</h3>
      <div v-if="result" class="ownership-result__actions">
        <n-button size="tiny" ghost @click="handleCopy">
          <template #icon><n-icon :component="copiedAll ? CheckmarkOutline : CopyOutline" size="14" /></template>
          {{ copiedAll ? t('common.copied') : t('ownership.workbench.copyJson') }}
        </n-button>
        <n-button size="tiny" ghost @click="handleDownload">
          <template #icon><n-icon :component="DownloadOutline" size="14" /></template>
          {{ t('ownership.workbench.downloadJson') }}
        </n-button>
      </div>
    </header>

    <n-alert v-if="error" type="error" :title="errorTitle || t('common.operationFailed')" :show-icon="true">
      {{ error }}
    </n-alert>

    <div v-if="headline" class="ownership-result__headline">
      <p v-if="headlineLabel" class="ownership-result__headline-label">{{ headlineLabel }}</p>
      <p class="ownership-result__headline-text">{{ headline }}</p>
    </div>

    <div v-for="group in factGroups" :key="group.key" class="ownership-result__group">
      <p v-if="group.titleKey" class="ownership-result__group-title">{{ t(group.titleKey) }}</p>
      <dl class="ownership-result__facts">
        <div v-for="fact in group.facts" :key="`${fact.labelKey}:${fact.value}`" class="ownership-result__fact">
          <dt>{{ t(fact.labelKey) }}</dt>
          <dd :class="{ 'is-mono': fact.mono && !ownerNameForFact(fact) }">
            <span v-if="ownerNameForFact(fact)" class="ownership-result__user">
              <strong>{{ ownerNameForFact(fact) }}</strong>
              <code :title="fact.value">({{ fact.value }})</code>
            </span>
            <span v-else class="ownership-result__value">{{ fact.value }}</span>
            <button
              v-if="fact.mono"
              type="button"
              class="ownership-result__copy"
              :aria-label="t('ownership.workbench.copyValue')"
              @click="handleCopyValue(fact.value)"
            >
              <n-icon :component="copiedValue === fact.value ? CheckmarkOutline : CopyOutline" size="13" />
            </button>
          </dd>
        </div>
      </dl>
    </div>

    <OwnershipJobLink v-if="resolvedJobId" :job-id="resolvedJobId ?? ''" :track="trackJob" />

    <ul v-if="notes.length" class="ownership-result__notes">
      <li v-for="note in notes" :key="note">{{ note }}</li>
    </ul>

    <template v-if="result">
      <p class="ownership-result__source">{{ t('ownership.workbench.result.sourceNote') }}</p>
      <n-collapse class="ownership-result__json" :default-expanded-names="defaultOpen ? ['json'] : []">
        <n-collapse-item name="json">
          <template #header>
            <span class="ownership-result__json-title">{{ t('ownership.workbench.technicalJson') }}</span>
            <span class="ownership-result__json-size">{{ sizeLabel }}</span>
          </template>
          <pre class="ownership-result__json-body">{{ jsonText }}</pre>
        </n-collapse-item>
      </n-collapse>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NCollapse, NCollapseItem, NIcon } from 'naive-ui'
import { CheckmarkOutline, CopyOutline, DownloadOutline } from '@vicons/ionicons5'
import { useI18n } from '@/stores/i18n'
import { useJobTracking } from '@/stores/jobTracking'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import OwnershipJobLink from './OwnershipJobLink.vue'
import {
  copyText,
  downloadTextFile,
  exactJsonText,
  fileSizeLabel,
  jobMetadataFacts,
  resultJobId,
  type SummaryFact,
} from './ownershipWorkbench'

const props = withDefaults(defineProps<{
  title: string
  headline?: string
  headlineLabel?: string
  facts?: SummaryFact[]
  notes?: string[]
  result?: Record<string, unknown> | null
  error?: string
  errorTitle?: string
  jobId?: string | null
  filename?: string
  defaultOpen?: boolean
  showJobOutcome?: boolean
  trackJob?: boolean
}>(), {
  headline: '',
  headlineLabel: '',
  facts: () => [],
  notes: () => [],
  result: null,
  error: '',
  errorTitle: '',
  jobId: null,
  filename: 'ownership-result.json',
  defaultOpen: false,
  showJobOutcome: false,
  trackJob: false,
})

const { t } = useI18n()
const { snapshots } = useJobTracking()
const copiedAll = ref(false)
const copiedValue = ref('')

const resolvedJobId = computed(() => props.jobId ?? resultJobId(props.result))
const jsonText = computed(() => exactJsonText(props.result))
const sizeLabel = computed(() => fileSizeLabel(jsonText.value))
const jobFacts = computed(() => {
  if (!props.showJobOutcome || !resolvedJobId.value) return []
  return jobMetadataFacts(snapshots[resolvedJobId.value], t)
})
const OWNER_ID_FACT_KEYS = new Set([
  'ownership.ownerId',
  'ownership.mutation.owner',
  'ownership.workbench.mutation.sourceOwner',
  'ownership.workbench.mutation.targetOwner',
])
const { usersById, ensureUsersLoaded } = useReferenceCatalog()
const hasOwnerIdFacts = computed(() => [...props.facts, ...jobFacts.value]
  .some(fact => OWNER_ID_FACT_KEYS.has(fact.labelKey)))
watch(hasOwnerIdFacts, needed => {
  if (needed) void ensureUsersLoaded()
}, { immediate: true })
function ownerNameForFact(fact: SummaryFact): string | null {
  if (!OWNER_ID_FACT_KEYS.has(fact.labelKey)) return null
  return usersById.value.get(fact.value) ?? null
}
const factGroups = computed(() => {
  const groups: Array<{ key: string; titleKey: string; facts: SummaryFact[] }> = []
  if (props.facts.length) groups.push({ key: 'response', titleKey: '', facts: props.facts })
  if (jobFacts.value.length) {
    groups.push({ key: 'job', titleKey: 'ownership.workbench.jobOutcome', facts: jobFacts.value })
  }
  return groups
})

async function handleCopy() {
  if (await copyText(jsonText.value)) {
    copiedAll.value = true
    setTimeout(() => { copiedAll.value = false }, 2000)
  }
}

function handleDownload() {
  downloadTextFile(props.filename, jsonText.value)
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
.ownership-result {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
  min-width: 0;
  margin-top: var(--apple-space-4);
  padding-top: var(--apple-space-4);
  border-top: 1px solid var(--apple-border);
}
.ownership-result__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--apple-space-3);
}
.ownership-result__title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 620;
}
.ownership-result__actions {
  display: flex;
  align-items: center;
  gap: var(--apple-space-4);
}
.ownership-result__group {
  min-width: 0;
}
.ownership-result__headline {
  min-width: 0;
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}
.ownership-result__headline-label {
  margin: 0 0 var(--apple-space-1);
  color: var(--apple-gray-4);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.ownership-result__headline-text {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 16px;
  font-weight: 620;
  line-height: 1.4;
}
.ownership-result__group-title {
  margin: 0 0 var(--apple-space-1);
  color: var(--apple-gray-4);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
}
.ownership-result__facts {
  display: grid;
  grid-template-columns: minmax(120px, max-content) minmax(0, 1fr);
  gap: var(--apple-space-1) var(--apple-space-4);
  margin: 0;
}
.ownership-result__fact {
  display: contents;
}
.ownership-result__fact dt {
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.6;
}
.ownership-result__fact dd {
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
.ownership-result__fact dd.is-mono {
  font-family: var(--apple-font-mono);
  font-size: 11.5px;
}
.ownership-result__user {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: baseline;
  gap: 4px;
  overflow: hidden;
  white-space: nowrap;
}
.ownership-result__user strong {
  min-width: 0;
  overflow: hidden;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ownership-result__user code {
  flex: 0 1 auto;
  overflow: hidden;
  color: var(--apple-gray-3);
  font-family: var(--apple-font-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ownership-result__copy {
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--apple-gray-4);
  cursor: pointer;
  line-height: 1;
}
.ownership-result__copy:hover,
.ownership-result__copy:focus-visible {
  color: var(--apple-blue);
}
.ownership-result__notes {
  margin: 0;
  padding-left: 18px;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}
.ownership-result__source {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 11.5px;
  line-height: 1.6;
}
.ownership-result__json-title {
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 600;
}
.ownership-result__json-size {
  margin-left: var(--apple-space-2);
  color: var(--apple-gray-4);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.ownership-result__json-body {
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
</style>
