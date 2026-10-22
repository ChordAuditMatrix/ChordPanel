<template>
  <section class="tag-part-matrix" :aria-labelledby="headingId">
    <div class="panel-head">
      <h2 :id="headingId" class="panel-title">{{ t('execution.tagGeneration.title') }}</h2>
      <span v-if="partsCoverage" class="section-status">
        {{ t('execution.tagGeneration.coverage') }}:
        <n-tag size="small" :bordered="false">{{ coverageStateLabel(partsCoverage, t) }}</n-tag>
      </span>
    </div>

    <div v-if="!summary" class="state-block">{{ t('execution.notAvailable') }}</div>
    <dl v-else class="fact-grid">
      <div class="fact-group">
        <dt>{{ t('execution.tagGeneration.calculationProgress') }}</dt>
        <dd>
          <template v-if="calculationFacts.length">
            <span v-for="fact in calculationFacts" :key="fact.key" class="counter">
              <span class="counter-label">{{ fact.label }}</span>
              <span class="mono">{{ fact.value }}</span>
            </span>
          </template>
          <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
        </dd>
      </div>
      <div class="fact-group">
        <dt>{{ t('execution.tagGeneration.storageProgress') }}</dt>
        <dd>
          <template v-if="storageFacts.length">
            <span v-for="fact in storageFacts" :key="fact.key" class="counter">
              <span class="counter-label">{{ fact.label }}</span>
              <span class="mono">{{ fact.value }}</span>
            </span>
          </template>
          <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
        </dd>
      </div>
      <div class="fact-group">
        <dt>{{ t('execution.tagGeneration.partsProgress') }}</dt>
        <dd>
          <template v-if="partCountFacts.length">
            <span v-for="fact in partCountFacts" :key="fact.key" class="counter">
              <span class="counter-label">{{ fact.label }}</span>
              <span class="mono">{{ fact.value }}</span>
            </span>
          </template>
          <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
        </dd>
      </div>
    </dl>

    <p v-if="!rows.length" class="muted panel-empty">{{ t('execution.tagGeneration.noParts') }}</p>
    <div v-else class="table-scroll" tabindex="0">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">{{ t('execution.tagGeneration.part') }}</th>
            <th scope="col">{{ t('execution.tagGeneration.status') }}</th>
            <th scope="col">{{ t('execution.tagGeneration.range') }}</th>
            <th scope="col">{{ t('execution.tagGeneration.plannedBlocks') }}</th>
            <th scope="col">{{ t('execution.tagGeneration.generatedBlocks') }}</th>
            <th scope="col">{{ t('execution.tagGeneration.storageAccountedTags') }}</th>
            <th scope="col">{{ t('execution.tagGeneration.generateTask') }}</th>
            <th scope="col">{{ t('execution.tagGeneration.windows') }}</th>
            <th scope="col"><span class="sr-only">{{ t('execution.tagGeneration.expand') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in visibleRows" :key="row.key">
            <tr>
              <td class="part-index">
                <span class="mono">{{ row.part.partIndex }}</span>
                <span v-if="row.part.attempt !== null" class="muted attempt">
                  {{ t('execution.tagGeneration.attempt') }} {{ row.part.attempt }}
                </span>
              </td>
              <td>
                <n-tag v-if="row.part.status" size="small" :bordered="false" :type="statusTagType(row.part.status)">
                  {{ tracePartStatusLabel(row.part.status, t) }}
                </n-tag>
                <n-tag v-if="row.part.coverage" size="small" class="coverage-tag">
                  {{ coverageStateLabel(row.part.coverage, t) }}
                </n-tag>
              </td>
              <td class="mono range-cell">
                <span v-for="(range, index) in row.rangeLabels" :key="index">{{ range }}</span>
                <span v-if="!row.rangeLabels.length" class="muted">{{ t('execution.notAvailable') }}</span>
              </td>
              <td class="mono">{{ row.part.plannedBlockCount }}</td>
              <td class="mono">{{ nullable(row.part.generatedBlockCount) }}</td>
              <td class="mono">{{ nullable(row.part.storageAccountedTagCount) }}</td>
              <td>
                <template v-if="row.generateTask">
                  <n-tag size="small" :bordered="false" :type="statusTagType(row.generateTask.status)">
                    {{ taskStatusLabel(row.generateTask.status, t) }}
                  </n-tag>
                </template>
                <span v-else-if="row.part.generateTaskId" class="mono muted task-id">
                  {{ row.part.generateTaskId }}
                </span>
                <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
              </td>
              <td>
                <span v-if="row.part.windows === undefined" class="muted">
                  {{ t('execution.tagGeneration.notRequested') }}
                </span>
                <span v-else class="mono">{{ row.part.windows.length }}</span>
              </td>
              <td class="actions">
                <n-button
                  text
                  size="tiny"
                  :aria-expanded="expanded.has(row.key)"
                  @click="toggle(row)"
                >
                  {{ expanded.has(row.key) ? t('execution.tagGeneration.collapse') : t('execution.tagGeneration.expand') }}
                </n-button>
              </td>
            </tr>
            <tr v-if="expanded.has(row.key)" class="detail-row">
              <td colspan="9">
                <div class="window-panel">
                  <div class="window-head">
                    <span class="window-title">
                      {{ t('execution.tagGeneration.window') }}
                      <span class="muted">· {{ t('execution.tagGeneration.part') }} {{ row.part.partIndex }}</span>
                    </span>
                    <span v-if="pageCoverageLabel(row.page)" class="section-status">
                      {{ t('execution.tagGeneration.coverage') }}:
                      <n-tag size="small" :bordered="false">
                        {{ coverageStateLabel(pageCoverageLabel(row.page), t) }}
                      </n-tag>
                    </span>
                  </div>

                  <div v-if="windowLoading[row.page]" class="state-block" role="status">
                    {{ t('execution.loading') }}
                  </div>

                  <div v-else-if="windowErrorText(row.page)" class="error-line">
                    <span>{{ windowErrorText(row.page) }}</span>
                    <n-button size="tiny" :disabled="windowLoading[row.page]" @click="retry(row)">
                      {{ t('execution.tagGeneration.retry') }}
                    </n-button>
                  </div>

                  <template v-else-if="row.part.windows === undefined">
                    <p class="muted panel-empty">{{ t('execution.tagGeneration.notRequested') }}</p>
                  </template>

                  <template v-else-if="!row.part.windows.length">
                    <p class="muted panel-empty">{{ t('execution.tagGeneration.emptyWindows') }}</p>
                  </template>

                  <table v-else class="data-table window-table">
                    <thead>
                      <tr>
                        <th scope="col">{{ t('execution.tagGeneration.window') }}</th>
                        <th scope="col">{{ t('execution.tagGeneration.range') }}</th>
                        <th scope="col">{{ t('execution.tagGeneration.status') }}</th>
                        <th scope="col">{{ t('execution.tagGeneration.taskState') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="window in visibleWindows(row)" :key="window.windowIndex">
                        <td class="mono">{{ window.windowIndex }}</td>
                        <td class="mono">{{ rangeLabel(window) }}</td>
                        <td>
                          <n-tag v-if="window.state" size="small" :bordered="false" :type="statusTagType(window.state)">
                            {{ tracePartStatusLabel(window.state, t) }}
                          </n-tag>
                          <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
                        </td>
                        <td>
                          <template v-if="dumpTask(window.tagDumpTaskId)">
                            <n-tag size="small" :bordered="false" :type="statusTagType(dumpTask(window.tagDumpTaskId)?.status)">
                              {{ taskStatusLabel(dumpTask(window.tagDumpTaskId)?.status, t) }}
                            </n-tag>
                          </template>
                          <span v-else-if="window.tagDumpTaskId" class="mono muted task-id">
                            {{ window.tagDumpTaskId }}
                          </span>
                          <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <nav
                    v-if="(row.part.windows?.length ?? 0) > WINDOW_PAGE_SIZE"
                    class="list-pagination"
                    :aria-label="t('execution.pagination.navigation')"
                  >
                    <button
                      type="button"
                      class="text-button"
                      :disabled="windowPage(row) <= 1"
                      @click="shiftWindowPage(row, -1)"
                    >
                      {{ t('execution.pagination.previous') }}
                    </button>
                    <span class="pagination-status">
                      {{ t('execution.pagination.status', {
                        page: windowPage(row),
                        pages: windowPageCount(row),
                        count: row.part.windows?.length ?? 0,
                      }) }}
                    </span>
                    <button
                      type="button"
                      class="text-button"
                      :disabled="windowPage(row) >= windowPageCount(row)"
                      @click="shiftWindowPage(row, 1)"
                    >
                      {{ t('execution.pagination.next') }}
                    </button>
                  </nav>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <nav
      v-if="rows.length > PART_PAGE_SIZE"
      class="list-pagination part-pagination"
      :aria-label="t('execution.pagination.navigation')"
    >
      <button
        type="button"
        class="text-button"
        :disabled="partPage <= 1"
        @click="partPage -= 1"
      >
        {{ t('execution.pagination.previous') }}
      </button>
      <span class="pagination-status">
        {{ t('execution.pagination.status', {
          page: partPage,
          pages: partPageCount,
          count: rows.length,
        }) }}
      </span>
      <button
        type="button"
        class="text-button"
        :disabled="partPage >= partPageCount"
        @click="partPage += 1"
      >
        {{ t('execution.pagination.next') }}
      </button>
    </nav>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import type { TaskSummary } from '@/api/job'
import type {
  TraceCoverageState,
  TracePart,
  TracePartRange,
  TracePartWindow,
  TraceSummary,
  TraceUint64,
} from '@/api/trace'
import { useI18n } from '@/stores/i18n'
import { jobStatusTagType } from '@/utils/jobStatus'
import { coverageStateLabel, taskStatusLabel, tracePartStatusLabel } from '@/utils/statusLabels'

const props = withDefaults(defineProps<{
  parts: readonly TracePart[]
  summary: TraceSummary | null
  tasks: readonly TaskSummary[]
  /** Source coverage of each loaded part page, keyed by 1-based page number. */
  pageCoverage: Record<number, TraceCoverageState | null>
  /** Window request state of each part page, keyed by 1-based page number. */
  windowLoading: Record<number, boolean>
  windowErrors: Record<number, unknown | null>
  /** Loads the 1-based source page that carries the part windows. */
  loadPartWindows: (page: number) => Promise<void>
  pageSize?: number
}>(), { pageSize: 200 })

const { t } = useI18n()
const PART_PAGE_SIZE = 50
const WINDOW_PAGE_SIZE = 50
const headingId = `tag-part-matrix-${useId()}`
const partPage = ref(1)

interface CounterFact {
  key: string
  label: string
  value: TraceUint64
}

interface PartRow {
  key: string
  part: TracePart
  /** 1-based source page the part was fetched from. */
  page: number
  rangeLabels: string[]
  generateTask: TaskSummary | null
}

const taskById = computed(() => {
  const map = new Map<string, TaskSummary>()
  for (const task of props.tasks) map.set(task.taskId, task)
  return map
})

/** Only source-recorded counters are listed; `null` never renders as zero. */
const calculationFacts = computed<CounterFact[]>(() => {
  const progress = props.summary?.progress
  if (!progress) return []
  return [
    { key: 'plannedBlockCount', label: t('execution.tagGeneration.plannedBlocks'), value: progress.plannedBlockCount },
    { key: 'generatedBlockCount', label: t('execution.tagGeneration.generatedBlocks'), value: progress.generatedBlockCount },
  ].filter((fact): fact is CounterFact => fact.value !== null)
})

const storageFacts = computed<CounterFact[]>(() => {
  const progress = props.summary?.progress
  if (!progress) return []
  return [
    { key: 'storageAccountedTagCount', label: t('execution.tagGeneration.storageAccountedTags'), value: progress.storageAccountedTagCount },
    { key: 'persistedCount', label: t('execution.tagGeneration.persisted'), value: progress.persistedCount },
    { key: 'duplicateCount', label: t('execution.tagGeneration.duplicateCount'), value: progress.duplicateCount },
    { key: 'replacedCount', label: t('execution.tagGeneration.replacedCount'), value: progress.replacedCount },
  ].filter((fact): fact is CounterFact => fact.value !== null)
})

const partCountFacts = computed<CounterFact[]>(() => {
  const progress = props.summary?.progress
  if (!progress) return []
  return [
    { key: 'completedPartCount', label: t('execution.tagGeneration.completedParts'), value: progress.completedPartCount },
    { key: 'plannedPartCount', label: t('execution.tagGeneration.plannedParts'), value: progress.plannedPartCount },
  ].filter((fact): fact is CounterFact => fact.value !== null)
})

const partsCoverage = computed<TraceCoverageState | null>(() => props.summary?.coverage.parts ?? null)

/**
 * The session fetched parts page by page in the API's `(partIndex, attempt)`
 * order and concatenated them, so a part's 1-based page follows its position.
 */
const rows = computed<PartRow[]>(() => {
  const size = props.pageSize > 0 ? props.pageSize : 200
  return props.parts.map((part, index) => ({
    key: `${part.partIndex}:${part.attempt ?? ''}`,
    part,
    page: Math.floor(index / size) + 1,
    rangeLabels: part.ranges.map(rangeLabel),
    generateTask: part.generateTaskId ? taskById.value.get(part.generateTaskId) ?? null : null,
  }))
})
const expanded = reactive(new Set<string>())
const windowPageByPart = reactive(new Map<string, number>())
const partPageCount = computed(() =>
  Math.max(1, Math.ceil(rows.value.length / PART_PAGE_SIZE)),
)
const visibleRows = computed(() => {
  const start = (partPage.value - 1) * PART_PAGE_SIZE
  return rows.value.slice(start, start + PART_PAGE_SIZE)
})

watch(() => rows.value.length, () => {
  if (partPage.value > partPageCount.value) partPage.value = partPageCount.value
})
watch(() => props.summary?.jobId, () => {
  partPage.value = 1
  expanded.clear()
  windowPageByPart.clear()
})


function windowPageCount(row: PartRow): number {
  return Math.max(1, Math.ceil((row.part.windows?.length ?? 0) / WINDOW_PAGE_SIZE))
}

function windowPage(row: PartRow): number {
  return Math.min(windowPageByPart.get(row.key) ?? 1, windowPageCount(row))
}

function visibleWindows(row: PartRow): TracePartWindow[] {
  const windows = row.part.windows ?? []
  const start = (windowPage(row) - 1) * WINDOW_PAGE_SIZE
  return windows.slice(start, start + WINDOW_PAGE_SIZE)
}

function shiftWindowPage(row: PartRow, delta: -1 | 1): void {
  const next = Math.min(windowPageCount(row), Math.max(1, windowPage(row) + delta))
  windowPageByPart.set(row.key, next)
}


function nullable(value: TraceUint64 | null): string {
  return value ?? t('execution.notAvailable')
}

function statusTagType(status: string | null | undefined) {
  return jobStatusTagType(status)
}

/** Exact decimal ranges; the end is derived with BigInt so uint64 values keep their precision. */
function rangeLabel(range: TracePartRange | TracePartWindow): string {
  try {
    const start = BigInt(range.blockStart)
    const count = BigInt(range.blockCount)
    if (count <= 0n) return `${range.blockStart} (${range.blockCount})`
    return `${start}–${start + count - 1n}`
  } catch {
    return `${range.blockStart} + ${range.blockCount}`
  }
}

function dumpTask(taskId: string | null): TaskSummary | null {
  return taskId ? taskById.value.get(taskId) ?? null : null
}

function pageCoverageLabel(page: number): TraceCoverageState | null {
  return props.pageCoverage[page] ?? null
}

function windowErrorText(page: number): string {
  return props.windowErrors[page] ? t('execution.tagGeneration.loadFailed') : ''
}

async function requestWindows(page: number): Promise<void> {
  if (props.windowLoading[page]) return
  try {
    await props.loadPartWindows(page)
  } catch {
    // Failures are surfaced through `windowErrors`; nothing is inferred here.
  }
}

async function toggle(row: PartRow): Promise<void> {
  if (expanded.has(row.key)) {
    expanded.delete(row.key)
    return
  }
  expanded.add(row.key)
  if (row.part.windows === undefined) await requestWindows(row.page)
}

async function retry(row: PartRow): Promise<void> {
  await requestWindows(row.page)
}
</script>

<style scoped>
.tag-part-matrix {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--apple-gray-1);
}

.section-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--apple-gray-3);
}

.fact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin: 0;
}

