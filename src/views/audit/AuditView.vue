<template>
  <FormPage max-width="640px">
    <n-tabs type="line" size="small">
      <n-tab-pane name="tag" :tab="t('audit.tagGeneration')">
        <n-card size="small" :bordered="true" :title="t('audit.generateTags')" style="margin-top: 12px;">
          <n-form :model="tagForm" label-placement="left" label-width="100">
            <n-form-item :label="t('audit.ownerId')" required>
              <UserSelect v-model="tagForm.ownerId" :placeholder="t('audit.selectOwner')" style="width:100%" />
            </n-form-item>
            <n-form-item :label="t('audit.algorithmId')" required>
              <AlgorithmSelect v-model="tagForm.algorithmId" purpose="Audit" :placeholder="t('audit.selectAlgorithm')" style="width:100%" />
            </n-form-item>
            <n-form-item :label="t('audit.blockStart')" required>
              <n-input-number v-model:value="tagForm.blockStart" :show-button="false" style="width:100%" :min="0" :placeholder="t('audit.blockStartPlaceholder', { max: Math.max(0, (layoutResult?.totalBlocks ?? 1) - 1) })" />
            </n-form-item>
            <n-form-item :label="t('audit.blockCount')" required>
              <n-input-number v-model:value="tagForm.blockCount" :show-button="false" style="width:100%" :min="1" :placeholder="t('audit.blockCountPlaceholder', { max: layoutResult?.totalBlocks ?? '?' })" />
            </n-form-item>
            <n-form-item :show-label="false">
              <n-space>
                <n-button type="primary" :loading="tagLoading" @click="handleGenerateTags">{{ t('audit.generateTags') }}</n-button>
                <n-button :loading="layoutLoading" @click="handleGetLayout">{{ t('audit.queryLayout') }}</n-button>
              </n-space>
            </n-form-item>
          </n-form>
          <n-descriptions v-if="layoutResult" :column="3" label-placement="left" bordered size="small" style="margin-top: 8px;">
            <n-descriptions-item :label="t('audit.totalBlocks')">{{ layoutResult.totalBlocks ?? '-' }}</n-descriptions-item>
            <n-descriptions-item :label="t('audit.totalUnits')">{{ layoutResult.totalUnits ?? '-' }}</n-descriptions-item>
            <n-descriptions-item :label="t('audit.blockSize')">{{ layoutResult.blockSize ?? 1024 }} B</n-descriptions-item>
          </n-descriptions>
        </n-card>

        <n-card v-if="tagResult" :title="t('audit.tagResult')" size="small" style="margin-top: 12px;">
          <JsonKeyValue :data="tagResult" />
        </n-card>

        <!-- Tagged range query -->
        <n-card v-if="layoutResult" size="small" style="margin-top: 12px;">
          <template #header>{{ t('audit.taggedRanges') }}{{ tagForm.algorithmId ? ` (${t('audit.algorithmId')}: ${tagForm.algorithmId === 'all' ? t('audit.allAlgorithms') : tagForm.algorithmId})` : '' }}</template>
          <n-form :model="rangeQueryForm" label-placement="left" label-width="100">
            <n-form-item :label="t('audit.rangeStart')">
              <n-input-number v-model:value="rangeQueryForm.rangeStart" :min="0" :max="Math.max(0, (layoutResult?.totalBlocks ?? 1) - 1)" size="small" style="width: 120px;" />
            </n-form-item>
            <n-form-item :label="t('audit.rangeCount')">
              <n-input-number v-model:value="rangeQueryForm.rangeCount" :min="1" :max="layoutResult?.totalBlocks ?? 1" size="small" style="width: 120px;" />
            </n-form-item>
            <n-form-item :show-label="false">
              <n-button :loading="rangeLoading" @click="handleGetRanges">{{ rangeResult ? t('audit.refreshRanges') : t('audit.getRanges') }}</n-button>
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
      </n-tab-pane>

      <n-tab-pane name="challenge" :tab="t('audit.challengeProof')">
        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <n-form :model="challengeForm" label-placement="left" label-width="100">
            <n-form-item :label="t('audit.ownerId')" required>
              <UserSelect v-model="challengeForm.ownerId" :placeholder="t('audit.selectOwner')" style="width:100%" />
            </n-form-item>
            <n-form-item :label="t('audit.algorithmId')" required><AlgorithmSelect v-model="challengeForm.algorithmId" purpose="Audit" style="width:100%" /></n-form-item>
            <n-form-item :label="t('audit.extraParams')">
              <KeyValueEditor v-model="challengeForm.params" :hint="challengeParamsHint" />
            </n-form-item>
            <n-form-item :show-label="false"><n-button type="primary" :loading="challengeLoading" @click="handleChallenge">{{ t('audit.initiateChallenge') }}</n-button></n-form-item>
          </n-form>
        </n-card>
        <n-card v-if="challengeResult" :title="t('audit.challengeResult')" size="small" style="margin-top: 12px;">
          <JsonKeyValue :data="challengeResult" />
        </n-card>
      </n-tab-pane>
    </n-tabs>
  </FormPage>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { generateTags, challengeProof, getBlockLayout, getTaggedRanges } from '@/api/audit'
