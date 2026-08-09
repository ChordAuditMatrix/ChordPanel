<template>
  <div class="block-grid">
    <div class="block-grid-info">
      <div class="info-row">
        <span class="legend"><span class="dot tagged"></span>{{ t('audit.tagged') }}</span>
        <span class="legend"><span class="dot untagged"></span>{{ t('audit.untagged') }}</span>
      </div>
      <div class="info-row stats">
        <span>{{ t('audit.taggedBlocksCount', { tagged: taggedCount, total: totalBlocks }) }}</span>
        <span v-if="rangeStart !== undefined">{{ t('audit.rangeDisplay', { start: rangeStart, end: rangeEnd, total: totalBlocks }) }}</span>
      </div>
    </div>
    <div class="block-grid-matrix">
      <div
        v-for="(block, idx) in blocks"
        :key="idx"
        class="block-cell"
        :class="{ tagged: block.tagged }"
        :title="t('audit.blockTitle', { idx: idx + rangeStartSafe, tagged: block.tagged ? t('audit.tagged') : t('audit.untagged') })"
      >
        <span class="block-label">{{ idx + rangeStartSafe }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from '@/stores/theme'
import { useI18n } from '@/stores/i18n'

const { isDark } = useTheme()
// isDark is used for theme switching via v-bind() in <style>
void isDark
const { t } = useI18n()

interface BlockState {
  tagged: boolean
}

const props = defineProps<{
  totalBlocks: number
  taggedRanges: Array<{ blockStart: number; blockCount: number }>
  /** Optional: user-specified query range start block, default 0 */
  rangeStart?: number
  /** Optional: user-specified query range block count, default totalBlocks */
  rangeCount?: number
}>()

const rangeStartSafe = computed(() => props.rangeStart ?? 0)

const rangeEnd = computed(() => {
  const start = rangeStartSafe.value
  const count = props.rangeCount ?? props.totalBlocks
  return Math.min(start + count - 1, props.totalBlocks - 1)
})

const blocks = computed<BlockState[]>(() => {
  const start = rangeStartSafe.value
  const count = props.rangeCount ?? props.totalBlocks
  const end = Math.min(start + count, props.totalBlocks)
  const size = end - start

  const result: BlockState[] = Array.from({ length: size }, () => ({
    tagged: false,
  }))

  // Build the set of tagged blocks
  const taggedSet = new Set<number>()
  for (const range of props.taggedRanges) {
    const rStart = range.blockStart ?? 0
    const rCount = range.blockCount ?? 0
    for (let b = rStart; b < rStart + rCount; b++) {
      taggedSet.add(b)
    }
  }

  for (let i = 0; i < size; i++) {
    const globalIdx = start + i
    result[i].tagged = taggedSet.has(globalIdx)
  }

  return result
})

const taggedCount = computed(() => blocks.value.filter(b => b.tagged).length)
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
  flex-wrap: wrap;
  gap: 2px;
}

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