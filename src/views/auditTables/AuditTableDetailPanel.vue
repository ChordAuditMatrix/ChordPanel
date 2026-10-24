<template>
  <section class="audit-detail" :aria-busy="loading">
    <header class="audit-detail__header">
      <div class="audit-detail__identity">
        <p class="audit-detail__eyebrow">{{ t('auditTables.workbench.detail.title') }}</p>
        <h2 class="audit-detail__name">{{ table.tableName }}</h2>
        <div class="audit-detail__meta">
          <n-tag size="small" :bordered="false" :type="statusType(table.status)">
            {{ t(`auditTables.statuses.${table.status}`) }}
          </n-tag>
          <span class="audit-detail__id">{{ t('auditTables.tableId') }} <code>{{ table.tableId }}</code></span>
          <span v-if="loading" class="audit-detail__loading">{{ t('auditTables.workbench.detail.loading') }}</span>
        </div>
      </div>
    </header>

    <p class="audit-detail__state">{{ t(auditTableStatusDescriptionKey(table.status)) }}</p>

    <n-alert v-if="error" type="warning" :bordered="false" class="audit-detail__alert">
      <p class="audit-detail__alert-line">{{ t('auditTables.workbench.detail.stale') }}</p>
      <p class="audit-detail__alert-reason">{{ error }}</p>
      <n-button text type="primary" size="tiny" @click="emit('retry')">{{ t('auditTables.workbench.detail.retry') }}</n-button>
    </n-alert>
    <p v-if="!inCurrentPage" class="audit-detail__note">{{ t('auditTables.workbench.detail.notInCurrentPage') }}</p>

    <section class="audit-detail__block">
      <div class="audit-detail__block-head">
        <h3 class="audit-detail__block-title">{{ t('auditTables.workbench.lifecycle.title') }}</h3>
        <span class="audit-detail__block-meta">{{ t('auditTables.workbench.lifecycle.scope') }}</span>
      </div>
      <ol class="lifecycle">
        <li v-for="(step, index) in lifecycle" :key="step.key" class="lifecycle__item" :class="`is-${step.state}`">
          <span class="lifecycle__marker" aria-hidden="true">{{ index + 1 }}</span>
          <div class="lifecycle__content">
            <div class="lifecycle__heading">
              <span class="lifecycle__title">{{ t(`auditTables.workbench.lifecycle.steps.${step.key}.title`) }}</span>
              <span class="lifecycle__state">{{ t(`auditTables.workbench.lifecycle.states.${step.state}`) }}</span>
            </div>
            <p class="lifecycle__detail">{{ stepDetail(step) }}</p>
          </div>
        </li>
      </ol>
      <p class="audit-detail__note">{{ t('auditTables.workbench.detail.disclaimer') }}</p>
    </section>

    <section class="audit-detail__block">
      <h3 class="audit-detail__block-title">{{ t('auditTables.workbench.detail.schema') }}</h3>
      <dl class="facts">
        <div class="facts__row">
          <dt>{{ t('auditTables.schemaRevision') }}</dt>
          <dd><code class="facts__mono">{{ table.schemaRevision }}</code></dd>
        </div>
        <div class="facts__row facts__row--stacked">
          <dt>{{ t('auditTables.schemaFingerprint') }}</dt>
          <dd>
            <div class="fingerprint">
              <code class="fingerprint__digest" :title="fingerprint.raw">{{ fingerprint.short || '—' }}</code>
              <template v-if="fingerprint.raw">
                <n-button size="tiny" quaternary @click="copyFingerprint">
                  <template #icon><n-icon :component="copied ? CheckmarkOutline : CopyOutline" /></template>
                  {{ copied ? t('common.copied') : t('common.copy') }}
                </n-button>
                <n-button
                  size="tiny"
                  quaternary
                  :aria-expanded="expanded"
                  @click="expanded = !expanded"
                >{{ t(expanded ? 'auditTables.workbench.fingerprint.collapse' : 'auditTables.workbench.fingerprint.expand') }}</n-button>
              </template>
            </div>
            <pre v-if="expanded && fingerprint.raw" class="fingerprint__full">{{ fingerprint.raw }}</pre>
            <p class="fingerprint__note">{{ t(fingerprint.raw ? 'auditTables.workbench.fingerprint.opaqueNote' : 'auditTables.workbench.fingerprint.unavailable') }}</p>
          </dd>
        </div>
        <div class="facts__row facts__row--stacked">
          <dt>{{ t('auditTables.addressingMode') }}</dt>
          <dd>
            <span class="facts__value">{{ t(`auditTables.addressingModes.${table.addressingMode}`) }}</span>
            <p class="fingerprint__note">{{ addressingNote }}</p>
          </dd>
        </div>
      </dl>
    </section>

    <section class="audit-detail__block">
      <h3 class="audit-detail__block-title">{{ t('auditTables.workbench.detail.actions') }}</h3>
      <div class="audit-detail__actions">
        <n-button size="small" :disabled="!capabilities.validate" @click="emit('validate', table)">{{ t('auditTables.validate') }}</n-button>
        <n-button size="small" :disabled="!capabilities.editAddressing" @click="emit('edit-addressing', table)">{{ t('auditTables.editAddressingMode') }}</n-button>
        <n-button size="small" type="error" ghost :disabled="!capabilities.retire" @click="emit('retire', table)">{{ t('auditTables.retire') }}</n-button>
      </div>
      <p class="audit-detail__note">{{ t('auditTables.workbench.detail.actionHint') }}</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NIcon } from 'naive-ui'
