<template>
  <div class="ownership-manage">
    <WorkbenchSection
      :title="t('ownership.workbench.manage.lifecycleTitle')"
      :description="t('ownership.workbench.manage.lifecycleDescription')"
    >
      <OwnershipTreeManagement />
    </WorkbenchSection>

    <WorkbenchSection
      :title="t('ownership.workbench.manage.cellTitle')"
      :description="t('ownership.workbench.manage.cellDescription')"
      divided
    >
      <OwnershipDataPanel />
    </WorkbenchSection>
  </div>
</template>

<script setup lang="ts">
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import { useI18n } from '@/stores/i18n'
import OwnershipDataPanel from './OwnershipDataPanel.vue'
import OwnershipTreeManagement from './OwnershipTreeManagement.vue'

const { t } = useI18n()
</script>

<style scoped>
.ownership-manage {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  min-width: 0;
}
</style>
