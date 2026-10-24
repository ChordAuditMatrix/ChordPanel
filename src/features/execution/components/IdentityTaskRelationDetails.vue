<template>
  <section class="identity-relation-details" :aria-label="t(titleKey)">
    <header class="identity-relation-details__header">
      <div>
        <p>{{ t('execution.stageDetails.title') }}</p>
        <h3>{{ t(titleKey) }}</h3>
      </div>
      <span>{{ t(isReplay ? 'execution.stageDetails.replayEvidence' : 'execution.stageDetails.liveEvidence') }}</span>
    </header>
    <p class="identity-relation-details__note">{{ t(noteKey) }}</p>
    <dl v-if="fields.length" class="identity-relation-details__fields">
      <div v-for="field in fields" :key="field.key">
        <dt>{{ t(`execution.linkFields.${field.key}`) }}</dt>
        <dd class="mono">{{ field.value }}</dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TraceLink } from '@/api/trace'
import { useI18n } from '@/stores/i18n'

type RelationKind = 'dispatch' | 'settlement'
interface LinkField {
  key: string
  value: string
}

const props = defineProps<{
  relation: RelationKind
  link: TraceLink | null
  isReplay: boolean
}>()
const { t } = useI18n()

const titleKey = computed(() => `execution.identityTimeline.${props.relation === 'dispatch' ? 'dispatchTitle' : 'settlementTitle'}`)
const noteKey = computed(() => {
  if (props.relation === 'dispatch') {
    return props.link ? 'execution.identityTimeline.dispatchPresent' : 'execution.identityTimeline.dispatchUnknown'
  }
  return props.link ? 'execution.identityTimeline.settlementPresent' : 'execution.identityTimeline.settlementUnknown'
})
const fields = computed<LinkField[]>(() => {
  const link = props.link
  if (!link) return []
  const values: Array<[string, string | number | null]> = [
    ['linkKey', link.linkKey],
    ['linkKind', link.linkKind],
    ['matchBasis', link.matchBasis],
    ['confidence', link.confidence ? t(`execution.evidenceConfidence.${link.confidence}`) : null],
    ['sourceQuality', link.sourceQuality ? t(`execution.sourceQuality.${link.sourceQuality}`) : null],
    ['sourceRef', link.sourceRef],
    ['taskId', link.taskId],
    ['nodeId', link.nodeId],
    ['originNodeId', link.originNodeId],
    ['requestId', link.requestId],
    ['observedAtMs', link.observedAtMs],
  ]
  return values.flatMap(([key, value]) => value === null || value === '' ? [] : [{ key, value: String(value) }])
})
</script>

<style scoped>
.identity-relation-details {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--apple-border);
  border-radius: 12px;
  background: var(--apple-surface);
}

.identity-relation-details__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.identity-relation-details__header p {
  margin: 0 0 4px;
  color: var(--apple-gray-3);
  font-size: 11px;
}

.identity-relation-details__header h3 {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 15px;
  font-weight: 600;
}

.identity-relation-details__header > span {
  flex: 0 0 auto;
  padding: 3px 7px;
  border: 1px solid var(--apple-border);
  border-radius: 999px;
  color: var(--apple-gray-3);
  font-size: 10px;
}

.identity-relation-details__note {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 12px;
  line-height: 1.5;
}

.identity-relation-details__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 10px 14px;
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid var(--apple-border);
}

.identity-relation-details__fields > div {
  min-width: 0;
}

.identity-relation-details__fields dt {
  color: var(--apple-gray-3);
  font-size: 10px;
}

.identity-relation-details__fields dd {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  color: var(--apple-gray-1);
  font-size: 11px;
}
</style>
