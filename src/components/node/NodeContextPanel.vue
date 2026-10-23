<template>
  <section class="detail-panel">
    <n-divider title-placement="left">{{ t('node.workbench.context.title') }}</n-divider>
    <n-descriptions :column="2" label-placement="left" bordered size="small">
      <n-descriptions-item :label="t('node.workbench.context.reportedActiveTasks')">
        {{ count(node.runtimeState?.activeTaskCount) }}
      </n-descriptions-item>
      <n-descriptions-item :label="t('node.workbench.context.returnedTasks')">
        {{ node.tasks?.length ?? 0 }}
      </n-descriptions-item>
      <n-descriptions-item :label="t('node.workbench.context.linkedJobs')">
        {{ linkedJobs.length }}
      </n-descriptions-item>
    </n-descriptions>
    <p class="context-note">{{ t('node.workbench.context.description') }}</p>
    <div v-if="visibleJobs.length" class="job-list">
      <span class="job-list-label">{{ t('node.workbench.context.openJob') }}</span>
      <n-button
        v-for="job in visibleJobs"
        :key="job.jobId"
        size="tiny"
        class="job-button"
        @click="emit('open-job', job.jobId)"
      >
        <span class="job-id">{{ job.jobId }}</span>
        <span class="job-count">· {{ job.taskCount }}</span>
      </n-button>
      <span v-if="hiddenJobCount > 0" class="job-overflow">
        {{ t('node.workbench.context.jobsOverflow', { n: hiddenJobCount }) }}
      </span>
    </div>
    <p v-else class="context-empty">{{ t('node.workbench.context.noTasks') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/stores/i18n'
import { formatNodeCount as count, type NodeDetail } from './types'
import { collectNodeJobLinks } from './nodeWorkbenchModel'

const MAX_VISIBLE_JOBS = 6

const props = defineProps<{ node: NodeDetail }>()
const emit = defineEmits<{ (event: 'open-job', jobId: string): void }>()
const { t } = useI18n()

const linkedJobs = computed(() => collectNodeJobLinks(props.node.tasks))

const visibleJobs = computed(() => linkedJobs.value.slice(0, MAX_VISIBLE_JOBS))
const hiddenJobCount = computed(() => Math.max(0, linkedJobs.value.length - MAX_VISIBLE_JOBS))
</script>

<style scoped>
.detail-panel :deep(.n-divider) { margin-block: 18px 12px; }
.context-note {
  margin: 10px 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.55;
}
.job-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  margin-top: 10px;
}
.job-list-label {
  color: var(--apple-gray-3);
  font-size: 12px;
}
.job-button {
  min-width: 0;
  max-width: 100%;
  font-family: var(--apple-font-mono);
  font-size: 11px;
}
.job-id {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-count {
  margin-left: 4px;
  color: var(--apple-gray-3);
  font-variant-numeric: tabular-nums;
}
.job-overflow {
  color: var(--apple-gray-3);
  font-size: 12px;
}
.context-empty {
  margin: 10px 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
}
</style>
