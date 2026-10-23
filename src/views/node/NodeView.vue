<template>
  <main class="node-page">
    <PageHeader
      :eyebrow="t('node.workbench.eyebrow')"
      :title="t('node.title')"
      :description="t('node.workbench.description')"
    >
      <template #meta>
        <span>{{ t('node.workbench.scopeHint') }}</span>
      </template>
      <template #actions>
        <n-button size="small" @click="openDashboard">
          {{ t('node.workbench.openTopology') }}
        </n-button>
      </template>
    </PageHeader>
    <NodePanel />
  </main>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import NodePanel from '@/components/node/NodePanel.vue'
import { useI18n } from '@/stores/i18n'

const router = useRouter()
const { t } = useI18n()

function openDashboard() {
  void router.push({ name: 'dashboard' })
}
</script>

<style scoped>
.node-page {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  width: 100%;
  max-width: var(--apple-content-max);
  min-width: 0;
}
</style>
