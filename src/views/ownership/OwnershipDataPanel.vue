<template>
  <div class="ownership-data">
    <div class="ownership-data__toolbar">
      <n-radio-group v-model:value="mutation" size="small" @update:value="resetMutationResult">
        <n-radio-button value="add">{{ t('ownership.addOwnership') }}</n-radio-button>
        <n-radio-button value="remove">{{ t('ownership.removeOwnership') }}</n-radio-button>
        <n-radio-button value="move">{{ t('ownership.moveOwnership') }}</n-radio-button>
      </n-radio-group>
    </div>
    <p class="aside-note">{{ t('ownership.workbench.ownerIdIdentityNote') }}</p>

    <div class="ownership-split">
      <div class="ownership-split__form">
        <n-form v-if="mutation === 'add'" label-placement="top" :show-feedback="false" @submit.prevent>
          <n-form-item :label="t('ownership.ownerId')" required>
            <UserSelect v-model="addForm.ownerId" :placeholder="t('ownership.selectOwner')" style="width: 100%" />
          </n-form-item>
          <n-form-item :label="t('ownership.cells')" required>
            <CellEditor v-model="addForm.cells" />
          </n-form-item>
          <div class="ownership-data__actions">
            <n-button type="primary" :loading="addLoading" @click="handleAdd">{{ t('ownership.add') }}</n-button>
          </div>
        </n-form>

        <n-form v-else-if="mutation === 'remove'" label-placement="top" :show-feedback="false" @submit.prevent>
          <n-form-item :label="t('ownership.ownerId')" required>
            <UserSelect v-model="removeForm.ownerId" :placeholder="t('ownership.selectOwner')" style="width: 100%" />
          </n-form-item>
          <n-form-item :label="t('ownership.cells')" required>
            <CellEditor v-model="removeForm.cells" />
          </n-form-item>
          <div class="ownership-data__actions">
            <n-button type="error" :loading="removeLoading" @click="handleRemove">{{ t('ownership.remove') }}</n-button>
          </div>
        </n-form>

        <n-form v-else label-placement="top" :show-feedback="false" @submit.prevent>
          <div class="ownership-data__grid">
            <n-form-item :label="t('ownership.sourceOwner')" required>
              <UserSelect v-model="moveForm.sourceOwnerId" :placeholder="t('ownership.selectOwner')" style="width: 100%" />
            </n-form-item>
            <n-form-item :label="t('ownership.targetOwner')" required>
              <UserSelect v-model="moveForm.targetOwnerId" :placeholder="t('ownership.selectOwner')" style="width: 100%" />
            </n-form-item>
          </div>
          <n-form-item :label="t('ownership.cells')" required>
            <CellEditor v-model="moveForm.cells" />
          </n-form-item>
          <div class="ownership-data__actions">
            <n-button type="primary" :loading="moveLoading" @click="handleMove">{{ t('ownership.move') }}</n-button>
          </div>
        </n-form>
      </div>

      <aside class="ownership-split__aside">
        <p class="aside-title">{{ t('ownership.workbench.manage.impact') }}</p>
        <ul class="aside-list">
          <li>{{ mutationImpact }}</li>
          <li>{{ t('ownership.workbench.mutation.submittedCellsNote') }}</li>
          <li>{{ t('ownership.workbench.manage.eventNote') }}</li>
        </ul>
        <p class="aside-note">{{ t('ownership.workbench.manage.cellJobNote') }}</p>
      </aside>
    </div>

    <OwnershipResultPanel
      v-if="mutationResult || mutationError"
      :title="mutationTitle"
      :facts="mutationFacts"
      :result="mutationResult"
      :error="mutationError"
      :notes="mutationNotes"
      :filename="`ownership-cells-${mutation}.json`"
    />

    <section class="ownership-data__bulk">
      <div class="ownership-data__toolbar">
        <n-radio-group v-model:value="bulk" size="small" @update:value="resetBulkResult">
          <n-radio-button value="import">{{ t('ownership.bulkImport') }}</n-radio-button>
          <n-radio-button value="export">{{ t('ownership.bulkExport') }}</n-radio-button>
        </n-radio-group>
      </div>

      <div class="ownership-split">
        <div class="ownership-split__form">
          <n-form v-if="bulk === 'import'" label-placement="top" :show-feedback="false" @submit.prevent>
            <n-form-item :label="t('ownership.ownerId')" required>
              <UserSelect v-model="importForm.ownerId" :placeholder="t('ownership.selectOwner')" style="width: 100%" />
            </n-form-item>
            <n-form-item :label="t('ownership.cells')" required>
              <n-input
                v-model:value="importForm.jsonText"
                type="textarea"
                :rows="8"
                class="cells-textarea"
                :placeholder="t('ownership.importJsonPlaceholder')"
              />
            </n-form-item>
            <n-form-item :label="t('ownership.overwrite')">
              <n-switch v-model:value="importForm.overwrite" />
              <span class="switch-note">{{ t('ownership.workbench.manage.overwriteImpact') }}</span>
            </n-form-item>
            <div class="ownership-data__actions">
              <n-button type="primary" :loading="importLoading" @click="handleImport">{{ t('ownership.importBtn') }}</n-button>
            </div>
          </n-form>

          <n-form v-else label-placement="top" :show-feedback="false" @submit.prevent>
            <n-form-item :label="t('ownership.ownerId')" required>
              <UserSelect v-model="exportForm.ownerId" :placeholder="t('ownership.selectOwner')" style="width: 100%" />
            </n-form-item>
            <n-form-item :label="t('ownership.exportFilter')">
              <div class="export-filter">
                <TableSelect v-model="exportForm.filter.tableIdFrom" :active-only="false" style="width: 100%" :placeholder="t('ownership.tableIdFrom')" />
                <TableSelect v-model="exportForm.filter.tableIdTo" :active-only="false" style="width: 100%" :placeholder="t('ownership.tableIdTo')" />
                <div class="export-filter__row">
                  <n-checkbox v-model:checked="exportForm.filter.includeRowIdFrom">{{ t('ownership.rowIdFrom') }}</n-checkbox>
                  <n-input v-model:value="exportForm.filter.rowIdFrom" :disabled="!exportForm.filter.includeRowIdFrom" />
                </div>
                <div class="export-filter__row">
                  <n-checkbox v-model:checked="exportForm.filter.includeRowIdTo">{{ t('ownership.rowIdTo') }}</n-checkbox>
                  <n-input v-model:value="exportForm.filter.rowIdTo" :disabled="!exportForm.filter.includeRowIdTo" />
                </div>
              </div>
            </n-form-item>
            <div class="ownership-data__actions">
              <n-button type="primary" :loading="exportLoading" @click="handleExport">{{ t('ownership.exportBtn') }}</n-button>
            </div>
          </n-form>
        </div>

        <aside class="ownership-split__aside">
          <p class="aside-title">{{ t('ownership.workbench.manage.impact') }}</p>
          <ul class="aside-list">
            <li>{{ bulk === 'import' ? t('ownership.workbench.manage.importImpact') : t('ownership.workbench.manage.exportImpact') }}</li>
            <li>{{ t('ownership.workbench.manage.asyncNote') }}</li>
          </ul>
        </aside>
      </div>

      <OwnershipResultPanel
        v-if="bulkResult || bulkError"
        :title="bulk === 'import' ? t('ownership.bulkImport') : t('ownership.bulkExport')"
        :facts="bulkFacts"
        :result="bulkResult"
        :error="bulkError"
        :notes="bulkNotes"
        :filename="`ownership-${bulk}-job.json`"
        show-job-outcome
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NCheckbox, NForm, NFormItem, NInput, NRadioButton, NRadioGroup, NSwitch, useMessage } from 'naive-ui'
import { addCells, exportCells, importCells, moveCells, parseOwnershipJson, removeCells } from '@/api/ownership'
import type { DataCell, OwnershipExportFilter, OwnershipImportCell } from '@/api/ownership'
import CellEditor from '@/components/CellEditor.vue'
import UserSelect from '@/components/UserSelect.vue'
import TableSelect from '@/components/TableSelect.vue'
import { useI18n } from '@/stores/i18n'
import OwnershipResultPanel from './OwnershipResultPanel.vue'
import {
  asyncOperationFacts,
  cellMutationFacts,
  requestErrorMessage,
  type BulkOperation,
  type CellMutation,
} from './ownershipWorkbench'

