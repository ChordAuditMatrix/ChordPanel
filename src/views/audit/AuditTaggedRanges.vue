<template>
  <n-card v-if="layoutResult" size="small" style="margin-top: 12px;">
    <template #header>{{ t('audit.taggedRanges') }}{{ rangeResult ? ` (${t('audit.algorithmId')}: ${rangeScopeAlgorithmId})` : '' }}</template>
    <n-form :model="rangeQueryForm" label-placement="left" label-width="100">
      <n-form-item :label="t('audit.rangeStart')">
        <n-input-number v-model:value="rangeQueryForm.rangeStart" :min="0" :max="Math.max(0, (layoutResult?.totalBlocks ?? 1) - 1)" size="small" style="width: 120px;" />
      </n-form-item>
      <n-form-item :label="t('audit.rangeCount')">
        <n-input-number v-model:value="rangeQueryForm.rangeCount" :min="1" :max="layoutResult?.totalBlocks ?? 1" size="small" style="width: 120px;" />
      </n-form-item>
      <n-form-item :show-label="false" :feedback="rangeQueryAlgorithmId ? undefined : t('audit.rangeAlgorithmHint')">
        <n-button :loading="rangeLoading" :disabled="!ownerId.trim()" @click="handleGetRanges">{{ rangeResult ? t('audit.refreshRanges') : t('audit.getRanges') }}</n-button>
      </n-form-item>
    </n-form>
    <BlockGrid
      v-if="rangeResult && layoutResult"
      :total-blocks="layoutResult?.totalBlocks ?? 0"
      :tagged-ranges="rangeResult"
      :range-start="rangeQueryForm.rangeStart"
      :range-count="rangeQueryForm.rangeCount"
    />
  </n-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { getTaggedRanges } from '@/api/audit'
import BlockGrid from '@/components/BlockGrid.vue'
import { useI18n } from '@/stores/i18n'

const props = defineProps<{
  ownerId: string
  algorithmId: string
  layoutResult: any
  generatedResult: any
}>()
const message = useMessage()
const { t } = useI18n()
const rangeQueryForm = ref({ rangeStart: 0, rangeCount: 100 })
let rangeRequestSeq = 0
const rangeLoading = ref(false)
const rangeResult = ref<any[] | null>(null)
const rangeScopeAlgorithmId = ref('')

const rangeQueryAlgorithmId = computed<string | undefined>(() => {
  const explicitId = (props.algorithmId || '').trim()
  if (explicitId) return explicitId
  const generatedOwner = String(props.generatedResult?.ownerId ?? '')
  const generatedId = String(props.generatedResult?.algorithmId ?? '').trim()
  return generatedOwner === (props.ownerId || '').trim() && generatedId
    ? generatedId
    : undefined
})

watch(() => props.ownerId, () => {
  ++rangeRequestSeq
  rangeLoading.value = false
  rangeResult.value = null
  rangeScopeAlgorithmId.value = ''
})
watch(() => props.layoutResult, layout => {
  if (!layout) return
  const total = layout?.totalBlocks ?? 100
  if (rangeQueryForm.value.rangeCount > total) rangeQueryForm.value.rangeCount = total
  if (rangeQueryForm.value.rangeStart >= total) rangeQueryForm.value.rangeStart = 0
})
watch(() => props.generatedResult, result => {
  if (result) void fetchRanges(result.ownerId, result.algorithmId)
})

function isCurrentRangeScope(seq: number, ownerId: string, algorithmId?: string) {
  return seq === rangeRequestSeq
    && ownerId === (props.ownerId || '').trim()
    && algorithmId === rangeQueryAlgorithmId.value
}

async function fetchRanges(ownerId: string, algorithmId?: string) {
  if (!ownerId) return
  const requestedAlgorithmId = algorithmId?.trim() || undefined
  const seq = ++rangeRequestSeq
  rangeLoading.value = true
  try {
    const res: any = await getTaggedRanges(ownerId, requestedAlgorithmId)
    if (!isCurrentRangeScope(seq, ownerId, requestedAlgorithmId)) return
    rangeResult.value = res?.ranges ?? res?.items ?? []
    rangeScopeAlgorithmId.value = String(res?.algorithmId ?? requestedAlgorithmId ?? '')
  } catch (e: any) {
    if (isCurrentRangeScope(seq, ownerId, requestedAlgorithmId)) {
      message.error(e?.response?.data?.message || t('audit.rangeQueryFailed'))
    }
  } finally {
    if (seq === rangeRequestSeq) rangeLoading.value = false
  }
}

function handleGetRanges() {
  const ownerId = (props.ownerId || '').trim()
  if (!ownerId) { message.warning(t('audit.selectOwnerWarn')); return }
  return fetchRanges(ownerId, rangeQueryAlgorithmId.value)
}
</script>
