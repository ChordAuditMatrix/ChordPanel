<template>
  <OperationResultSurface
    :title="title"
    :headline="headline"
    :headline-label="headlineLabel"
    :outcome="outcome"
    :facts="facts"
    :result="result"
    :error="error"
    :notice="notice"
    :notes="notes"
    :submission="submission"
    :filename="filename"
    :default-open="defaultOpen"
    :json-title="rawTitle"
  >
    <template v-if="jobId" #job>
      <AuditJobLink :job-id="jobId" :track="trackJob" />
    </template>
  </OperationResultSurface>
</template>

<script setup lang="ts">
import OperationResultSurface from '@/components/OperationResultSurface.vue'
import type { OperationOutcomeKind, OperationSubmissionSnapshot } from '@/components/operationResult'
import AuditJobLink from './AuditJobLink.vue'
import type { OperationFact } from './auditOperations'

withDefaults(defineProps<{
  title: string
  facts?: OperationFact[]
  result?: unknown
  error?: string
  notice?: string
  notes?: string[]
  jobId?: string | null
  rawTitle?: string
  trackJob?: boolean
  headline?: string
  headlineLabel?: string
  /** Omit to classify from the answer; a real error always wins. */
  outcome?: OperationOutcomeKind
  /** Immutable target captured before the request; rendered as submitted context. */
  submission?: OperationSubmissionSnapshot | null
  filename?: string
  defaultOpen?: boolean
}>(), {
  facts: () => [],
  result: undefined,
  error: '',
  notice: '',
  notes: () => [],
  jobId: null,
  rawTitle: '',
  trackJob: true,
  headline: '',
  headlineLabel: '',
  outcome: undefined,
  submission: null,
  filename: '',
  defaultOpen: false,
})
</script>
