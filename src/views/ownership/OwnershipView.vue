<template>
  <div class="ownership-workbench">
    <PageHeader
      :eyebrow="t('ownership.workbench.eyebrow')"
      :title="t('ownership.workbench.title')"
      :description="t('ownership.workbench.description')"
    >
      <template #meta>
        <span>{{ t('ownership.workbench.scopeNote') }}</span>
      </template>
    </PageHeader>

    <n-tabs type="line" size="small" v-model:value="activeTab" class="ownership-workbench__tabs">
      <n-tab-pane name="generate" :tab="t('ownership.generate')">
        <OwnershipProofPanel mode="generate" />
      </n-tab-pane>
      <n-tab-pane name="verify" :tab="t('ownership.verify')">
        <OwnershipProofPanel mode="verify" />
      </n-tab-pane>
      <n-tab-pane name="query" :tab="t('ownership.queryOwnership')">
        <OwnershipQueryPanel />
      </n-tab-pane>
      <n-tab-pane name="manage" :tab="t('ownership.manage')">
        <OwnershipManagePanel />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NTabs, NTabPane } from 'naive-ui'
import PageHeader from '@/components/PageHeader.vue'
import OwnershipManagePanel from './OwnershipManagePanel.vue'
import OwnershipProofPanel from './OwnershipProofPanel.vue'
import OwnershipQueryPanel from './OwnershipQueryPanel.vue'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()
const activeTab = ref('generate')
</script>

<style scoped>
.ownership-workbench {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  width: 100%;
  margin: 0 auto;
  min-width: 0;
}
.ownership-workbench__tabs :deep(.n-tabs-pane-wrapper) {
  padding-top: var(--apple-space-5);
}
</style>
