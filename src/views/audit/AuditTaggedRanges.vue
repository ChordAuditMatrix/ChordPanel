<template>
  <div class="ranges-workbench">
    <div class="ranges-panel">
      <WorkbenchSection :title="t('audit.workbench.ranges.title')" :description="t('audit.workbench.ranges.description')">
        <n-form :model="rangeQueryForm" label-placement="top" class="ranges-form">
          <div class="ranges-form__grid">
            <n-form-item :label="t('audit.ownerId')" required>
              <UserSelect v-model="scopeOwnerId" :placeholder="t('audit.selectOwner')" style="width:100%" />
            </n-form-item>
            <n-form-item :label="t('audit.algorithmId')">
              <AlgorithmSelect
                v-model="rangeAlgorithmId"
                purpose="Audit"
                :placeholder="t('audit.workbench.ranges.algorithmPlaceholder')"
                style="width:100%"
              />
            </n-form-item>
          </div>
          <p class="ranges-hint">{{ t('audit.workbench.ranges.algorithmHint') }}</p>

          <div v-if="layoutResult" class="ranges-form__grid ranges-form__window">
            <n-form-item :label="t('audit.rangeStart')">
              <n-input-number
                v-model:value="rangeQueryForm.rangeStart"
                :min="0"
                :max="Math.max(0, layoutResult.totalBlocks - 1)"
                size="small"
                style="width:100%"
              />
            </n-form-item>
            <n-form-item :label="t('audit.rangeCount')">
              <n-input-number
                v-model:value="rangeQueryForm.rangeCount"
                :min="1"
                :max="Math.max(1, layoutResult.totalBlocks)"
                size="small"
                style="width:100%"
              />
            </n-form-item>
          </div>

          <div class="ranges-actions">
            <n-button :loading="rangeLoading" :disabled="!scopeOwnerId.trim()" @click="handleGetRanges">
              {{ rangeResult !== null ? t('audit.refreshRanges') : t('audit.getRanges') }}
            </n-button>
          </div>
        </n-form>
      </WorkbenchSection>
    </div>

    <section v-if="rangeResult !== null" class="ranges-panel ranges-results" :aria-label="t('audit.workbench.ranges.resultsTitle')">
      <header class="ranges-results__head">
        <div>
          <h2 class="ranges-results__title">{{ t('audit.workbench.ranges.resultsTitle') }}</h2>
          <p class="ranges-results__description">{{ t('audit.workbench.ranges.resultsDescription') }}</p>
        </div>
        <n-tag size="small" :bordered="false" type="info">
          {{ t('audit.workbench.ranges.actualAlgorithm') }}:
          <span class="mono algorithm-id" :title="rangeScopeAlgorithmId ?? undefined">
            {{ rangeAlgorithmDisplay }}
          </span>
        </n-tag>
      </header>

      <dl class="ranges-summary">
        <div>
          <dt>{{ t('audit.workbench.ranges.rangeCount') }}</dt>
          <dd class="mono">{{ rangeResult.length }}</dd>
        </div>
        <div>
          <dt>{{ t('audit.workbench.ranges.coveredBlocks') }}</dt>
          <dd class="mono">{{ mergedRanges.coveredBlocks }}</dd>
        </div>
      </dl>

      <n-empty v-if="rangeResult.length === 0" :description="t('audit.workbench.ranges.empty')" />
      <div v-else class="ranges-table">
        <n-data-table
          :columns="columns"
          :data="rangeRows"
          :pagination="{ pageSize: 20 }"
          size="small"
          :row-key="rowKey"
        />
      </div>

      <template v-if="layoutResult">
        <div class="ranges-window-label">
          {{ t('audit.rangeDisplay', {
            start: rangeQueryForm.rangeStart,
            end: Math.min(rangeQueryForm.rangeStart + rangeQueryForm.rangeCount - 1, layoutResult.totalBlocks - 1),
            total: layoutResult.totalBlocks,
          }) }}
        </div>
        <BlockGrid
          :total-blocks="layoutResult.totalBlocks"
          :tagged-ranges="mergedRanges.ranges"
          :range-start="rangeQueryForm.rangeStart"
          :range-count="rangeQueryForm.rangeCount"
        />
      </template>
      <p v-else class="ranges-hint">{{ t('audit.workbench.ranges.layoutHint') }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { useMessage } from 'naive-ui'
import { getTaggedRanges } from '@/api/audit'
import BlockGrid from '@/components/BlockGrid.vue'
import AlgorithmSelect from '@/components/AlgorithmSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import { useI18n } from '@/stores/i18n'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import type { AuditLayoutResult } from '@/utils/auditLayout'
import { mergeTaggedRanges, normalizeTaggedRanges, resolveRangeAlgorithmId, type TaggedRange } from './auditWorkbench'

const props = defineProps<{
  ownerId: string
  layoutResult: AuditLayoutResult | null
  generatedResult: any
}>()
const emit = defineEmits<{ 'update:ownerId': [value: string] }>()

const message = useMessage()
const { t } = useI18n()
const { algorithmsById, ensureLoaded } = useReferenceCatalog()
const scopeOwnerId = computed({
  get: () => props.ownerId,
  set: value => emit('update:ownerId', value),
})
const rangeAlgorithmId = ref('')
const rangeQueryForm = ref({ rangeStart: 0, rangeCount: 100 })
let rangeRequestSeq = 0
const rangeLoading = ref(false)
const rangeResult = ref<TaggedRange[] | null>(null)
interface TaggedRangeRow extends TaggedRange {
  rowKey: number
}
const rangeScopeAlgorithmId = ref<string | null>(null)

const rangeQueryAlgorithmId = computed(() => resolveRangeAlgorithmId({
  selectedAlgorithmId: rangeAlgorithmId.value,
  generatedAlgorithmId: typeof props.generatedResult?.algorithmId === 'string'
    ? props.generatedResult.algorithmId
    : null,
  generatedOwnerId: typeof props.generatedResult?.ownerId === 'string'
    ? props.generatedResult.ownerId
    : null,
  ownerId: scopeOwnerId.value,
}))
const mergedRanges = computed(() => mergeTaggedRanges(rangeResult.value ?? []))
const rangeCatalogAlgorithmName = computed(() =>
  rangeScopeAlgorithmId.value ? algorithmsById.value.get(rangeScopeAlgorithmId.value) ?? null : null,
)
const rangeAlgorithmDisplay = computed(() => {
  const algorithmId = rangeScopeAlgorithmId.value
  if (!algorithmId) return t('audit.workbench.ranges.unknownAlgorithm')
  return rangeCatalogAlgorithmName.value
    ? `${rangeCatalogAlgorithmName.value} (${algorithmId})`
    : algorithmId
})
const rangeRows = computed<TaggedRangeRow[]>(() =>
  (rangeResult.value ?? []).map((range, index) => ({ ...range, rowKey: index })),
)
const columns = computed<DataTableColumns<TaggedRangeRow>>(() => [
  { title: t('audit.blockStartColumn'), key: 'blockStart', sorter: 'default' },
  { title: t('audit.blockCountColumn'), key: 'blockCount', sorter: 'default' },
])

function rowKey(row: TaggedRangeRow) {
  return row.rowKey
}
onMounted(() => {
  void ensureLoaded()
})

function clearRangeResult() {
  rangeResult.value = null
  rangeScopeAlgorithmId.value = null
}

watch(() => scopeOwnerId.value, () => {
  ++rangeRequestSeq
  rangeLoading.value = false
  clearRangeResult()
})
watch(rangeAlgorithmId, () => {
  ++rangeRequestSeq
  rangeLoading.value = false
  clearRangeResult()
})
watch(() => props.layoutResult, layout => {
  if (!layout) return
  if (rangeQueryForm.value.rangeCount > layout.totalBlocks) rangeQueryForm.value.rangeCount = layout.totalBlocks
  if (rangeQueryForm.value.rangeStart >= layout.totalBlocks) rangeQueryForm.value.rangeStart = 0
}, { immediate: true })
watch(() => props.generatedResult, result => {
  if (!result || String(result.ownerId ?? '').trim() !== scopeOwnerId.value.trim()) return
  void fetchRanges()
}, { immediate: true })

function isCurrentRangeScope(seq: number, ownerId: string, algorithmId?: string) {
  return seq === rangeRequestSeq
    && ownerId === scopeOwnerId.value.trim()
    && algorithmId === rangeQueryAlgorithmId.value
}

async function fetchRanges() {
  const ownerId = scopeOwnerId.value.trim()
  if (!ownerId) return
  const requestedAlgorithmId = rangeQueryAlgorithmId.value
  const seq = ++rangeRequestSeq
  rangeLoading.value = true
  try {
    const response: unknown = await getTaggedRanges(ownerId, requestedAlgorithmId)
    if (!isCurrentRangeScope(seq, ownerId, requestedAlgorithmId)) return
    const answer = normalizeTaggedRanges(response)
    if (!answer) {
      clearRangeResult()
      message.error(t('audit.workbench.ranges.invalidResponse'))
      return
    }
    rangeResult.value = answer.ranges
    rangeScopeAlgorithmId.value = answer.algorithmId
  } catch (e: any) {
    if (isCurrentRangeScope(seq, ownerId, requestedAlgorithmId)) {
      clearRangeResult()
      message.error(e?.response?.data?.message || t('audit.rangeQueryFailed'))
    }
  } finally {
    if (seq === rangeRequestSeq) rangeLoading.value = false
  }
}

function handleGetRanges() {
  const ownerId = scopeOwnerId.value.trim()
  if (!ownerId) { message.warning(t('audit.selectOwnerWarn')); return }
  return fetchRanges()
}
</script>

<style scoped>
.ranges-workbench {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  min-width: 0;
}

.ranges-panel {
  min-width: 0;
  padding: var(--apple-space-5);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
}

.ranges-form {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
}

.ranges-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0 var(--apple-space-4);
}

.ranges-form__window {
  border-top: 1px solid var(--apple-border);
  padding-top: var(--apple-space-3);
}

.ranges-hint {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.55;
}

.ranges-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
}

.ranges-results {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-4);
}

.ranges-results__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--apple-space-3);
}

.ranges-results__title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 16px;
  font-weight: 620;
  line-height: 1.35;
}

.ranges-results__description {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.ranges-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  margin: 0;
  border-top: 1px solid var(--apple-border);
  border-bottom: 1px solid var(--apple-border);
}

.ranges-summary > div {
  padding: var(--apple-space-3) var(--apple-space-4);
  border-left: 1px solid var(--apple-border);
}

.ranges-summary > div:first-child {
  padding-left: 0;
  border-left: 0;
}

.ranges-summary dt {
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 600;
}

.ranges-summary dd {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-1);
  font-size: 17px;
  font-weight: 620;
}

.ranges-table {
  min-width: 0;
}

.ranges-window-label {
  color: var(--apple-gray-3);
  font-size: 12px;
}

.mono {
  font-family: var(--apple-font-mono);
}

@media (max-width: 680px) {
  .ranges-panel {
    padding: var(--apple-space-4);
  }
}
</style>
