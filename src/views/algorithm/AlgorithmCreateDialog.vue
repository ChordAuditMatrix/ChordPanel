<template>
  <n-modal :show="show" preset="card" :title="t('algorithm.create')" class="create-dialog" :bordered="true" @update:show="$emit('update:show', $event)">
    <n-form label-placement="left" label-width="auto">
      <n-form-item :label="t('algorithm.algorithmType')" required>
        <n-select :value="algorithmType" :placeholder="t('algorithm.algorithmType')" :options="typeOptions" :loading="typeLoading" @update:value="$emit('update:algorithmType', $event)" />
      </n-form-item>
      <n-form-item :label="t('algorithm.algorithmName')" required>
        <n-input :value="algorithmName" :placeholder="t('common.inputAlgorithmName')" @update:value="$emit('update:algorithmName', $event)" />
      </n-form-item>
      <n-form-item :label="t('algorithm.initParams')">
        <KeyValueEditor :model-value="params" :hint="paramsHint" @update:model-value="$emit('update:params', $event)" />
      </n-form-item>
    </n-form>
    <template #footer>
      <div class="dialog-actions">
        <n-button @click="$emit('update:show', false)">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="loading" @click="$emit('submit')">{{ t('common.create') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import type { KvHintItem } from '@/components/KeyValueEditor.vue'
import KeyValueEditor from '@/components/KeyValueEditor.vue'
import { useI18n } from '@/stores/i18n'

defineProps<{
  show: boolean
  algorithmType: string
  algorithmName: string
  params: Record<string, string>
  paramsHint: KvHintItem[]
  typeOptions: Array<{ label: string; value: string }>
  typeLoading: boolean
  loading: boolean
}>()

defineEmits<{
  'update:show': [value: boolean]
  'update:algorithmType': [value: string]
  'update:algorithmName': [value: string]
  'update:params': [value: Record<string, string>]
  submit: []
}>()

const { t } = useI18n()
</script>

<style scoped>
.create-dialog { width: 460px; max-width: 92vw; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
