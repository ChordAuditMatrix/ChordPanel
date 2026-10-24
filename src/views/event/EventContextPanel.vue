<template>
  <div class="event-context">
    <section class="context-block">
      <h3 class="block-title">{{ t('event.workbench.overview') }}</h3>
      <dl class="facts">
        <div class="fact">
          <dt>{{ t('event.messageType') }}</dt>
          <dd class="mono">{{ event.messageType }}</dd>
        </div>
        <div class="fact">
          <dt>{{ t('event.timestamp') }}</dt>
          <dd>{{ formatDateTime(event.timestampMs) }}</dd>
        </div>
        <div class="fact">
          <dt>{{ t('event.workbench.statusCodeRaw') }}</dt>
          <dd class="mono">{{ event.statusCode ?? '-' }}</dd>
        </div>
        <div class="fact">
          <dt>{{ t('event.workbench.version') }}</dt>
          <dd class="mono">{{ event.version ?? '-' }}</dd>
        </div>
        <div v-if="direction !== 'unknown'" class="fact">
          <dt>{{ t('event.workbench.direction') }}</dt>
          <dd><span class="direction">{{ t(directionKey) }}</span></dd>
        </div>
      </dl>
</section>

    <section class="context-block">
      <h3 class="block-title">{{ t('event.workbench.endpoints') }}</h3>
      <dl class="facts">
        <div class="fact fact--wide">
          <dt>{{ t('event.workbench.queryNode') }}</dt>
          <dd class="mono">{{ nodeId }}</dd>
        </div>
      </dl>
      <p class="endpoints">
        <span class="mono">{{ event.fromNodeId }}</span>
        <span class="endpoint-arrow" aria-hidden="true">→</span>
        <span class="mono">{{ event.toNodeId }}</span>
      </p>
      <p class="note">{{ t('event.workbench.endpointNote') }}</p>
    </section>

    <section class="context-block">
      <h3 class="block-title">{{ t('event.workbench.identifiers') }}</h3>
      <ul class="identifier-list">
        <li class="identifier">
          <span class="identifier-label">{{ t('event.packetId') }}</span>
          <span class="identifier-value mono" :title="event.packetId">{{ event.packetId }}</span>
          <n-button size="tiny" quaternary @click="copy(event.packetId)">
            {{ t('common.copy') }}
          </n-button>
        </li>
        <li class="identifier">
          <span class="identifier-label">{{ t('event.correlationId') }}</span>
          <span class="identifier-value mono" :title="event.correlationId || ''">{{ event.correlationId || '-' }}</span>
          <n-button v-if="event.correlationId" size="tiny" quaternary @click="copy(event.correlationId || '')">
            {{ t('common.copy') }}
          </n-button>
          <n-button v-if="event.correlationId" size="tiny" quaternary @click="emit('filter', 'correlationId', event.correlationId || '')">
            {{ t('event.workbench.filterByCorrelation') }}
          </n-button>
        </li>
        <li class="identifier">
          <span class="identifier-label">{{ t('event.traceId') }}</span>
          <span class="identifier-value mono" :title="event.traceId || ''">{{ event.traceId || '-' }}</span>
          <n-button v-if="event.traceId" size="tiny" quaternary @click="copy(event.traceId || '')">
            {{ t('common.copy') }}
          </n-button>
          <n-button v-if="event.traceId" size="tiny" quaternary @click="emit('filter', 'traceId', event.traceId || '')">
            {{ t('event.workbench.filterByTrace') }}
          </n-button>
        </li>
        <li class="identifier">
          <span class="identifier-label">{{ t('event.tenantId') }}</span>
          <span class="identifier-value mono" :title="event.tenantId || ''">{{ event.tenantId || '-' }}</span>
          <n-button v-if="event.tenantId" size="tiny" quaternary @click="copy(event.tenantId || '')">
            {{ t('common.copy') }}
          </n-button>
        </li>
      </ul>
      <p v-if="event.traceId" class="note">{{ t('event.workbench.traceNote') }}</p>
    </section>

    <section class="context-block">
      <h3 class="block-title">{{ t('event.workbench.references') }}</h3>
      <div v-if="jobId" class="reference">
        <span class="identifier-label">jobId</span>
        <span class="identifier-value mono" :title="jobId">{{ jobId }}</span>
        <n-button size="tiny" quaternary @click="copy(jobId)">{{ t('common.copy') }}</n-button>
        <n-button size="tiny" quaternary type="primary" @click="emit('open-job', jobId)">
          {{ t('event.workbench.openExecution') }}
        </n-button>
      </div>
      <div v-if="taskId" class="reference">
        <span class="identifier-label">taskId</span>
        <span class="identifier-value mono" :title="taskId">{{ taskId }}</span>
        <n-button size="tiny" quaternary @click="copy(taskId)">{{ t('common.copy') }}</n-button>
      </div>
      <p v-if="taskId" class="note">{{ t('event.workbench.taskNote') }}</p>
      <p v-if="!jobId && !taskId" class="note">
        {{ t('event.workbench.referencesNone') }}
      </p>
    </section>

    <section class="context-block">
      <h3 class="block-title">{{ t('event.workbench.sequence') }}</h3>
      <p class="note">{{ t('event.workbench.sequenceNote', { limit: sequenceLimit }) }}</p>
      <p v-if="sequenceState === 'unavailable'" class="note">
        {{ t('event.workbench.sequenceUnavailable') }}
      </p>
      <p v-else-if="sequenceState === 'loading'" class="note">{{ t('common.loading') }}</p>
      <p v-else-if="sequenceState === 'error'" class="note is-error">{{ t('event.workbench.sequenceError') }}</p>
      <p v-else-if="sequenceState === 'ready' && sequence.length === 0" class="note">
        {{ t('event.workbench.sequenceEmpty') }}
      </p>
      <ol v-else-if="sequence.length > 0" class="sequence">
        <li
          v-for="item in sequence"
          :key="`${item.packetId}@${item.timestampMs}`"
          class="sequence-item"
          :class="{ 'is-current': item.packetId === event.packetId && item.timestampMs === event.timestampMs }"
        >
          <button type="button" class="sequence-button" @click="emit('select-event', item)">
            <span class="sequence-time mono">{{ formatDateTime(item.timestampMs) }}</span>
            <span class="sequence-type mono">{{ item.messageType }}</span>
            <span class="sequence-route">{{ item.fromNodeId }} → {{ item.toNodeId }}</span>
            <span v-if="item.packetId === event.packetId && item.timestampMs === event.timestampMs" class="sequence-current">
              {{ t('event.workbench.current') }}
            </span>
          </button>
        </li>
      </ol>
    </section>

    <section class="context-block">
      <n-collapse :default-expanded-names="[]">
        <n-collapse-item name="payload" :title="t('event.payload')">
          <div v-if="hasPayload" class="payload-scroll"><JsonKeyValue :data="payload" /></div>
          <p v-else class="note">{{ t('event.workbench.payloadEmpty') }}</p>
        </n-collapse-item>
        <n-collapse-item v-if="event.statusMessage" name="status-message" :title="t('event.statusMessage')">
          <div class="payload-scroll"><p class="multiline">{{ event.statusMessage }}</p></div>
        </n-collapse-item>
        <n-collapse-item v-if="hasAuthExt" name="auth" :title="t('event.workbench.authExt')">
          <div class="payload-scroll"><JsonKeyValue :data="authExt" /></div>
        </n-collapse-item>
      </n-collapse>
      <p class="note">{{ t('event.workbench.payloadNote') }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMessage } from 'naive-ui'