import FormPage from '@/components/FormPage.vue'
import UserSelect from '@/components/UserSelect.vue'
import AlgorithmSelect from '@/components/AlgorithmSelect.vue'
import BlockGrid from '@/components/BlockGrid.vue'
import JsonKeyValue from '@/components/JsonKeyValue.vue'
import KeyValueEditor, { type KvHintItem } from '@/components/KeyValueEditor.vue'
import { trackJob } from '@/stores/jobTracking'
import { useI18n } from '@/stores/i18n'

const message = useMessage()
const { t } = useI18n()

// Tag generation: combined block layout query + tag generation + tagged ranges
const tagForm = ref({ ownerId: '1', tableId: 0, blockStart: 0, blockCount: 1, algorithmId: '' })
const tagLoading = ref(false)
const tagResult = ref<any>(null)

const challengeForm = ref({ ownerId: '1', algorithmId: '', params: {} as Record<string, string> })
const challengeLoading = ref(false)
const challengeResult = ref<any>(null)
const challengeParamsHint = computed<KvHintItem[]>(() => [
  { key: 'challengeCount', type: 'number', desc: t('audit.challengeCountHint') },
  { key: 'blockCount', type: 'number', desc: t('audit.blockCountHint') },
  { key: 'seed', type: 'number', desc: t('audit.seedHint') },
  { key: 'usePseudoRandom', type: 'boolean', desc: t('audit.usePseudoRandomHint') },
])

const layoutLoading = ref(false)
const layoutResult = ref<any>(null)

const rangeLoading = ref(false)
const rangeResult = ref<any[] | null>(null)
const rangeQueryForm = ref({ rangeStart: 0, rangeCount: 100 })

async function handleGetLayout() {
  if (!tagForm.value.ownerId.trim()) { message.warning(t('audit.selectOwnerWarn')); return }
  layoutLoading.value = true
  try {
    layoutResult.value = await getBlockLayout(tagForm.value.ownerId.trim(), 1024)
    // After layout is fetched, clamp the range count to the total block count
    const total = layoutResult.value?.totalBlocks ?? 100
    if (rangeQueryForm.value.rangeCount > total) {
      rangeQueryForm.value.rangeCount = total
    }
    if (rangeQueryForm.value.rangeStart >= total) {
      rangeQueryForm.value.rangeStart = 0
    }
  }
  catch (e: any) { message.error(e?.response?.data?.message || t('audit.layoutQueryFailed')) } finally { layoutLoading.value = false }
}

async function handleGenerateTags() {
  if (!tagForm.value.algorithmId.trim()) { message.warning(t('audit.fillAlgorithmWarn')); return }
  if (!tagForm.value.ownerId.trim()) { message.warning(t('audit.selectOwnerWarn')); return }
  tagLoading.value = true
  try {
    const res: any = await generateTags(tagForm.value.algorithmId.trim(), {
      algorithmId: tagForm.value.algorithmId.trim(),
      dataOwnerId: tagForm.value.ownerId.trim(),
      blockStart: tagForm.value.blockStart,
      blockCount: Math.max(1, tagForm.value.blockCount),
      blockSize: 1024,
    })
    tagResult.value = res
    message.success(t('audit.tagSubmitted'))
    if (res?.jobId) trackJob(res.jobId, 'Audit')
    // Refresh tagged ranges after submission
    handleGetRanges()
  } catch (e: any) { message.error(e?.response?.data?.message || t('audit.tagGenerateFailed')) } finally { tagLoading.value = false }
}

async function handleChallenge() {
  if (!challengeForm.value.algorithmId.trim()) { message.warning(t('audit.selectAlgorithmWarn')); return }
  if (!challengeForm.value.ownerId.trim()) { message.warning(t('audit.selectOwnerWarn')); return }
  challengeLoading.value = true
  try {
    const params: Record<string, string> = { algorithmId: challengeForm.value.algorithmId, ...challengeForm.value.params }
    const res: any = await challengeProof({
      initiatorId: '1',
      dataOwnerId: challengeForm.value.ownerId.trim(),
      params,
    })
    challengeResult.value = res
    message.success(t('audit.challengeSubmitted'))
    if (res?.jobId) trackJob(res.jobId, 'Audit')
  } catch (e: any) { message.error(e?.response?.data?.message || t('audit.challengeFailed')) } finally { challengeLoading.value = false }
}

async function handleGetRanges() {
  if (!tagForm.value.ownerId.trim()) return
  rangeLoading.value = true
  try {
    const res: any = await getTaggedRanges(tagForm.value.ownerId.trim(), tagForm.value.algorithmId.trim() || 'all')
    // Backend returns { ranges: [...] }; tolerate a possible items field
    rangeResult.value = res?.ranges ?? res?.items ?? []
  }
  catch (e: any) { message.error(e?.response?.data?.message || t('audit.rangeQueryFailed')) } finally { rangeLoading.value = false }
}
</script>

<style scoped>
</style>
