<template>
  <div class="block-grid">
    <div class="block-grid-info">
      <div class="info-row">
        <span class="legend"><span class="dot tagged"></span>{{ t('audit.tagged') }}</span>
        <span class="legend"><span class="dot untagged"></span>{{ t('audit.untagged') }}</span>
      </div>
      <div class="info-row stats">
        <span>{{ t('audit.taggedBlocksCount', { tagged: pageProjection.taggedCount, total: totalBlocks }) }}</span>
        <span v-if="rangeStart !== undefined">{{ t('audit.rangeDisplay', { start: pageProjection.rangeStart, end: rangeEnd, total: totalBlocks }) }}</span>
      </div>
    </div>
    <div class="block-grid-matrix">
      <div
        v-for="block in pageProjection.cells"
        :key="block.index"
        class="block-cell"
        :class="{ tagged: block.tagged }"
        :title="t('audit.blockTitle', { idx: block.index, tagged: block.tagged ? t('audit.tagged') : t('audit.untagged') })"
      >
        <span class="block-label">{{ block.index }}</span>
      </div>
    </div>
    <nav v-if="pageProjection.pageCount > 1" class="block-grid-pagination" :aria-label="t('execution.pagination.navigation')">
      <button
        type="button"
        class="block-grid-page-button"
        :disabled="pageProjection.page <= 1"
        @click="changePage(-1)"
      >
        {{ t('execution.pagination.previous') }}
      </button>
      <span class="block-grid-page-status" role="status" aria-live="polite" aria-atomic="true">
        {{ t('audit.blocksPage', {
          start: pageProjection.pageStart,
          end: pageProjection.pageEndExclusive - 1,
          total: pageProjection.rangeCount,
        }) }}
      </span>
      <button
        type="button"
        class="block-grid-page-button"
        :disabled="pageProjection.page >= pageProjection.pageCount"
        @click="changePage(1)"
      >
        {{ t('execution.pagination.next') }}
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTheme } from '@/stores/theme'
import { useI18n } from '@/stores/i18n'
import { projectBlockGridPage } from './blockGridModel'

const { isDark } = useTheme()
// isDark is used for theme switching via v-bind() in <style>
void isDark
const { t } = useI18n()


const props = defineProps<{
  totalBlocks: number
  taggedRanges: Array<{ blockStart: number; blockCount: number }>
  /** Optional: user-specified query range start block, default 0 */
  rangeStart?: number
  /** Optional: user-specified query range block count, default totalBlocks */
  rangeCount?: number
}>()

const page = ref(1)
const pageProjection = computed(() => projectBlockGridPage({
  totalBlocks: props.totalBlocks,
  rangeStart: props.rangeStart,
  rangeCount: props.rangeCount,
  page: page.value,
  taggedRanges: props.taggedRanges,
}))
const rangeEnd = computed(() =>
  pageProjection.value.rangeStart + pageProjection.value.rangeCount - 1,
)

watch(
  () => [props.totalBlocks, props.rangeStart, props.rangeCount, props.taggedRanges],
  () => { page.value = 1 },
)

function changePage(delta: number): void {
  page.value = Math.min(
    pageProjection.value.pageCount,
    Math.max(1, pageProjection.value.page + delta),
  )
}
</script>

<style scoped>
.block-grid {
  width: 100%;
}

.block-grid-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--apple-gray-3, #6E6E73);
}

.info-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.legend {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}

.dot.tagged {
  background: #34C759;
}

.dot.untagged {
  background: v-bind(isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)');
}

.block-grid-matrix {
  display: flex;
  max-height: min(48vh, 420px);
  flex-wrap: wrap;
  gap: 2px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
}

.block-grid-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.block-grid-page-status {
  color: var(--apple-gray-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.block-grid-page-button {
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-sm);
  background: var(--apple-card);
  color: var(--apple-blue);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.block-grid-page-button:hover:not(:disabled) { border-color: var(--apple-blue); }
.block-grid-page-button:focus-visible { outline: 2px solid var(--apple-blue); outline-offset: 2px; }
.block-grid-page-button:disabled { color: var(--apple-gray-4); cursor: not-allowed; }

.block-cell {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  transition: transform 120ms var(--apple-ease-out, ease-out);
  background: v-bind(isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)');
  border: 1px solid v-bind(isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)');
}

.block-cell.tagged {
  background: #34C759;
  border-color: #2BA84E;
}

.block-cell:hover {
  transform: scale(1.15);
  z-index: 1;
}

.block-label {
  font-size: 9px;
  color: var(--apple-gray-4, #8E8E93);
  font-weight: 500;
  line-height: 1;
}

.block-cell.tagged .block-label {
  color: #fff;
}
</style>