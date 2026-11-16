<template>
  <div v-if="code" class="graph-unavailable" :data-graph-unavailable="code">
    <p class="graph-unavailable__title">{{ title }}</p>
    <p class="graph-unavailable__body">{{ t('execution.graph.unavailable.body') }}</p>

    <details v-if="backendMessage || backendDetail" class="graph-unavailable__details">
      <summary>{{ t('execution.graph.unavailable.rawDetails') }}</summary>
      <p class="graph-unavailable__raw-note">{{ t('execution.graph.unavailable.rawNote') }}</p>
      <dl class="graph-unavailable__backend">
        <div v-if="backendMessage">
          <dt>{{ t('execution.graph.unavailable.backendMessage') }}</dt>
          <dd class="mono">{{ backendMessage }}</dd>
        </div>
        <div v-if="backendDetail">
          <dt>{{ t('execution.graph.unavailable.backendDetail') }}</dt>
          <dd>{{ backendDetail }}</dd>
        </div>
      </dl>
    </details>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  readGraphUnavailable,
  type GraphUnavailableCode,
} from '@/features/execution/data/graphAvailability'
import { useI18n } from '@/stores/i18n'

const props = defineProps<{
  /** The rejected graph request. Only a documented not-provided code renders. */
  error: unknown
}>()

const { t } = useI18n()

const unavailable = computed(() => readGraphUnavailable(props.error))
const code = computed<GraphUnavailableCode | null>(() => unavailable.value?.code ?? null)
const backendMessage = computed(() => unavailable.value?.message ?? null)
const backendDetail = computed(() => unavailable.value?.detail ?? null)
const title = computed(() => code.value === 'flow_not_found'
  ? t('execution.graph.unavailable.flowTitle')
  : t('execution.graph.unavailable.title'))
</script>

<style scoped>
.graph-unavailable {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--apple-border);
  border-radius: 8px;
  background: var(--apple-fill, rgba(0, 0, 0, 0.03));
}

.graph-unavailable__title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 12px;
  font-weight: 600;
}

.graph-unavailable__body,
.graph-unavailable__demo-note {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 11px;
  line-height: 1.5;
}

.graph-unavailable__backend {
  display: grid;
  gap: 4px;
  margin: 0;
}

.graph-unavailable__details {
  display: grid;
  gap: 4px;
}

.graph-unavailable__details summary {
  cursor: pointer;
  color: var(--apple-gray-2);
  font-size: 11px;
  font-weight: 600;
}

.graph-unavailable__details summary:focus-visible {
  outline: 2px solid var(--apple-blue, #0a66c2);
  outline-offset: 2px;
  border-radius: 3px;
}

.graph-unavailable__raw-note {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.5;
}

.graph-unavailable__backend div {
  display: grid;
  gap: 1px;
}

.graph-unavailable__backend dt {
  color: var(--apple-gray-3);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.graph-unavailable__backend dd {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 11px;
  overflow-wrap: anywhere;
}

</style>
