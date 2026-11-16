<template>
  <OperationResultSurface
    :title="title"
    :headline="headline"
    :headline-label="headlineLabel"
    :outcome="outcome"
    :groups="factGroups"
    :result="result"
    :error="error"
    :error-title="errorTitle"
    :notes="notes"
    :submission="submission"
    :filename="filename"
    :default-open="defaultOpen"
  >
    <template v-if="resolvedJobId" #job>
      <OwnershipJobLink :job-id="resolvedJobId ?? ''" :track="trackJob" />
    </template>
  </OperationResultSurface>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from '@/stores/i18n'
import { useJobTracking } from '@/stores/jobTracking'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import OperationResultSurface from '@/components/OperationResultSurface.vue'
import type {
  OperationOutcomeKind,
  OperationSubmissionSnapshot,
  ResultFact,
  ResultFactGroup,
} from '@/components/operationResult'
import OwnershipJobLink from './OwnershipJobLink.vue'
import { jobMetadataFacts, resultJobId, type SummaryFact } from './ownershipWorkbench'

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
  /** Omit to classify from the answer; a real error always wins. */
  outcome?: OperationOutcomeKind
  /** Immutable target captured before the request; rendered as submitted context. */
  submission?: OperationSubmissionSnapshot | null
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
  outcome: undefined,
  submission: null,
})

const { t } = useI18n()
const { snapshots } = useJobTracking()

const resolvedJobId = computed(() => props.jobId ?? resultJobId(props.result))
const jobFacts = computed<SummaryFact[]>(() => {
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

function displayedFacts(facts: readonly SummaryFact[]): ResultFact[] {
  return facts.map(fact => {
    if (!OWNER_ID_FACT_KEYS.has(fact.labelKey)) return fact
    const note = usersById.value.get(fact.value)
    return note ? { ...fact, note } : fact
  })
}
const factGroups = computed<ResultFactGroup[]>(() => {
  const groups: ResultFactGroup[] = []
  if (props.facts.length) {
    groups.push({ key: 'response', facts: displayedFacts(props.facts) })
  }
  if (jobFacts.value.length) {
    groups.push({
      key: 'job',
      titleKey: 'ownership.workbench.jobOutcome',
      facts: displayedFacts(jobFacts.value),
    })
  }
  return groups
})
</script>
