<template>
  <div class="ownership-tree">
    <div class="ownership-split">
      <div class="ownership-split__form">
        <n-form label-placement="top" :show-feedback="false" @submit.prevent>
          <n-form-item :label="t('ownership.ownerId')" required>
            <UserSelect v-model="ownerId" :placeholder="t('ownership.selectOwner')" style="width: 100%" />
          </n-form-item>
        </n-form>
        <div class="ownership-tree__actions">
          <n-button type="primary" :loading="createLoading" :disabled="!ownerId.trim()" @click="handleCreateTree">
            {{ t('ownership.createTreeBtn') }}
          </n-button>
          <n-popconfirm @positive-click="handleDeleteTree">
            <template #trigger>
              <n-button type="error" :loading="deleteLoading" :disabled="!ownerId.trim()">
                {{ t('ownership.deleteTreeBtn') }}
              </n-button>
            </template>
            {{ t('ownership.deleteTreeConfirm') }}
          </n-popconfirm>
        </div>
      </div>

      <aside class="ownership-split__aside">
        <p class="aside-title">{{ t('ownership.workbench.manage.impact') }}</p>
        <ul class="aside-list">
          <li>{{ t('ownership.workbench.manage.createImpact') }}</li>
          <li>{{ t('ownership.workbench.manage.createConflict') }}</li>
          <li>{{ t('ownership.workbench.manage.deleteImpact') }}</li>
          <li>{{ t('ownership.workbench.manage.deleteNoTree') }}</li>
        </ul>
        <p class="aside-note">{{ t('ownership.workbench.ownerIdIdentityNote') }}</p>
        <p class="aside-note">{{ t('ownership.workbench.manage.treeJobNote') }}</p>
      </aside>
    </div>

    <OwnershipResultPanel
      v-if="created || createError"
      :title="t('ownership.createTree')"
      :facts="createFacts"
      :result="created"
      :error="createError"
      filename="ownership-tree-create.json"
    />
    <OwnershipResultPanel
      v-if="deleted || deleteError"
      :title="t('ownership.deleteTree')"
      :facts="deleteFacts"
      :result="deleted"
      :error="deleteError"
      :notes="deleteNotes"
      filename="ownership-tree-delete.json"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NForm, NFormItem, NPopconfirm, useMessage } from 'naive-ui'
import { createTree, deleteTree } from '@/api/ownership'
import { useI18n } from '@/stores/i18n'
import OwnershipResultPanel from './OwnershipResultPanel.vue'
import UserSelect from '@/components/UserSelect.vue'
import { requestErrorMessage, treeFacts, treeDeleteNotice } from './ownershipWorkbench'

const { t } = useI18n()
const message = useMessage()
const ownerId = ref('')
const createLoading = ref(false)
const deleteLoading = ref(false)
const created = ref<Record<string, unknown> | null>(null)
const createError = ref('')
const deleted = ref<Record<string, unknown> | null>(null)
const deleteError = ref('')

const createFacts = computed(() => created.value ? treeFacts(created.value, 'create', t) : [])
const deleteFacts = computed(() => deleted.value ? treeFacts(deleted.value, 'delete', t) : [])
const deleteNotes = computed(() => {
  const noticeKey = treeDeleteNotice(deleted.value)
  return noticeKey ? [t(noticeKey)] : []
})
function treeResponseRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid ownership tree response')
  }
  return value as Record<string, unknown>
}

async function handleCreateTree() {
  const owner = ownerId.value.trim()
  if (!owner) { message.warning(t('ownership.fillOwnerId')); return }
  createLoading.value = true
  created.value = null
  createError.value = ''
  try {
    created.value = treeResponseRecord(await createTree(owner))
    message.success(t('ownership.treeCreated'))
  } catch (error) {
    createError.value = requestErrorMessage(error)
  } finally {
    createLoading.value = false
  }
}

async function handleDeleteTree() {
  const owner = ownerId.value.trim()
  if (!owner) { message.warning(t('ownership.fillOwnerId')); return }
  deleteLoading.value = true
  deleted.value = null
  deleteError.value = ''
  try {
    const result = treeResponseRecord(await deleteTree(owner))
    deleted.value = result
    message.success(result.deleted === false
      ? t('ownership.workbench.manage.noTreeDeleted')
      : t('ownership.treeDeleted'))
  } catch (error) {
    deleteError.value = requestErrorMessage(error)
  } finally {
    deleteLoading.value = false
  }
}
</script>

<style scoped>
.ownership-tree {
  min-width: 0;
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
.ownership-tree__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-4);
  margin-top: var(--apple-space-3);
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
</style>
