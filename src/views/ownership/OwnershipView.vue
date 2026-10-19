<template>
  <FormPage max-width="640px">
    <n-tabs type="line" size="small" v-model:value="activeTab">
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
  </FormPage>
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

