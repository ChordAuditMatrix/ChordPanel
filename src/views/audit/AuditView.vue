<template>
  <main class="audit-workbench">
    <PageHeader
      :eyebrow="t('audit.workbench.eyebrow')"
      :title="t('audit.workbench.title')"
      :description="t('audit.workbench.description')"
    >
      <template #actions>
        <n-button size="small" @click="openJobs">{{ t('audit.workbench.openJobs') }}</n-button>
      </template>
      <template #meta>
        <span>{{ t('audit.workbench.scopeNote') }}</span>
      </template>
    </PageHeader>

    <n-tabs v-model:value="activeTab" type="segment" size="small" class="audit-workbench__tabs">
      <n-tab-pane name="tag" :tab="t('audit.workbench.tabs.tag')">
        <AuditTagGeneration
          v-model:owner-id="dataOwnerId"
          @generated="generatedResult = $event"
          @layout="layoutState = $event"
        />
      </n-tab-pane>
      <n-tab-pane name="challenge" :tab="t('audit.workbench.tabs.challenge')">
        <AuditChallenge v-model:owner-id="dataOwnerId" />
      </n-tab-pane>
      <n-tab-pane name="ranges" :tab="t('audit.workbench.tabs.ranges')">
        <AuditTaggedRanges
          v-model:owner-id="dataOwnerId"
          :layout-result="layoutForCurrentOwner"
          :generated-result="generatedResult"
        />
      </n-tab-pane>
    </n-tabs>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import { useI18n } from '@/stores/i18n'
import type { AuditLayoutResult } from '@/utils/auditLayout'
import AuditTagGeneration from './AuditTagGeneration.vue'
import AuditTaggedRanges from './AuditTaggedRanges.vue'
import AuditChallenge from './AuditChallenge.vue'

const { t } = useI18n()
const router = useRouter()
const activeTab = ref('tag')
const dataOwnerId = ref('')
const generatedResult = ref<any>(null)
const layoutState = ref<{ ownerId: string; layout: AuditLayoutResult } | null>(null)
const layoutForCurrentOwner = computed(() =>
  layoutState.value?.ownerId === dataOwnerId.value.trim() ? layoutState.value.layout : null,
)

function openJobs() {
  void router.push({ name: 'jobs' })
}
</script>

<style scoped>
.audit-workbench {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  width: 100%;
  max-width: var(--apple-content-max);
  margin: 0 auto;
  min-width: 0;
  box-sizing: border-box;
}

.audit-workbench__tabs {
  min-width: 0;
}

.audit-workbench__tabs :deep(.n-tabs-pane-wrapper) {
  padding-top: var(--apple-space-4);
}
</style>