const { t } = useI18n()
const message = useMessage()
function isOwnershipRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const mutation = ref<CellMutation>('add')
const addForm = ref({ ownerId: '', cells: [] as DataCell[] })
const removeForm = ref({ ownerId: '', cells: [] as DataCell[] })
const moveForm = ref({ sourceOwnerId: '', targetOwnerId: '', cells: [] as DataCell[] })
const addLoading = ref(false)
const removeLoading = ref(false)
const moveLoading = ref(false)
const mutationResult = ref<Record<string, unknown> | null>(null)
const mutationError = ref('')

const mutationTitle = computed(() => mutation.value === 'add'
  ? t('ownership.addOwnership')
  : mutation.value === 'remove'
    ? t('ownership.removeOwnership')
    : t('ownership.moveOwnership'))
const mutationImpact = computed(() => mutation.value === 'add'
  ? t('ownership.workbench.manage.addImpact')
  : mutation.value === 'remove'
    ? t('ownership.workbench.manage.removeImpact')
    : t('ownership.workbench.manage.moveImpact'))
const mutationFacts = computed(() => mutationResult.value
  ? cellMutationFacts(mutationResult.value, mutation.value)
  : [])
const mutationNotes = computed(() => [
  t('ownership.workbench.mutation.submittedCellsNote'),
  t('ownership.workbench.manage.eventNote'),
])

