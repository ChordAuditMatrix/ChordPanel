<template>
  <n-modal
    :show="show"
    preset="card"
    :title="title"
    :mask-closable="!loading"
    :close-on-esc="!loading"
    :closable="!loading"
    class="audit-target-confirm"
    style="width: min(680px, calc(100vw - 32px))"
    @update:show="onShowUpdate"
  >
    <p v-if="description" class="audit-target-confirm__description">{{ description }}</p>

    <dl class="audit-target-confirm__facts">
      <div v-for="fact in facts" :key="`${fact.labelKey}:${fact.value}`" class="audit-target-confirm__fact">
        <dt>{{ t(fact.labelKey) }}</dt>
        <dd :class="{ 'audit-target-confirm__mono': fact.mono }">{{ fact.value }}</dd>
      </div>
    </dl>

    <section class="audit-target-confirm__consequences" :aria-label="t('audit.workbench.operations.consequences')">
      <h3 class="audit-target-confirm__section-title">{{ t('audit.workbench.operations.consequences') }}</h3>
      <ul>
        <li v-for="item in consequences" :key="item">{{ item }}</li>
      </ul>
    </section>

    <p v-if="loading" class="audit-target-confirm__waiting" role="status">
      {{ t('audit.workbench.operations.confirmSubmitting') }}
    </p>

    <template #footer>
      <div class="audit-target-confirm__footer">
        <n-button :disabled="loading" @click="onShowUpdate(false)">{{ cancelLabel }}</n-button>
        <n-button :type="confirmType" :loading="loading" @click="emit('confirm')">
          {{ confirmLabel }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { NButton, NModal } from 'naive-ui'
import { useI18n } from '@/stores/i18n'
import type { OperationFact } from './auditOperations'

withDefaults(defineProps<{
  show: boolean
  title: string
  description?: string
  facts: readonly OperationFact[]
  consequences: readonly string[]
  confirmLabel: string
  cancelLabel: string
  loading?: boolean
  confirmType?: 'primary' | 'warning' | 'error'
}>(), {
  description: '',
  loading: false,
  confirmType: 'primary',
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: []
}>()
const { t } = useI18n()

function onShowUpdate(value: boolean): void {
  if (!value) emit('update:show', false)
}
</script>

<style scoped>
.audit-target-confirm__description {
  margin: 0 0 var(--apple-space-4, 16px);
  color: var(--apple-gray-3);
  font-size: 13px;
  line-height: 1.6;
}
.audit-target-confirm__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--apple-space-3, 12px);
  margin: 0;
  padding: var(--apple-space-3, 12px) var(--apple-space-4, 16px);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg, 12px);
  background: var(--apple-card);
}
.audit-target-confirm__fact {
  min-width: 0;
}
.audit-target-confirm__fact dt {
  color: var(--apple-gray-4);
  font-size: 11.5px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.audit-target-confirm__fact dd {
  margin: 2px 0 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.audit-target-confirm__mono {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}
.audit-target-confirm__consequences {
  margin-top: var(--apple-space-4, 16px);
}
.audit-target-confirm__section-title {
  margin: 0 0 var(--apple-space-2, 8px);
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 620;
}
.audit-target-confirm__consequences ul {
  margin: 0;
  padding-left: 18px;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}
.audit-target-confirm__waiting {
  margin: var(--apple-space-3, 12px) 0 0;
  color: var(--apple-gray-4);
  font-size: 12px;
}
.audit-target-confirm__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--apple-space-2, 8px);
}
</style>
