<template>
  <n-card :title="t('node.title')" size="small" :bordered="true">
    <NodePanel />
  </n-card>
</template>

<script setup lang="ts">
import NodePanel from '@/components/node/NodePanel.vue'
import { useI18n } from '@/stores/i18n'
const { t } = useI18n()
</script>