import { CheckmarkOutline, CopyOutline } from '@vicons/ionicons5'
import type { AuditTable, AuditTableStatus } from '@/api/auditTables'
import { useI18n } from '@/stores/i18n'
import {
  auditTableAddressingNoteKey,
  auditTableCapabilities,
  auditTableStatusDescriptionKey,
  buildAuditTableLifecycle,
  describeSchemaFingerprint,
  type AuditTableLifecycleStep,
} from './auditTableModel'

const props = defineProps<{
  table: AuditTable
  loading: boolean
  error: string
  inCurrentPage: boolean
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'validate', table: AuditTable): void
  (event: 'edit-addressing', table: AuditTable): void
  (event: 'retire', table: AuditTable): void
}>()

const { t } = useI18n()

const lifecycle = computed(() => buildAuditTableLifecycle(props.table))
const capabilities = computed(() => auditTableCapabilities(props.table))
const fingerprint = computed(() => describeSchemaFingerprint(props.table.schemaFingerprint))
const addressingNote = computed(() => t(auditTableAddressingNoteKey(props.table)))

function statusType(status: AuditTableStatus): 'success' | 'error' | 'default' | 'warning' {
  if (status === 'active') return 'success'
  if (status === 'invalid') return 'error'
  if (status === 'retired') return 'default'
  return 'warning'
}

function stepDetail(step: AuditTableLifecycleStep): string {
  const params = { ...step.detailParams }
  if (typeof params.mode === 'string') params.mode = t(`auditTables.addressingModes.${params.mode}`)
  return t(step.detailKey, params)
}

const expanded = ref(false)
const copied = ref(false)
let copyTimer: number | null = null

watch(() => props.table.tableId, () => {
  expanded.value = false
  copied.value = false
  if (copyTimer !== null) {
    window.clearTimeout(copyTimer)
    copyTimer = null
  }
})

async function copyFingerprint(): Promise<void> {
  const value = fingerprint.value.raw
  if (!value || !navigator.clipboard?.writeText) return
  try {
    await navigator.clipboard.writeText(value)
    copied.value = true
    if (copyTimer !== null) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => {
      copied.value = false
      copyTimer = null
    }, 1600)
  } catch {
    copied.value = false
  }
}

onBeforeUnmount(() => {
  if (copyTimer !== null) window.clearTimeout(copyTimer)
})
</script>

<style scoped>
.audit-detail {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-4);
  min-width: 0;
  color: var(--apple-gray-1);
}