.fact-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.fact-group dt {
  font-size: 12px;
  color: var(--apple-gray-3);
}

.fact-group dd {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
}

.counter {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.counter-label {
  font-size: 12px;
  color: var(--apple-gray-2);
}

.mono {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

.muted {
  color: var(--apple-gray-3);
}

.panel-empty {
  margin: 0;
  font-size: 12px;
}

.state-block {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.table-scroll {
  max-height: 560px;
  overflow: auto;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.table-scroll:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}
.list-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
}

.part-pagination {
  padding-inline: 0;
}

.text-button {
  padding: 4px 6px;
  color: var(--apple-blue);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}

.text-button:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.text-button:disabled {
  color: var(--apple-gray-4);
  cursor: not-allowed;
}

.pagination-status {
  color: var(--apple-gray-3);
  font-size: 11px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.data-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  color: var(--apple-gray-3);
  background: var(--apple-card);
  border-bottom: 1px solid var(--apple-border);
  white-space: nowrap;
}

.data-table td {
  padding: 8px 12px;
  vertical-align: top;
  color: var(--apple-gray-2);
  border-bottom: 1px solid var(--apple-border);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.part-index {
  white-space: nowrap;
}

.attempt {
  margin-left: 6px;
  font-size: 11px;
}

.range-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.coverage-tag {
  margin-left: 6px;
}

.task-id {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  vertical-align: middle;
}

.actions {
  text-align: right;
  white-space: nowrap;
}

.detail-row > td {
  background: color-mix(in srgb, var(--apple-card) 92%, var(--apple-gray-3));
}

.window-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}

.window-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.window-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--apple-gray-1);
}

.error-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--apple-gray-2);
}

.window-table {
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.window-table th {
  position: static;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 640px) {
  .fact-grid {
    grid-template-columns: 1fr;
  }
}
</style>
