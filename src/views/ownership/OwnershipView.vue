<template>
  <div class="ownership-view">
    <n-tabs type="line" size="small" v-model:value="activeTab">
      <n-tab-pane name="generate" :tab="t('ownership.generate')">
        <FormPage max-width="640px">
          <OwnershipProofPanel mode="generate" />
        </FormPage>
      </n-tab-pane>
      <n-tab-pane name="verify" :tab="t('ownership.verify')">
        <FormPage max-width="640px">
          <OwnershipProofPanel mode="verify" />
        </FormPage>
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
import FormPage from '@/components/FormPage.vue'
import OwnershipProofPanel from './OwnershipProofPanel.vue'
import OwnershipQueryPanel from './OwnershipQueryPanel.vue'
import OwnershipManagePanel from './OwnershipManagePanel.vue'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()
const activeTab = ref('generate')
</script>

<style scoped>
.ownership-view {
  width: 100%;
  max-width: 1160px;
  min-width: 0;
  margin-inline: auto;
}
</style>
