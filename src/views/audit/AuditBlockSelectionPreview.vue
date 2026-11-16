<template>
  <section class="block-preview" :aria-label="t('audit.workbench.maintenance.selectionPreviewTitle')">
    <header class="block-preview__head">
      <h4 class="block-preview__title">{{ t('audit.workbench.maintenance.selectionPreviewTitle') }}</h4>
      <n-tag v-if="preview" size="small" :bordered="false" type="info">
        {{ t(preview.mode === 'indices'
          ? 'audit.workbench.maintenance.selectionIndices'
          : 'audit.workbench.maintenance.selectionRanges') }}
      </n-tag>
    </header>

    <p v-if="!preview" class="block-preview__empty">
      {{ t('audit.workbench.maintenance.previewEmpty') }}
    </p>

    <template v-else>
      <dl class="block-preview__facts">
        <div>
          <dt>{{ t('audit.workbench.maintenance.previewFirst') }}</dt>
          <dd>{{ preview.firstBlockText }}</dd>
        </div>
        <div>
          <dt>{{ t('audit.workbench.maintenance.previewLast') }}</dt>
          <dd>{{ preview.lastBlockText }}</dd>
        </div>
        <div>
          <dt>{{ t('audit.workbench.maintenance.previewBlocks') }}</dt>
          <dd>{{ preview.blockCountText }}</dd>
        </div>
        <div>
          <dt>{{ t('audit.workbench.maintenance.previewRanges') }}</dt>
          <dd>{{ preview.rangeCount }}</dd>
        </div>
      </dl>

      <p class="block-preview__label">{{ t('audit.workbench.maintenance.previewCanonical') }}</p>
      <code class="block-preview__canonical">{{ preview.canonicalRanges }}</code>

      <div v-if="preview.mode === 'indices' && preview.indices.length" class="block-preview__chips" :aria-label="t('audit.workbench.maintenance.previewIndicesChips')">
        <span v-for="index in visibleIndices" :key="index" class="block-preview__chip">{{ index }}</span>
        <span v-if="remainingIndices > 0" class="block-preview__chip block-preview__chip--more">
          {{ t('audit.workbench.maintenance.previewMore', { count: remainingIndices }) }}
        </span>
      </div>

      <p v-if="preview.mode === 'indices'" class="block-preview__hint">
        {{ t('audit.workbench.maintenance.previewIndicesNote') }}
      </p>
      <p v-else class="block-preview__hint">
        {{ t('audit.workbench.maintenance.previewRangesNote') }}
      </p>
      <p v-if="preview.normalized" class="block-preview__hint block-preview__hint--normalized">
        {{ t('audit.workbench.maintenance.previewNormalized', { count: preview.inputValueCount }) }}
      </p>

      <details class="block-preview__ranges">
        <summary>{{ t('audit.workbench.maintenance.previewRangeList') }}</summary>
        <ul>
          <li v-for="token in rangeTokens" :key="token">
            <code>{{ token }}</code>
          </li>
        </ul>
      </details>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NTag } from 'naive-ui'
import { useI18n } from '@/stores/i18n'
import type { BlockSelectionPreview } from './auditMaintenance'

const props = defineProps<{ preview: BlockSelectionPreview | null }>()
const { t } = useI18n()
const visibleIndices = computed(() => props.preview?.indices.slice(0, 64) ?? [])
const remainingIndices = computed(() => Math.max(0, (props.preview?.indices.length ?? 0) - 64))
const rangeTokens = computed(() => {
  const canonical = props.preview?.canonicalRanges ?? ''
  const prefix = 'ranges-v1:'
  return canonical.startsWith(prefix) ? canonical.slice(prefix.length).split(',') : []
})
</script>

<style scoped>
.block-preview {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-2, 8px);
  min-width: 0;
  padding: var(--apple-space-3, 12px) var(--apple-space-4, 16px);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg, 12px);
  background: var(--apple-card);
}
.block-preview__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--apple-space-2, 8px);
}
.block-preview__title {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 620;
}
.block-preview__empty {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 12px;
}
.block-preview__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: var(--apple-space-2, 8px);
  margin: 0;
}
.block-preview__facts dt {
  color: var(--apple-gray-4);
  font-size: 11px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.block-preview__facts dd {
  margin: 1px 0 0;
  color: var(--apple-gray-1);
  font-family: var(--apple-font-mono);
  font-size: 13px;
}
.block-preview__label {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 11px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.block-preview__canonical {
  display: block;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--apple-gray-6, #f2f2f7);
  color: var(--apple-gray-1);
  font-family: var(--apple-font-mono);
  font-size: 11.5px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.block-preview__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.block-preview__chip {
  min-width: 24px;
  padding: 1px 5px;
  border: 1px solid var(--apple-border);
  border-radius: 6px;
  color: var(--apple-gray-2);
  font-family: var(--apple-font-mono);
  font-size: 11px;
  text-align: center;
}
.block-preview__chip--more {
  font-family: inherit;
  color: var(--apple-gray-4);
}
.block-preview__hint {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 11.5px;
  line-height: 1.5;
}
.block-preview__hint--normalized {
  color: var(--apple-orange, #c93400);
}
.block-preview__ranges summary {
  color: var(--apple-gray-4);
  font-size: 11.5px;
  cursor: pointer;
}
.block-preview__ranges ul {
  display: flex;
  flex-wrap: wrap;
  gap: var(--apple-space-2, 8px);
  margin: var(--apple-space-2, 8px) 0 0;
  padding: 0;
  list-style: none;
}
.block-preview__ranges code {
  color: var(--apple-gray-2);
  font-family: var(--apple-font-mono);
  font-size: 11px;
}
</style>
