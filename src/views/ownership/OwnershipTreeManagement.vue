<template>
  <n-card size="small" :bordered="true" style="margin-top: 12px;">
    <template #header>{{ t('ownership.treeManagement') }}</template>
    <n-form label-placement="left" label-width="100">
      <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="treeForm.ownerId" style="width:100%" /></n-form-item>
    </n-form>
    <n-space>
      <n-button type="primary" :loading="createTreeLoading" @click="handleCreateTree">{{ t('ownership.createTreeBtn') }}</n-button>
      <n-popconfirm @positive-click="handleDeleteTree">
        <template #trigger>
          <n-button type="error" :loading="deleteTreeLoading" :disabled="!treeForm.ownerId">{{ t('ownership.deleteTreeBtn') }}</n-button>
        </template>
        {{ t('ownership.deleteTreeConfirm') }}
      </n-popconfirm>
    </n-space>
  </n-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMessage } from 'naive-ui'
import { createTree, deleteTree } from '@/api/ownership'
import UserSelect from '@/components/UserSelect.vue'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()
const message = useMessage()
const emit = defineEmits<{ (event: 'operation', result: any, error: string): void }>()
const treeForm = ref({ ownerId: '' })
const createTreeLoading = ref(false)
const deleteTreeLoading = ref(false)

async function handleCreateTree() {
  if (!treeForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  createTreeLoading.value = true
  try {
    const result = await createTree(treeForm.value.ownerId)
    emit('operation', result, '')
    message.success(t('ownership.treeCreated'))
  } catch (e: any) {
    const error = e?.response?.data?.message || String(e)
    emit('operation', null, error)
  } finally {
    createTreeLoading.value = false
  }
}

async function handleDeleteTree() {
  if (!treeForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  deleteTreeLoading.value = true
  try {
    const result = await deleteTree(treeForm.value.ownerId)
    emit('operation', result, '')
    message.success(t('ownership.treeDeleted'))
  } catch (e: any) {
    const error = e?.response?.data?.message || String(e)
    emit('operation', null, error)
  } finally {
    deleteTreeLoading.value = false
  }
}
</script>