import type { ProtocolEvent } from '@/api/protocolEvent'
import JsonKeyValue from '@/components/JsonKeyValue.vue'
import { useI18n } from '@/stores/i18n'
import { formatDateTime } from '@/utils/datetime'
import { eventDirection, extractExactReferences } from './eventContext'

const props = defineProps<{
  event: ProtocolEvent
  nodeId: string
  sequence: ProtocolEvent[]
  sequenceState: 'unavailable' | 'loading' | 'ready' | 'error'
  sequenceLimit: number
}>()

const emit = defineEmits<{
  filter: [field: 'correlationId' | 'traceId', value: string]
  'open-job': [jobId: string]
  'select-event': [event: ProtocolEvent]
}>()

const message = useMessage()
const { t } = useI18n()

const direction = computed(() => eventDirection(props.event))
const directionKey = computed(() => direction.value === 'inbound'
  ? 'event.workbench.directionInbound'
  : 'event.workbench.directionOutbound')
const references = computed(() => extractExactReferences(props.event))
const jobId = computed(() => references.value.jobId)
const taskId = computed(() => references.value.taskId)
const payload = computed<Record<string, unknown>>(() => props.event.payload ?? {})
const authExt = computed<Record<string, unknown>>(() => props.event.authExt ?? {})
const hasPayload = computed(() => Object.keys(payload.value).length > 0)
const hasAuthExt = computed(() => Object.keys(authExt.value).length > 0)

