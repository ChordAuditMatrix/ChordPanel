<template>
  <div class="source-cells">
    <div class="source-cells__head" aria-hidden="true">
      <span class="source-cells__index">{{ t('recovery.cell.index') }}</span>
      <span>{{ t('recovery.cell.tableId') }}</span>
      <span>{{ t('recovery.cell.rowId') }}</span>
      <span>{{ t('recovery.cell.columnId') }}</span>
      <span />
    </div>

    <p v-if="modelValue.length === 0" class="source-cells__empty">
      {{ t('recovery.scope.cellsEmpty') }}
    </p>

    <div
      v-for="(cell, index) in modelValue"
      :key="cell.key"
      class="source-cells__row"
      role="group"
      :aria-label="t('recovery.cell.rowLabel', { index: index + 1 })"
    >
      <span class="source-cells__index">{{ index + 1 }}</span>

      <div class="source-cells__field">
        <n-input
          :value="cell.tableId"
          :disabled="disabled"
          :status="fieldStatus(cell, index, 'tableId')"
          :input-props="fieldInputProps(cell, index, 'tableId')"
          placeholder="0 – 9223372036854775807"
          inputmode="numeric"
          autocomplete="off"
          spellcheck="false"
          @update:value="updateCell(index, { tableId: $event })"
        />
        <p
          v-if="fieldError(cell, index, 'tableId')"
          :id="fieldErrorId(cell, 'tableId')"
          class="source-cells__error"
          role="alert"
        >
          {{ fieldError(cell, index, 'tableId') }}
        </p>
      </div>

      <div class="source-cells__field">
        <n-input
          :value="cell.rowId"
          :disabled="disabled"
          :status="fieldStatus(cell, index, 'rowId')"
          :input-props="fieldInputProps(cell, index, 'rowId')"
          :placeholder="t('recovery.cell.rowIdPlaceholder')"
          autocomplete="off"
          spellcheck="false"
          @update:value="updateCell(index, { rowId: $event })"
        />
        <p
          v-if="fieldError(cell, index, 'rowId')"
          :id="fieldErrorId(cell, 'rowId')"
          class="source-cells__error"
          role="alert"
        >
          {{ fieldError(cell, index, 'rowId') }}
        </p>
      </div>

      <div class="source-cells__field">
        <n-input-number
          :value="cell.columnId"
          :disabled="disabled"
          :status="fieldStatus(cell, index, 'columnId')"
          :input-props="fieldInputProps(cell, index, 'columnId')"
          :min="0"
          :max="4294967295"
          :precision="0"
          :show-button="false"
          :placeholder="t('recovery.cell.columnIdPlaceholder')"
          @update:value="updateCell(index, { columnId: $event ?? null })"
        />
        <p
          v-if="fieldError(cell, index, 'columnId')"
          :id="fieldErrorId(cell, 'columnId')"
          class="source-cells__error"
          role="alert"
        >
          {{ fieldError(cell, index, 'columnId') }}
        </p>
      </div>

      <n-button
        quaternary
        type="error"
        :disabled="disabled"
        :aria-label="t('recovery.scope.removeCell', { index: index + 1 })"
        @click="removeCell(index)"
      >
        ×
      </n-button>
    </div>

    <n-button
      block
      dashed
      :disabled="disabled || modelValue.length >= MAX_SOURCE_CHANGE_TUPLES"
      @click="addCell"
    >
      {{ t('recovery.scope.addCell') }}
    </n-button>
    <p v-if="modelValue.length >= MAX_SOURCE_CHANGE_TUPLES" class="source-cells__limit" role="status">
      {{ t('recovery.scope.cellLimit', { max: MAX_SOURCE_CHANGE_TUPLES }) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { NButton, NInput, NInputNumber } from 'naive-ui'
import {
  createSourceChangeCellDraft,
  sourceChangeCellFieldError,
  sourceChangeCellHasContent,
  type SourceChangeCellDraft,
  type SourceChangeCellField,
  type RecoveryInputAriaProps,
} from '@/features/recovery/recoveryFlow'
import { MAX_SOURCE_CHANGE_TUPLES } from './auditOperations'
import { useI18n } from '@/stores/i18n'

const props = withDefaults(defineProps<{
  modelValue: SourceChangeCellDraft[]
  disabled?: boolean
  /** Set by the parent after a refused submit so every missing field is explained. */
  revealErrors?: boolean
}>(), {
  disabled: false,
  revealErrors: false,
})

const emit = defineEmits<{ 'update:modelValue': [SourceChangeCellDraft[]] }>()
const { t } = useI18n()

const FIELD_LABEL_KEYS: Record<SourceChangeCellField, string> = {
  tableId: 'recovery.cell.tableId',
  rowId: 'recovery.cell.rowId',
  columnId: 'recovery.cell.columnId',
}

function updateCell(index: number, patch: Partial<SourceChangeCellDraft>) {
  emit('update:modelValue', props.modelValue.map((cell, position) =>
    position === index ? { ...cell, ...patch } : cell))
}

function addCell() {
  if (props.disabled || props.modelValue.length >= MAX_SOURCE_CHANGE_TUPLES) return
  emit('update:modelValue', [...props.modelValue, createSourceChangeCellDraft()])
}

function removeCell(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, position) => position !== index))
}

function fieldError(
  cell: SourceChangeCellDraft,
  index: number,
  field: SourceChangeCellField,
): string {
  if (!props.revealErrors && !sourceChangeCellHasContent(cell)) return ''
  const issue = sourceChangeCellFieldError(cell, field)
  return issue ? t(issue.errorKey, { index: String(index + 1) }) : ''
}

function fieldStatus(cell: SourceChangeCellDraft, index: number, field: SourceChangeCellField) {
  return fieldError(cell, index, field) ? 'error' as const : undefined
}

function fieldErrorId(cell: SourceChangeCellDraft, field: SourceChangeCellField): string {
  return `source-cell-${cell.key}-${field}-error`
}

function fieldInputProps(cell: SourceChangeCellDraft, index: number, field: SourceChangeCellField) {
  const propsForInput: RecoveryInputAriaProps = {
    'aria-label': `${t(FIELD_LABEL_KEYS[field])} ${index + 1}`,
  }
  if (fieldError(cell, index, field)) {
    propsForInput['aria-invalid'] = 'true'
    propsForInput['aria-describedby'] = fieldErrorId(cell, field)
  }
  return propsForInput
}
</script>

<style scoped>
.source-cells {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-2);
  min-width: 0;
}
.source-cells__head,
.source-cells__row {
  display: grid;
  grid-template-columns: 28px minmax(140px, 1.15fr) minmax(140px, 1.35fr) minmax(110px, 0.8fr) 34px;
  gap: var(--apple-space-2);
  align-items: start;
}
.source-cells__head {
  color: var(--apple-gray-4);
  font-size: 11.5px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.source-cells__row {
  padding-top: var(--apple-space-2);
  border-top: 1px solid var(--apple-border);
}
.source-cells__index {
  padding-top: 7px;
  color: var(--apple-gray-4);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.source-cells__field {
  min-width: 0;
}
.source-cells__error {
  margin: 4px 0 0;
  color: var(--apple-red, #c0392b);
  font-size: 11.5px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.source-cells__empty,
.source-cells__limit {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.55;
}
@media (max-width: 760px) {
  .source-cells__head {
    display: none;
  }
  .source-cells__row {
    grid-template-columns: 24px minmax(0, 1fr) 32px;
  }
  .source-cells__field {
    grid-column: 2;
  }
  .source-cells__row > .n-button {
    grid-column: 3;
    grid-row: 1;
  }
}
</style>
