<template>
  <div>
    <OwnershipTreeQuery @operation="handleTreeOperation" />
    <OwnershipDataPanel v-model:result="manageResult" v-model:error="manageError" />
    <ResultCard :result="manageResult" :error="manageError" :title="t('ownership.operationResult')" max-width="640px" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ResultCard from '@/components/ResultCard.vue'
import OwnershipTreeQuery from './OwnershipTreeQuery.vue'
import OwnershipDataPanel from './OwnershipDataPanel.vue'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()
const manageResult = ref<any>(null)
const manageError = ref('')
function handleTreeOperation(result: any, error: string) {
  if (error) manageError.value = error
  else manageResult.value = result
}
</script>