async function copy(value: string) {
  if (!navigator.clipboard?.writeText) {
    message.warning(t('common.operationFailed'))
    return
  }
  try {
    await navigator.clipboard.writeText(value)
    message.success(t('common.copied'))
  } catch {
    message.error(t('common.operationFailed'))
  }
}
</script>

<style scoped>
.event-context {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-6);
  padding-bottom: var(--apple-space-4);
}

.context-block {
  min-width: 0;
}

.block-title {
  margin: 0 0 var(--apple-space-3);
  color: var(--apple-gray-3);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--apple-space-3) var(--apple-space-4);
  margin: 0;
}

.fact--wide {
  grid-column: 1 / -1;
}

.fact dt {
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.fact dd {
  margin: 2px 0 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.multiline {
  white-space: pre-wrap;
}

.mono {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

.direction {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-sm);
  font-size: 12px;
}

.endpoints {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  margin: 0;
  padding: var(--apple-space-3);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.endpoint-arrow {
  color: var(--apple-gray-3);
}

.payload-scroll {
  max-height: min(52vh, 480px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
}

.note {
  margin: var(--apple-space-2) 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.55;
}

.note.is-error {
  color: var(--apple-red);
}

.identifier-list {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.identifier,
.reference {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  min-width: 0;
}

.identifier-label {
  flex: 0 0 116px;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.identifier-value {
  flex: 1 1 120px;
  min-width: 0;
  color: var(--apple-gray-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sequence {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sequence-button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px var(--apple-space-3);
  width: 100%;
  padding: var(--apple-space-2);
  border: 1px solid transparent;
  border-radius: var(--apple-radius);
  background: transparent;
  color: var(--apple-gray-1);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--apple-dur) var(--apple-ease-out), border-color var(--apple-dur) var(--apple-ease-out);
}

.sequence-button:hover,
.sequence-button:focus-visible {
  border-color: var(--apple-border);
  background: var(--apple-gray-6);
  outline: none;
}

.sequence-item.is-current .sequence-button {
  border-color: var(--apple-blue);
}

.sequence-time {
  color: var(--apple-gray-3);
}

.sequence-type {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sequence-route {
  grid-column: 1 / -1;
  color: var(--apple-gray-3);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.sequence-current {
  grid-column: 1 / -1;
  color: var(--apple-blue);
  font-size: 11px;
}

@media (max-width: 560px) {
  .facts {
    grid-template-columns: minmax(0, 1fr);
  }

  .identifier-label {
    flex-basis: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sequence-button {
    transition: none;
  }
}
</style>
