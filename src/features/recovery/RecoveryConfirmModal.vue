<template>
  <n-modal
    :show="show"
    preset="card"
    :title="title"
    class="recovery-confirm"
    style="width: min(680px, calc(100vw - 32px))"
    :mask-closable="!loading"
    :close-on-esc="!loading"
    @update:show="onShow"
  >
    <div class="recovery-confirm__body">
      <p class="recovery-confirm__hint">{{ t('recovery.confirm.reviewHint') }}</p>

      <n-alert
        v-if="notice"
        :type="noticeType"
        :show-icon="true"
        class="recovery-confirm__notice"
      >
        {{ notice }}
      </n-alert>

      <section class="recovery-confirm__target" :aria-label="t('recovery.confirm.targetLabel')">
        <dl class="recovery-confirm__facts">
          <div v-for="fact in targets" :key="`${fact.labelKey}:${fact.value}`" class="recovery-confirm__fact">
            <dt>{{ t(fact.labelKey) }}</dt>
            <dd :class="{ 'recovery-confirm__mono': fact.mono }">{{ fact.value }}</dd>
          </div>
        </dl>
      </section>

      <section class="recovery-confirm__consequences" :aria-label="t('recovery.confirm.consequences')">
        <p class="recovery-confirm__section-title">{{ t('recovery.confirm.consequences') }}</p>
        <ul class="recovery-confirm__list">
          <li v-for="consequence in consequences" :key="consequence">{{ consequence }}</li>
        </ul>
      </section>

      <n-checkbox v-model:checked="acknowledged">
        {{ ackLabel }}
      </n-checkbox>
    </div>

    <template #footer>
      <div class="recovery-confirm__actions">
        <p v-if="!acknowledged" class="recovery-confirm__blocked" role="status">
          {{ t('recovery.confirm.ackRequiredHint') }}
        </p>
        <n-button :disabled="loading" @click="close">{{ t('common.cancel') }}</n-button>
        <n-button
          :type="tone"
          :loading="loading"
          :disabled="!acknowledged"
          @click="confirm"
        >
          {{ confirmLabel }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { NAlert, NButton, NCheckbox, NModal } from 'naive-ui'
import type { RecoveryFact } from '@/features/recovery/recoveryFlow'
import { useI18n } from '@/stores/i18n'

const props = withDefaults(defineProps<{
  show: boolean
  title: string
  targets: readonly RecoveryFact[]
  consequences: readonly string[]
  ackLabel: string
  confirmLabel: string
  notice?: string
  noticeType?: 'default' | 'info' | 'warning'
  tone?: 'primary' | 'warning'
  loading?: boolean
}>(), {
  notice: '',
  noticeType: 'warning',
  tone: 'primary',
  loading: false,
})

const emit = defineEmits<{ 'update:show': [boolean]; confirm: [] }>()
const { t } = useI18n()
const acknowledged = ref(false)

watch(() => props.show, show => {
  if (show) acknowledged.value = false
})

function onShow(show: boolean) {
  emit('update:show', show)
}

function close() {
  emit('update:show', false)
}

function confirm() {
  if (!acknowledged.value || props.loading) return
  emit('confirm')
}
</script>

<style scoped>
.recovery-confirm {
  width: min(680px, calc(100vw - 32px));
}
.recovery-confirm__body {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-4);
  min-width: 0;
}
.recovery-confirm__hint {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12.5px;
  line-height: 1.55;
}
.recovery-confirm__notice {
  margin: 0;
}
.recovery-confirm__target {
  min-width: 0;
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  background: var(--apple-bg);
}
.recovery-confirm__facts {
  display: grid;
  grid-template-columns: minmax(120px, max-content) minmax(0, 1fr);
  gap: var(--apple-space-1) var(--apple-space-4);
  margin: 0;
}
.recovery-confirm__fact {
  display: contents;
}
.recovery-confirm__fact dt {
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.6;
}
.recovery-confirm__fact dd {
  min-width: 0;
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 12.5px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.recovery-confirm__mono {
  font-family: var(--apple-font-mono);
  font-size: 11.5px;
}
.recovery-confirm__section-title {
  margin: 0 0 var(--apple-space-1);
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 620;
}
.recovery-confirm__list {
  margin: 0;
  padding-left: 18px;
  color: var(--apple-gray-3);
  font-size: 12.5px;
  line-height: 1.6;
}
.recovery-confirm__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--apple-space-3);
}
.recovery-confirm__blocked {
  min-width: 0;
  margin: 0 auto 0 0;
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.45;
}
</style>
