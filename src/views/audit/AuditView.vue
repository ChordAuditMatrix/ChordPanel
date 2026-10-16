<template>
  <FormPage max-width="640px">
    <n-tabs type="line" size="small">
      <n-tab-pane name="tag" :tab="t('audit.tagGeneration')">
        <AuditTagGeneration
          v-model:owner-id="tagOwnerId"
          v-model:algorithm-id="tagAlgorithmId"
          @generated="generatedResult = $event"
          @layout="layoutResult = $event"
        />
        <AuditTaggedRanges
          :owner-id="tagOwnerId"
          :algorithm-id="tagAlgorithmId"
          :layout-result="layoutResult"
          :generated-result="generatedResult"
        />
      </n-tab-pane>
      <n-tab-pane name="challenge" :tab="t('audit.challengeProof')">
        <AuditChallenge />
      </n-tab-pane>
    </n-tabs>
  </FormPage>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import FormPage from '@/components/FormPage.vue'
import AuditTagGeneration from './AuditTagGeneration.vue'
import AuditTaggedRanges from './AuditTaggedRanges.vue'
import AuditChallenge from './AuditChallenge.vue'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()
const tagOwnerId = ref('1')
const tagAlgorithmId = ref('')
const layoutResult = ref<any>(null)
const generatedResult = ref<any>(null)
</script>
