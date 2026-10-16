<template>
  <JsonKeyValue v-if="structuredMessage !== null" :data="structuredMessage" :format-value="formatValue" />
  <n-code v-else-if="code && message" :code="message" />
  <span v-else>{{ message }}</span>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { NCode } from 'naive-ui'
import { parseJobStatusMessage } from '@/api/job'
import JsonKeyValue from '@/components/JsonKeyValue.vue'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { hasAuditTableReference } from '@/utils/auditTableReferences'

const props = withDefaults(defineProps<{ message?: string; code?: boolean }>(), { code: false })
const { ensureAuditTablesLoaded, formatValue } = useReferenceCatalog()
const structuredMessage = computed(() => parseJobStatusMessage(props.message))
watch(structuredMessage, value => {
  if (hasAuditTableReference(value)) void ensureAuditTablesLoaded()
}, { immediate: true })
</script>