function resetMutationResult() {
  mutationResult.value = null
  mutationError.value = ''
}

async function submitMutation<T>(loading: { value: boolean }, request: () => Promise<T>, successMessage: string) {
  loading.value = true
  mutationResult.value = null
  mutationError.value = ''
  try {
    const response: unknown = await request()
    if (!isOwnershipRecord(response)) throw new TypeError('Invalid ownership mutation response')
    mutationResult.value = response
    message.success(successMessage)
  } catch (error) {
    mutationError.value = requestErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function handleAdd() {
  if (!addForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  if (addForm.value.cells.length === 0) { message.warning(t('ownership.fillAtLeastOneCell')); return }
  await submitMutation(addLoading, () => addCells(addForm.value.ownerId, addForm.value.cells), t('ownership.submitted'))
}

async function handleRemove() {
  if (!removeForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  if (removeForm.value.cells.length === 0) { message.warning(t('ownership.fillAtLeastOneCell')); return }
  await submitMutation(removeLoading, () => removeCells(removeForm.value.ownerId, removeForm.value.cells), t('ownership.submitted'))
}

async function handleMove() {
  if (!moveForm.value.sourceOwnerId.trim() || !moveForm.value.targetOwnerId.trim()) {
    message.warning(t('ownership.fillOwnerId')); return
  }
  if (moveForm.value.cells.length === 0) { message.warning(t('ownership.fillAtLeastOneCell')); return }
  await submitMutation(
    moveLoading,
    () => moveCells(moveForm.value.sourceOwnerId, moveForm.value.targetOwnerId, moveForm.value.cells),
    t('ownership.submitted'),
  )
}

const bulk = ref<BulkOperation>('import')
const importForm = ref({ ownerId: '', jsonText: '', overwrite: false })
const exportForm = ref({
  ownerId: '',
  filter: { tableIdFrom: '', tableIdTo: '', includeRowIdFrom: false, includeRowIdTo: false, rowIdFrom: '', rowIdTo: '' },
})
const importLoading = ref(false)
const exportLoading = ref(false)
const bulkResult = ref<Record<string, unknown> | null>(null)
const bulkError = ref('')
const bulkFacts = computed(() => bulkResult.value ? asyncOperationFacts(bulkResult.value) : [])
const bulkNotes = computed(() => [
  bulk.value === 'import'
    ? t('ownership.workbench.manage.importImpact')
    : t('ownership.workbench.manage.exportImpact'),
  t('ownership.workbench.manage.asyncNote'),
])

function resetBulkResult() {
  bulkResult.value = null
  bulkError.value = ''
}

async function handleImport() {
  if (importLoading.value) return
  if (!importForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  let cells: OwnershipImportCell[]
  try {
    const parsed = parseOwnershipJson(importForm.value.jsonText)
    cells = Array.isArray(parsed) ? parsed as OwnershipImportCell[] : []
  } catch {
    message.error(t('ownership.invalidJson')); return
  }
  if (cells.length === 0) { message.warning(t('ownership.fillAtLeastOneCell')); return }
  if (!cells.every(cell => cell && typeof cell === 'object' && typeof cell.rowId === 'string')) {
    message.error(t('ownership.rowIdMustBeText')); return
  }
  importLoading.value = true
  bulkResult.value = null
  bulkError.value = ''
  try {
    const response: unknown = await importCells(importForm.value.ownerId, cells, importForm.value.overwrite)
    if (!isOwnershipRecord(response)) throw new TypeError('Invalid ownership import response')
    bulkResult.value = response
    message.success(t('ownership.workbench.manage.importSubmitted'))
  } catch (error) {
    bulkError.value = requestErrorMessage(error)
  } finally {
    importLoading.value = false
  }
}

async function handleExport() {
  if (exportLoading.value) return
  if (!exportForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  const filter: OwnershipExportFilter = {}
  if (exportForm.value.filter.tableIdFrom) filter.tableIdFrom = exportForm.value.filter.tableIdFrom
  if (exportForm.value.filter.tableIdTo) filter.tableIdTo = exportForm.value.filter.tableIdTo
  if (exportForm.value.filter.includeRowIdFrom) filter.rowIdFrom = exportForm.value.filter.rowIdFrom
  if (exportForm.value.filter.includeRowIdTo) filter.rowIdTo = exportForm.value.filter.rowIdTo
  exportLoading.value = true
  bulkResult.value = null
  bulkError.value = ''
  try {
    const response: unknown = await exportCells(exportForm.value.ownerId, Object.keys(filter).length ? filter : undefined)
    if (!isOwnershipRecord(response)) throw new TypeError('Invalid ownership export response')
    bulkResult.value = response
    message.success(t('ownership.workbench.manage.exportSubmitted'))
  } catch (error) {
    bulkError.value = requestErrorMessage(error)
  } finally {
    exportLoading.value = false
  }
}
</script>

<style scoped>
.ownership-data {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  min-width: 0;
}
.ownership-data__toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-bottom: var(--apple-space-4);
}
.ownership-data__bulk {
  padding-top: var(--apple-space-5);
  border-top: 1px solid var(--apple-border);
}
.ownership-split {
  display: grid;
  grid-template-columns: minmax(0, 560px) minmax(240px, 1fr);
  gap: var(--apple-section-gap);
  align-items: start;
}
.ownership-split__form {
  min-width: 0;
}
.ownership-split__aside {
  min-width: 0;
  padding-left: var(--apple-space-4);
  border-left: 1px solid var(--apple-border);
}
.ownership-data__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--apple-space-3) var(--apple-space-4);
}
.ownership-data__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--apple-space-3);
}
.cells-textarea :deep(textarea) {
  font-family: var(--apple-font-mono);
  font-size: 11.5px;
  line-height: 1.55;
}
.switch-note {
  margin-left: var(--apple-space-3);
  color: var(--apple-gray-4);
  font-size: 11.5px;
}
.export-filter {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
  width: 100%;
}
.export-filter__row {
  display: flex;
  align-items: center;
  gap: var(--apple-space-3);
}
.export-filter__row :deep(.n-checkbox) {
  flex: none;
}
.aside-title {
  margin: 0 0 var(--apple-space-2);
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 620;
}
.aside-list {
  margin: 0;
  padding-left: 16px;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.65;
}
.aside-note {
  margin: var(--apple-space-3) 0 0;
  color: var(--apple-gray-4);
  font-size: 11.5px;
  line-height: 1.6;
}
@media (max-width: 900px) {
  .ownership-split {
    grid-template-columns: minmax(0, 1fr);
  }
  .ownership-split__aside {
    padding-top: var(--apple-space-4);
    padding-left: 0;
    border-top: 1px solid var(--apple-border);
    border-left: 0;
  }
}
@media (max-width: 560px) {
  .ownership-data__grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .ownership-data__actions {
    justify-content: flex-start;
  }
}
</style>