.audit-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--apple-space-3);
  padding-bottom: var(--apple-space-3);
  border-bottom: 1px solid var(--apple-border);
}

.audit-detail__identity {
  min-width: 0;
}

.audit-detail__eyebrow {
  margin: 0 0 var(--apple-space-1);
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.045em;
  line-height: 1.4;
}

.audit-detail__name {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 18px;
  font-weight: 620;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.audit-detail__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  margin-top: var(--apple-space-2);
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.audit-detail__id code,
.facts__mono,
.fingerprint__digest,
.fingerprint__full {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

.audit-detail__id code {
  color: var(--apple-gray-2);
}

.audit-detail__loading {
  color: var(--apple-gray-3);
}

.audit-detail__state {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 13px;
  line-height: 1.6;
}

.audit-detail__alert {
  margin: 0;
}

.audit-detail__alert-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
}

.audit-detail__alert-reason {
  margin: var(--apple-space-1) 0 var(--apple-space-2);
  color: var(--apple-gray-2);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.audit-detail__note {
  margin: var(--apple-space-2) 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.55;
}

.audit-detail__block {
  padding-top: var(--apple-space-4);
  border-top: 1px solid var(--apple-border);
}

.audit-detail__block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--apple-space-2);
}

.audit-detail__block-title {
  margin: 0 0 var(--apple-space-3);
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 620;
  line-height: 1.4;
}

.audit-detail__block-meta {
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.4;
}

.lifecycle {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.lifecycle__item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--apple-space-3);
  min-width: 0;
}

.lifecycle__item:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 10px;
  top: 24px;
  bottom: calc(-1 * var(--apple-space-3));
  width: 1px;
  background: var(--apple-border);
}

.lifecycle__marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 21px;
  height: 21px;
  border: 1px solid var(--apple-border);
  border-radius: 50%;
  background: var(--apple-card);
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.lifecycle__item.is-complete .lifecycle__marker {
  border-color: var(--apple-gray-5);
  color: var(--apple-gray-2);
}

.lifecycle__item.is-current .lifecycle__marker {
  border-color: var(--apple-blue);
  color: var(--apple-blue);
}

.lifecycle__item.is-attention .lifecycle__marker {
  border-color: var(--apple-red);
  color: var(--apple-red);
}

.lifecycle__item.is-blocked .lifecycle__marker {
  border-style: dashed;
  border-color: var(--apple-gray-4);
  color: var(--apple-gray-3);
}

.lifecycle__item.is-pending .lifecycle__marker,
.lifecycle__item.is-muted .lifecycle__marker {
  color: var(--apple-gray-4);
}

.lifecycle__content {
  min-width: 0;
}

.lifecycle__heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
}

.lifecycle__title {
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 560;
  line-height: 1.4;
}

.lifecycle__state {
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.4;
}

.lifecycle__item.is-attention .lifecycle__state {
  color: var(--apple-red);
}

.lifecycle__item.is-current .lifecycle__state {
  color: var(--apple-blue);
}

.lifecycle__detail {
  margin: 2px 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.facts {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
  margin: 0;
}

.facts__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--apple-space-3);
  min-width: 0;
}

.facts__row--stacked {
  align-items: stretch;
  flex-direction: column;
  gap: var(--apple-space-1);
}

.facts dt {
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.facts dd {
  margin: 0;
  min-width: 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  line-height: 1.5;
}

.facts__value {
  color: var(--apple-gray-1);
}

.fingerprint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  min-width: 0;
}


.fingerprint__digest {
  color: var(--apple-gray-1);
  overflow-wrap: anywhere;
}

.fingerprint__full {
  max-height: min(44vh, 320px);
  margin: var(--apple-space-2) 0 0;
  padding: var(--apple-space-2) var(--apple-space-3);
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  background: transparent;
  color: var(--apple-gray-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.fingerprint__note {
  margin: var(--apple-space-2) 0 0;
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.5;
}

.audit-detail__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
}
</style>
